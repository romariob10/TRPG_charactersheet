import type { RealtimeBus, RealtimeEvent, RealtimeListener } from "./realtime-bus.js";

export class LocalRealtimeBus implements RealtimeBus {
  private readonly characterListeners = new Map<string, Set<RealtimeListener>>();
  private readonly templateListeners = new Map<string, Set<RealtimeListener>>();

  publish(event: RealtimeEvent): void {
    const listeners =
      event.type === "catalog.progress"
        ? this.templateListeners.get(event.templateId)
        : this.characterListeners.get(event.characterId);
    for (const listener of listeners ?? []) {
      try {
        listener(event);
      } catch {
        // A disconnected observer must never turn an already committed write
        // into an HTTP failure for the user who made the change.
      }
    }
  }

  subscribe(characterId: string, listener: RealtimeListener): () => void {
    return this.subscribeTo(this.characterListeners, characterId, listener);
  }

  subscribeTemplate(templateId: string, listener: RealtimeListener): () => void {
    return this.subscribeTo(this.templateListeners, templateId, listener);
  }

  private subscribeTo(
    subscriptions: Map<string, Set<RealtimeListener>>,
    id: string,
    listener: RealtimeListener,
  ): () => void {
    const listeners = subscriptions.get(id) ?? new Set<RealtimeListener>();
    listeners.add(listener);
    subscriptions.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) subscriptions.delete(id);
    };
  }
}
