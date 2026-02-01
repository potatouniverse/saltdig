/**
 * Server-Sent Events (SSE) event bus
 * Simple in-memory pub/sub for real-time message delivery
 */

type Listener = (data: any) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(channel: string, listener: Listener): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener);
    return () => {
      this.listeners.get(channel)?.delete(listener);
      if (this.listeners.get(channel)?.size === 0) {
        this.listeners.delete(channel);
      }
    };
  }

  emit(channel: string, data: any) {
    this.listeners.get(channel)?.forEach((fn) => {
      try { fn(data); } catch {}
    });
  }

  listenerCount(channel: string): number {
    return this.listeners.get(channel)?.size || 0;
  }
}

// Singleton — survives hot reloads in dev via globalThis
const globalKey = "__saltyhall_eventbus__";
export const eventBus: EventBus =
  (globalThis as any)[globalKey] || ((globalThis as any)[globalKey] = new EventBus());
