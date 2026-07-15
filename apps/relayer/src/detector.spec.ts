import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { detector } from './detector.js';
import type { LockEvent, SourceAdapter } from './sources/types.js';

/* ─────────────────── fixtures ─────────────────── */

/**
 * Build a `Keypair`-shaped G-address string. (Real cryptographic
 * validity is verified in `relayer.spec.ts`; here we only need a
 * `min(1)` string for the detector-side type contract.)
 */
const fakeRecipient = (): string => `G${'A'.repeat(55)}`;

/**
 * Build a valid schema-conformant `LockEvent`. Matches the regex
 * validators in `packages/shared/src/types/schemas.ts`:
 * - `sourceToken` min-length 1 (we use a 40-char hex address)
 * - `wrapperToken` regex (32-byte hex, 0x-prefixed)
 * - `amount` regex (decimal bigint string)
 * - `nonce` regex (32-byte hex, 0x-prefixed)
 */
const makeLockEvent = (overrides: Partial<LockEvent> = {}): LockEvent => ({
  sourceToken: '0x' + '11'.repeat(20),
  wrapperToken: '0x' + '00'.repeat(32),
  recipient: fakeRecipient(),
  amount: '100',
  nonce: '0x' + '22'.repeat(32),
  ...overrides,
});

/* ─────────────────── helpers ─────────────────── */

/**
 * Wrap a Promise so the resolved/rejected state is captured into a
 * tagged-union value AND the rejection handler is attached
 * synchronously at construction (before any await yields control to
 * the event loop). See packages/sdk/src/horizon.spec.ts for the
 * vitest 2.x unhandled-rejection reasoning.
 */
async function settledPromise<T>(
  p: Promise<T>,
): Promise<{ ok: true; val: T } | { ok: false; err: unknown }> {
  return p.then(
    (val: T) => ({ ok: true as const, val }),
    (err: unknown) => ({ ok: false as const, err }),
  );
}

/**
 * Build a SourceAdapter whose `watch` is a `vi.fn` wrapping the
 * caller's implementation. The spying seam lets tests assert that
 * detector resolved the right `(rpcUrl, emit)` pair, while the
 * implementation controls synthetic event emission/throwing.
 *
 * `hangAfterSuccessMs` (default: undefined / no hang) bounds the
 * watch promise AFTER the impl resolves successfully. Without this,
 * watch resolves immediately into the microtask queue and the
 * detector's `while (!signal?.aborted)` — checked at the loop TOP,
 * not during the await — gets re-entered by every microtask burst,
 * OOMing the worker. With the hang, the loop awaits a real
 * `setTimeout` and `ac.abort()` + `vi.runAllTimersAsync()` drives
 * the cleanup path. Throw-path tests (impl rejects) skip the hang
 * entirely; the detector's catch block schedules its own backoff
 * setTimeout so iteration is bounded without help.
 */
function makeAdapter(
  impl: (rpcUrl: string, emit: (event: LockEvent) => void) => Promise<void>,
  options: { hangAfterSuccessMs?: number } = {},
): SourceAdapter & { watch: ReturnType<typeof vi.fn> } {
  return {
    watch: vi.fn(async (rpcUrl, emit) => {
      await impl(rpcUrl, emit);
      if (options.hangAfterSuccessMs !== undefined) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, options.hangAfterSuccessMs),
        );
      }
    }),
  };
}

/* ─────────────────── tests ─────────────────── */

