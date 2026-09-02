export class UIStore {
  constructor() {
    this.hierarchyPanelOpen = true;
    this.propertiesPanelOpen = true;
    this.consoleOpen = false;
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.snapEnabled = true;
    this.gridSize = 24;
    this.layerVisibility = {};
    this.activeFloorId = null;  // currently selected floor for 2D mode
    this.listeners = [];
  }

  togglePanel(panelName) {
    if (panelName in this) {
      this[panelName] = !this[panelName];
      this.notify();
      return this[panelName];
    }
    return null;
  }

  setPanelOpen(panelName, isOpen) {
    if (panelName in this && typeof this[panelName] === 'boolean') {
      this[panelName] = isOpen;
      this.notify();
      return isOpen;
    }
    return null;
  }

  setZoom(level) {
    this.zoomLevel = Math.max(0.1, Math.min(level, 5.0));
    this.notify();
  }

  getZoom() {
    return this.zoomLevel;
  }

  zoomIn(factor = 0.1) {
    this.setZoom(this.zoomLevel + factor);
  }

  zoomOut(factor = 0.1) {
    this.setZoom(this.zoomLevel - factor);
  }

  resetZoom() {
    this.setZoom(1.0);
  }

  setPanOffset(offset) {
    this.panOffset = { x: offset.x || 0, y: offset.y || 0 };
    this.notify();
  }

  getPanOffset() {
    return { ...this.panOffset };
  }

  pan(deltaX, deltaY) {
    this.panOffset.x += deltaX;
    this.panOffset.y += deltaY;
    this.notify();
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.notify();
    return this.snapEnabled;
  }

  setSnapEnabled(enabled) {
    this.snapEnabled = enabled;
    this.notify();
  }

  setGridSize(size) {
    if (size > 0) {
      this.gridSize = size;
      this.notify();
      return true;
    }
    return false;
  }

  setActiveFloor(floorId) {
    if (this.activeFloorId === floorId) {
      return floorId; // 🚫 prevents loop
    }

    this.activeFloorId = floorId;
    this.notify();
    return floorId;
  }


  getActiveFloor() {
    return this.activeFloorId;
  }

  getGridSize() {
    return this.gridSize;
  }

  setLayerVisibility(layerName, visible) {
    this.layerVisibility[layerName] = visible;
    this.notify();
  }

  isLayerVisible(layerName) {
    return this.layerVisibility[layerName] !== false;
  }

  reset() {
    this.hierarchyPanelOpen = true;
    this.propertiesPanelOpen = true;
    this.consoleOpen = false;
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.snapEnabled = true;
    this.gridSize = 24;
    this.layerVisibility = {};
    this.activeFloorId = null;
    this.notify();
  }
  subscribe(callback) {
    if (typeof callback !== 'function') {
      console.error('Listener must be a function');
      return () => {};
    }

    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notify() {
    if (this._notifying) return;

    this._notifying = true;

    this.listeners.forEach(listener => {
      try {
        listener(this);
      } catch (error) {
        console.error('Error in UIStore listener:', error);
      }
    });

    this._notifying = false;
  }
}
