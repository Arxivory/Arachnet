export const VIEW_MODES = Object.freeze({
  LOGICAL: "logical",
  PHYSICAL: "physical",
  CAD: "cad",
  INTERACTIVE: "interactive",
});

export const VIEW_MODE_CONFIG = Object.freeze({
  [VIEW_MODES.LOGICAL]: { coordinateSpace: "logical-2d", floorBased: true },
  [VIEW_MODES.PHYSICAL]: { coordinateSpace: "floorplan-2d", floorBased: true },
  [VIEW_MODES.CAD]: { coordinateSpace: "building-3d", floorBased: true },
  [VIEW_MODES.INTERACTIVE]: { coordinateSpace: "building-3d", floorBased: false },
});

export class ViewController {
  constructor({ mode = VIEW_MODES.LOGICAL, floorId = null } = {}) {
    this.mode = null;
    this.floorId = null;
    this.lastFloorId = floorId;
    this.listeners = new Set();
    this.rendererFactories = new Map();
    this.activeRenderer = null;
    this.setMode(mode, { floorId });
  }

  get state() {
    return {
      mode: this.mode,
      floorId: this.floorId,
      ...VIEW_MODE_CONFIG[this.mode],
    };
  }

  registerRenderer(mode, factory) {
    this.requireMode(mode);
    if (typeof factory !== "function") throw new TypeError("Renderer factory must be a function.");
    this.rendererFactories.set(mode, factory);
    if (this.mode === mode && !this.activeRenderer) {
      this.setMode(mode, { floorId: this.floorId, force: true });
    }
    return () => {
      if (this.rendererFactories.get(mode) !== factory) return;
      this.rendererFactories.delete(mode);
      if (this.mode === mode) {
        this.activeRenderer?.dispose?.();
        this.activeRenderer = null;
      }
    };
  }

  setMode(mode, { floorId = this.lastFloorId, context = {}, force = false } = {}) {
    this.requireMode(mode);
    const config = VIEW_MODE_CONFIG[mode];
    const nextFloorId = config.floorBased ? floorId : null;
    if (!force && mode === this.mode && nextFloorId === this.floorId) return this.state;

    let nextRenderer = null;
    const factory = this.rendererFactories.get(mode);
    try {
      if (factory) {
        nextRenderer = factory({ ...context, mode, floorId: nextFloorId, ...config });
        nextRenderer?.initialize?.({ ...context, mode, floorId: nextFloorId, ...config });
      }
    } catch (error) {
      nextRenderer?.dispose?.();
      throw error;
    }

    this.activeRenderer?.dispose?.();
    this.activeRenderer = nextRenderer;
    this.mode = mode;
    this.floorId = nextFloorId;
    if (config.floorBased) this.lastFloorId = nextFloorId;
    this.notify();
    return this.state;
  }

  setFloor(floorId, context = {}) {
    if (!VIEW_MODE_CONFIG[this.mode].floorBased) {
      throw new Error("Interactive mode displays all floors and cannot select a single floor.");
    }
    if (floorId === null || floorId === undefined || floorId === "") {
      throw new TypeError("A floor-based view requires a floor id.");
    }
    return this.setMode(this.mode, { floorId, context });
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("A view listener must be a function.");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose() {
    this.activeRenderer?.dispose?.();
    this.activeRenderer = null;
    this.listeners.clear();
  }

  notify() {
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }

  requireMode(mode) {
    if (!Object.hasOwn(VIEW_MODE_CONFIG, mode)) {
      throw new RangeError(`Unknown rendering mode: ${mode}`);
    }
  }
}