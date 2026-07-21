/**
 * SDK event subscription helper.
 *
 * Provides a typed, ergonomic API for subscribing to StellarDAO
 * events from the Horizon SSE bridge. Automatically handles
 * reconnection, cursor tracking, and event type filtering.
 *
 * Usage:
 *   const sub = createEventSubscription(horizonUrl);
 *   sub.on('transaction-update', (tx) => console.log(tx));
 *   sub.on('asset-update', (asset) => console.log(asset));
 *   sub.start();
 *   // Later: sub.stop();
 */

import type { Transaction, AssetRegistryEntry } from '@stellardao/shared';

export type EventType = 'contract-event' | 'transaction-update' | 'asset-update';
export type EventHandler<T = unknown> = (data: T) => void;

interface SubscriptionOptions {
  baseUrl: string;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
}

export class EventSubscription {
  private eventSource: EventSource | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectCount = 0;
  private readonly opts: Required<SubscriptionOptions>;

  constructor(opts: SubscriptionOptions) {
    this.opts = {
      reconnectDelay: 1_000,
      maxReconnectDelay: 30_000,
      ...opts,
    };
  }

  /** Register a typed event handler. */
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

    // Wire up handlers for each registered event type.
    for (const [event, handlers] of this.handlers.entries()) {
      this.eventSource.addEventListener(event, (msg: MessageEvent) => {
        try {
          const data = JSON.parse(msg.data);
          for (const handler of handlers) {
            handler(data);
          }
        } catch {
          // Skip unparseable events.
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
 */
export function createEventSubscription(baseUrl: string): EventSubscription {
  return new EventSubscription({ baseUrl });
}