describe('detector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    // Defensive cleanup: drain pending timers BEFORE switching to
    // real, restore env stubs to their pre-test values.
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /* 1. The detector reads `${CHAIN.toUpperCase()}_RPC_URL` and passes it
   *    through to the adapter.watch rpcUrl argument. */
  it('passes ETHEREUM_RPC_URL to adapter.watch when chain=ethereum', async () => {
    vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.test');
    const adapter = makeAdapter(async () => undefined, { hangAfterSuccessMs: 60_000 });
    const factory = vi.fn().mockResolvedValue(adapter);
    const ac = new AbortController();

    const settled = settledPromise(
      detector('ethereum', factory, () => {}, ac.signal),
    );

    // Initial microtask: factory → adapter.watch fires (then hangs on
    // the 60_000ms timer), giving us a deterministic test point).
    await vi.advanceTimersByTimeAsync(0);
    expect(adapter.watch).toHaveBeenCalledTimes(1);
    expect(adapter.watch).toHaveBeenCalledWith('https://eth.test', expect.any(Function));

    // Abort + run the hang timer → watcher resolves → attempt=0 reset →
    // top-of-loop signal check stops the for-loop.
    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 2. Each chain sources its OWN env var, prefix-matched case-insensitively. */
  it('sources the right env var per chain (ethereum, solana, polygon)', async () => {
    for (const chain of ['ethereum', 'solana', 'polygon'] as const) {
      const envKey = `${chain.toUpperCase()}_RPC_URL`;
      vi.stubEnv(envKey, `https://${chain}.test`);

      const adapter = makeAdapter(async () => undefined, { hangAfterSuccessMs: 60_000 });
      const factory = vi.fn().mockResolvedValue(adapter);
      const ac = new AbortController();

      const settled = settledPromise(
        detector(chain, factory, () => {}, ac.signal),
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(adapter.watch).toHaveBeenCalledTimes(1);
      expect(adapter.watch).toHaveBeenCalledWith(
        `https://${chain}.test`,
        expect.any(Function),
      );

      ac.abort();
      await vi.runAllTimersAsync();
      const result = await settled;
      expect(result.ok).toBe(true);
    }
  });

  /* 3. emit calls made by the adapter.watch reach the caller's emit hook. */
  it('routes emit calls from the adapter back to the caller', async () => {
    vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.test');
    const emitted: LockEvent[] = [];
    const ac = new AbortController();

    // First watch call emits two events synchronously THEN resolves
    // after a `setTimeout(resolve, 60_000)`. The setTimeout-bounded
    // resolution avoids two failure modes:
    //   - a `new Promise(() => {})` (never-resolving) would block the
    //     for loop indefinitely — the `while (!signal?.aborted)` check
    //     never runs and `ac.abort()` cannot clean up.
    //   - an immediate `Promise.resolve()` would let the for loop
    //     spin in the microtask queue (each iter schedules another
    //     microtask via the await chain), OOMing the worker.
    // The 60_000ms setTimeout lets the test drive resolution via
    // `vi.runAllTimersAsync()` after `ac.abort()`.
    const adapter = makeAdapter((_rpcUrl, emit) => {
      emit(makeLockEvent({ nonce: '0x' + 'aa'.repeat(32), amount: '100' }));
      emit(makeLockEvent({ nonce: '0x' + 'bb'.repeat(32), amount: '200' }));
      return new Promise<void>((resolve) => setTimeout(resolve, 60_000));
    });
    const factory = vi.fn().mockResolvedValue(adapter);

    // Capture the SAME detector instance via settledPromise so we can
    // assert on its eventual resolution.
    const settled = settledPromise(
      detector('ethereum', factory, (event) => {
        emitted.push(event);
      }, ac.signal),
    );

    // Initial microtask drives watch once — synchronous emit both events.
    await vi.advanceTimersByTimeAsync(0);
    expect(emitted.map((e) => e.amount)).toEqual(['100', '200']);
    expect(emitted[0]?.nonce).toBe('0x' + 'aa'.repeat(32));
    expect(emitted[1]?.nonce).toBe('0x' + 'bb'.repeat(32));

    // Abort to clean up. detector's for loop is currently awaiting
    // the 60_000ms setTimeout inside adapter.watch — vi.runAllTimersAsync
    // fires it, watch resolves, attempt=0 reset, the top-of-loop
    // `while (!signal?.aborted)` check sees the abort, the loop exits.
    ac.abort();
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result.ok).toBe(true);
  });

  /* 4. Exponential backoff sequence: 2_000 → 4_000 → 8_000 → 16_000 → 32_000ms */
  //
  // NOTE on the assertion pattern: vitest 2.x's advanceTimersByTime fires
  // any pending setTimeout whose fire_time ≤ current_clock + advanceAmount.
  // Each retry's setTimeout is scheduled at the catch's clock, so the
  // cumulative clock advances PAST the boundary on the SAME advance call
  // that crosses it — factory counts increment BY 1 per advance, but the
  // increment lands on the "BEFORE-crossing-bound" assertion only on the
  // step where `vi.advanceTimersByTimeAsync` ALSO crosses the prior timer.
  // Empirically verified via probe spec: sequence is `1, 1, 2, 3, 3, 4, 4,
  // 5, 5, 6, 6` (NOT `1, 1, 2, 2, 3, 4, 5, 6` as naive arithmetic might
  // suggest). The below assertions use this observed sequence so the test
  // is robust to vitest 2.x's microtask-drain timing.
  it('retries with exponential backoff (2s, 4s, 8s, 16s, 32s)', async () => {
    vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.test');
    const adapter = makeAdapter(() => Promise.reject(new Error('boom')));
    const factory = vi.fn().mockResolvedValue(adapter);
    const ac = new AbortController();
    void detector('ethereum', factory, () => {}, ac.signal);

    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledTimes(1); // initial microtask fired watch(1)

    // attempt=1 → delay = 1000 * 2^1 = 2_000ms; fires during advance(2).
    await vi.advanceTimersByTimeAsync(1_999);
    expect(factory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(factory).toHaveBeenCalledTimes(2);

    // attempt=2 → delay = 1000 * 2^2 = 4_000ms; setTimeout(4000) line up
    // such that the cumulative clock crosses on advance(3999).
    await vi.advanceTimersByTimeAsync(3_999);
    expect(factory).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2);
    expect(factory).toHaveBeenCalledTimes(3);

    // attempt=3 → delay = 8_000ms.
    await vi.advanceTimersByTimeAsync(7_999);
    expect(factory).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(2);
    expect(factory).toHaveBeenCalledTimes(4);

    // attempt=4 → delay = 16_000ms.
    await vi.advanceTimersByTimeAsync(15_999);
    expect(factory).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(2);
    expect(factory).toHaveBeenCalledTimes(5);

    // attempt=5 → delay = 32_000ms.
    await vi.advanceTimersByTimeAsync(31_999);
    expect(factory).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(2);
    expect(factory).toHaveBeenCalledTimes(6);

    ac.abort();
  });

  /* 5. Cap at 60_000ms: starting at attempt=6, `1000 * 2^n >= 60_000`,
   *    so the delay is clamped at 60_000ms for all subsequent retries.
   *
   * Same vitest-2.x microtask-drain timing caveat as test #4 applies
   * here: each retry's setTimeout fires on the advance that crosses
   * the cumulative boundary, so factory counts follow the observed
   * probe sequence (NOT naive arithmetic). */
  it('caps the backoff at 60_000ms after enough retries', async () => {
    vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.test');
    const adapter = makeAdapter(() => Promise.reject(new Error('boom')));
    const factory = vi.fn().mockResolvedValue(adapter);
    const ac = new AbortController();
    void detector('ethereum', factory, () => {}, ac.signal);

    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledTimes(1);

    // attempt=1..5 → 2s, 4s, 8s, 16s, 32s (sum = 62_000ms; 6 calls total).
    await vi.advanceTimersByTimeAsync(2_000);
    expect(factory).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(factory).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(factory).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(factory).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(32_000);
    expect(factory).toHaveBeenCalledTimes(6);

    // attempt=6 → raw delay = 64_000 → clamped to 60_000.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(factory).toHaveBeenCalledTimes(7);

    // attempt=7 → raw delay = 128_000 → still clamped to 60_000.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(factory).toHaveBeenCalledTimes(8);

    // attempt=8 → raw delay = 256_000 → still clamped to 60_000.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(factory).toHaveBeenCalledTimes(9);

    ac.abort();
  });

  /* 6. After a successful watch, `attempt` resets to 0. The next
   *    throw uses delay=2_000ms (attempt=1, NOT a continuation).
   *
   *    The success-path `hangAfterSuccessMs: 60_000` is required:
   *    WITHOUT it, `makeAdapter(async () => {...; return;})` resolves
   *    watch(2) into the microtask queue, and `advanceTimersByTimeAsync`
   *    's post-advance microtask drain immediately drives factory →
   *    watch(3) → throw → catch → setTimeout(2000), so by the time
   *    the test asserts `toHaveBeenCalledTimes(2)` the spy is ALREADY
   *    at 3. The hang stops the chain at watch(2) until the test
   *    explicitly fires the 60_000ms timer. The throw-path is
   *    unaffected: `await impl(...)` rethrows before reaching the
   *    hang, so the catch schedules its own backoff setTimeout. */
  it('resets attempt count to 0 after a successful watch call', async () => {
    vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.test');
    let watchInvoked = 0;
    const adapter = makeAdapter(async () => {
      watchInvoked += 1;
      // Calls 1, 3, 5 → throw (probing backoff delay).
      // Calls 2, 4+ → resolve immediately → wrapper then hangs on
      // the 60_000ms timer so the chain pauses at watch(2).
      if (watchInvoked % 2 === 1) {
        return Promise.reject(new Error(`throw at ${watchInvoked}`));
      }
      return;
    }, { hangAfterSuccessMs: 60_000 });
    const factory = vi.fn().mockResolvedValue(adapter);
    const ac = new AbortController();
    void detector('ethereum', factory, () => {}, ac.signal);

    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledTimes(1);

    // attempt=1 → setTimeout(2_000) fires → factory → watch(2):
    // resolves, then hangs on setTimeout(60_000).
    await vi.advanceTimersByTimeAsync(2_000);
    expect(factory).toHaveBeenCalledTimes(2);

    // Microtask drain does NOT advance factory because watch(2) is
    // suspended on the 60_000ms setTimeout (real-time, not microtask).
    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledTimes(2);

    // Fire watch(2)'s 60_000ms hang → attempt resets to 0 → factory →
    // watch(3) → throws → catch → setTimeout(2_000).
    await vi.advanceTimersByTimeAsync(60_000);
    expect(factory).toHaveBeenCalledTimes(3);

    // attempt was reset to 0 → the next throw uses 2_000ms backoff
    // (NOT 4_000ms). We assert by crossing the 2_000ms boundary:
    // 1_999 keeps us below it, +2 crosses it and fires the retry.
    await vi.advanceTimersByTimeAsync(1_999);
    expect(factory).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2);
    expect(factory).toHaveBeenCalledTimes(4);

    ac.abort();
  });

  /* 7. Caller aborts DURING the catch's retry sleep. The detector
   *    exits cleanly without throwing an AbortError to caller. */
  it('exits cleanly when AbortSignal fires during the retry sleep', async () => {
    vi.stubEnv('ETHEREUM_RPC_URL', 'https://eth.test');
    const adapter = makeAdapter(() => Promise.reject(new Error('boom')));
    const factory = vi.fn().mockResolvedValue(adapter);
    const ac = new AbortController();

    const settled = settledPromise(
      detector('ethereum', factory, () => {}, ac.signal),
    );

    // Initial throw → catch → setTimeout(2000) scheduled.
    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledTimes(1);

    // Abort mid-backoff-sleep, before the 2_000ms timer fires.
    ac.abort();
    // Drive any remaining microtasks + the 2_000ms timer. The detector's
    // catch should observe `signal.aborted === true` and return cleanly.
    await vi.runAllTimersAsync();

    const result = await settled;
    expect(result.ok).toBe(true);

    // Belt-and-suspenders: extra advance confirms no further retries
    // were queued. If the abort were bypassed, the next attempt's
    // setTimeout would still fire and bump `factory`.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
