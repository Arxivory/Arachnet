export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return () => listeners.delete(listener);
  }

  emit(eventName, detail) {
    for (const listener of this.listeners.get(eventName) ?? []) listener(detail);
  }
}
