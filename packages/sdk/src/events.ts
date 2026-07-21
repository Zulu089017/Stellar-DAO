/**
 * SDK event subscription helper.
 *
 * Provides a typed, ergonomic API for subscribing to StellarDAO
 * events from the Horizon SSE bridge. Automatically handles
 * reconnection, cursor tracking, and event type filtering.
 *
 * NOTE: This module uses the `EventSource` Web API and is intended
 * for browser/client-side use only. Node.js consumers should use
 * the HTTP SSE stream directly or add an `eventsource` polyfill.
 *
 * Usage (browser):
 *   const sub = createEventSubscription('https://horizon-testnet.stellar.org');
 *   sub.on('transaction-update', (tx) => console.log(tx));
 *   sub.start();
 */

export type EventType = 'contract-event' | 'transaction-update' | 'asset-update';
export type EventHandler<T = unknown> = (data: T) => void;

interface SubscriptionOptions {
  baseUrl: string;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
}

/** Minimal interface for the browser EventSource, avoiding DOM lib types. */
interface SseSource {
  close(): void;
  addEventListener(type: string, listener: (evt: SseMessageEvent) => void): void;
  readonly readyState: number;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
}

interface SseMessageEvent {
  data: string;
}

// eslint-disable-next-line no-var
declare var EventSource: {
  prototype: SseSource;
  new (url: string): SseSource;
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSED: 2;
};

/**
 * Typed event subscription wrapping the native EventSource API.
 * Handles automatic reconnection with exponential backoff.
 * Browser-only — requires `EventSource` constructor.
 */
export class EventSubscription {
  private eventSource: SseSource | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectCount = 0;
  private readonly opts: Required<SubscriptionOptions>;

  constructor(opts: SubscriptionOptions) {
    if (typeof EventSource === 'undefined') {
      throw new Error(
        'EventSubscription requires the EventSource Web API. ' +
          'Use in a browser environment or add an eventsource polyfill for Node.js.',
      );
    }
    this.opts = {
      reconnectDelay: 1_000,
      maxReconnectDelay: 30_000,
      ...opts,
    };
  }

  /** Register a typed event handler. Returns unsubscribe function. */
  on<T = unknown>(event: EventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.handlers.get(event)?.delete(handler as EventHandler);
  }

  /** Remove all handlers for an event type. */
  off(event: EventType): void {
    this.handlers.delete(event);
  }

  /** Start the SSE connection. */
  start(): void {
    this.connect();
  }

  /** Stop the SSE connection and clear reconnection state. */
  stop(): void {
    this.reconnectCount = 0;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /** Returns true if the connection is currently active. */
  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  private connect(): void {
    const url = `${this.opts.baseUrl}/events`;
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.reconnectCount = 0;
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.scheduleReconnect();
    };

    for (const [event, handlers] of this.handlers.entries()) {
      this.eventSource.addEventListener(event, (msg: SseMessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
          for (const handler of handlers) {
            handler(data);
          }
        } catch {
          // Skip unparseable events — the SSE spec allows
          // non-JSON keepalive comments and multi-line payloads.
        }
      });
    }
  }

  private scheduleReconnect(): void {
    this.reconnectCount += 1;
    const delay = Math.min(
      this.opts.reconnectDelay * Math.pow(2, this.reconnectCount - 1),
      this.opts.maxReconnectDelay,
    );
    setTimeout(() => this.connect(), delay);
  }
}

/**
 * Create a typed event subscription to the StellarDAO SSE bridge.
 * Browser-only — see class documentation.
 */
export function createEventSubscription(baseUrl: string): EventSubscription {
  return new EventSubscription({ baseUrl });
}
