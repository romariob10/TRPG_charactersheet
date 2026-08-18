import type { RealtimeBus, RealtimeEvent, RealtimeListener } from "./realtime-bus.js";

export class LocalRealtimeBus implements RealtimeBus {
  private readonly characterListeners = new Map<string, Set<RealtimeListener>>();
  private readonly templateListeners = new Map<string, Set<RealtimeListener>>();
  private readonly topicListeners = new Map<string, Set<(data: unknown) => void>>();

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

  publishTopic(topic: string, data: unknown): void {
    const listeners = this.topicListeners.get(topic);
    for (const listener of listeners ?? []) {
      try {
        listener(data);
      } catch {}
    }
  }

  subscribeTopic(topic: string, listener: (data: unknown) => void): () => void {
    const listeners = this.topicListeners.get(topic) ?? new Set<(data: unknown) => void>();
    listeners.add(listener);
    this.topicListeners.set(topic, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.topicListeners.delete(topic);
    };
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
