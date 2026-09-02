import { ModeStore } from './stores/ModeStore.js';
import { ToolStore } from './stores/ToolStore.js';
import { NetworkStore } from './stores/NetworkStore.js';
import { SelectionStore } from './stores/SelectionStore.js';
import { UIStore } from './stores/UIStore.js';
import { CommandStore } from './stores/CommandStore.js';
import { StructuralStore } from './stores/StructuralStore.js';
import { FurnitureStore } from './stores/FurnitureStore.js';

export class AppState {
  constructor() {
    this.mode = new ModeStore();
    this.tools = new ToolStore();
    this.network = new NetworkStore();
    this.selection = new SelectionStore();
    this.ui = new UIStore();
    this.commands = new CommandStore();
    this.structural = new StructuralStore();
    this.furniture = new FurnitureStore();

    this.listeners = [];

    this.mode.subscribe(() => this.notifyListeners());
    this.tools.subscribe(() => this.notifyListeners());
    this.network.subscribe(() => this.notifyListeners());
    this.selection.subscribe(() => this.notifyListeners());
    this.ui.subscribe(() => this.notifyListeners());
    this.commands.subscribe(() => this.notifyListeners());
    this.structural.subscribe(() => this.notifyListeners());
    this.furniture.subscribe(() => this.notifyListeners());
  }

  // ============================================================================
  // MODE DELEGATION
  // ============================================================================

  switchMode(newMode) {
    const success = this.mode.switchMode(newMode);
    if (success) {
      this.tools.clearActiveTool();
      this.selection.clearSelection();
    }
    return success;
  }

  getCurrentMode() {
    return this.mode.getCurrentMode();
  }

  getPreviousMode() {
    return this.mode.getPreviousMode();
  }

  getAvailableTools() {
    return this.mode.getAvailableTools();
  }

  isToolAvailable(toolName) {
    return this.mode.isToolAvailable(toolName);
  }

  // ============================================================================
  // TOOL DELEGATION
  // ============================================================================

  setActiveTool(toolName) {
    if (toolName && !this.isToolAvailable(toolName)) {
      console.warn(`Tool not available in ${this.getCurrentMode()} mode: ${toolName}`);
      return false;
    }
    return this.tools.setActiveTool(toolName);
  }

  // ============================================================================
  // NETWORK DELEGATION
  // ============================================================================

  addDevice(deviceData) {
    const device = this.network.addDevice(deviceData);
    if (device) {
      device.modeCreatedIn = this.getCurrentMode();
    }
    return device;
  }

  removeDevice(deviceId) {
    this.selection.deselectDevice(deviceId);
    return this.network.removeDevice(deviceId);
  }

  updateDevice(deviceId, updates) {
    return this.network.updateDevice(deviceId, updates);
  }

  getDevice(deviceId) {
    return this.network.getDevice(deviceId);
  }

  getAllDevices() {
    return this.network.getAllDevices();
  }

  addLink(linkData) {
    const link = this.network.addLink(linkData);
    if (link) {
      link.modeCreatedIn = this.getCurrentMode();
    }
    return link;
  }

  removeLink(linkId) {
    this.selection.deselectLink(linkId);
    return this.network.removeLink(linkId);
  }

  getLink(linkId) {
    return this.network.getLink(linkId);
  }

  getAllLinks() {
    return this.network.getAllLinks();
  }

  // ============================================================================
  // SELECTION DELEGATION
  // ============================================================================

  selectDevice(deviceId, multiSelect = false) {
    this.selection.selectDevice(deviceId, multiSelect);
  }

  deselectDevice(deviceId) {
    this.selection.deselectDevice(deviceId);
  }

  selectLink(linkId, multiSelect = false) {
    this.selection.selectLink(linkId, multiSelect);
  }

  deselectLink(linkId) {
    this.selection.deselectLink(linkId);
  }

  selectFurniture(furnitureId, multiSelect = false) {
    this.selection.selectFurniture(furnitureId, multiSelect);
  }

  deselectFurniture(furnitureId) {
    this.selection.deselectFurniture(furnitureId);
  }

  clearSelection() {
    this.selection.clearSelection();
  }

  getSelectedDeviceIds() {
    return this.selection.getSelectedDeviceIds();
  }

  getSelectedLinkIds() {
    return this.selection.getSelectedLinkIds();
  }

  getSelectedDevices() {
    return this.getSelectedDeviceIds()
      .map(id => this.getDevice(id))
      .filter(d => d !== undefined);
  }

  // ============================================================================
  // UI DELEGATION
  // ============================================================================

  togglePanel(panelName) {
    return this.ui.togglePanel(panelName);
  }

  setZoom(level) {
    this.ui.setZoom(level);
  }

  getZoom() {
    return this.ui.getZoom();
  }

  zoomIn(factor) {
    this.ui.zoomIn(factor);
  }

  zoomOut(factor) {
    this.ui.zoomOut(factor);
  }

  resetZoom() {
    this.ui.resetZoom();
  }

  setPanOffset(offset) {
    this.ui.setPanOffset(offset);
  }

  getPanOffset() {
    return this.ui.getPanOffset();
  }

  pan(deltaX, deltaY) {
    this.ui.pan(deltaX, deltaY);
  }

  toggleSnap() {
    return this.ui.toggleSnap();
  }

  setGridSize(size) {
    return this.ui.setGridSize(size);
  }

  getGridSize() {
    return this.ui.getGridSize();
  }

  // ============================================================================
  // COMMAND DELEGATION
  // ============================================================================

  pushCommand(command) {
    this.commands.pushCommand(command);
  }

  undo() {
    return this.commands.undo();
  }

  redo() {
    return this.commands.redo();
  }

  canUndo() {
    return this.commands.canUndo();
  }

  canRedo() {
    return this.commands.canRedo();
  }

  clearCommandHistory() {
    this.commands.clearHistory();
  }

  // ============================================================================
  // GLOBAL STATE MANAGEMENT
  // ============================================================================

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

  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this);
      } catch (error) {
        console.error('Error in AppState listener:', error);
      }
    });
  }

  reset() {
    this.mode = new ModeStore();
    this.tools = new ToolStore();
    this.network.reset();
    this.selection.clearSelection();
    this.ui.reset();
    this.commands.clearHistory();

    this.mode.subscribe(() => this.notifyListeners());
    this.tools.subscribe(() => this.notifyListeners());
    this.network.subscribe(() => this.notifyListeners());

    this.notifyListeners();
  }

  getSnapshot() {
    return {
      mode: {
        current: this.mode.current,
        previous: this.mode.previous
      },
      network: {
        devices: this.network.devices,
        links: this.network.links,
        metadata: this.network.metadata
      },
      selection: {
        selectedDeviceIds: this.selection.selectedDeviceIds,
        selectedFurnitureIds: this.selection.selectedFurnitureIds,
        selectedLinkIds: this.selection.selectedLinkIds,
        focusedId: this.selection.focusedId,
        focusedType: this.selection.focusedType
      },
      ui: {
        hierarchyPanelOpen: this.ui.hierarchyPanelOpen,
        propertiesPanelOpen: this.ui.propertiesPanelOpen,
        consoleOpen: this.ui.consoleOpen,
        zoomLevel: this.ui.zoomLevel,
        panOffset: this.ui.panOffset,
        snapEnabled: this.ui.snapEnabled,
        gridSize: this.ui.gridSize
      }
    };
  }

  loadSnapshot(snapshot) {
    if (snapshot.mode) {
      this.mode.current = snapshot.mode.current;
      this.mode.previous = snapshot.mode.previous;
    }
    if (snapshot.network) {
      this.network.devices = snapshot.network.devices || [];
      this.network.links = snapshot.network.links || [];
      if (snapshot.network.metadata) {
        this.network.metadata = snapshot.network.metadata;
      }
    }
    if (snapshot.selection) {
      this.selection.selectedDeviceIds = snapshot.selection.selectedDeviceIds || [];
      this.selection.selectedFurnitureIds = snapshot.selection.selectedFurnitureIds || [];
      this.selection.selectedLinkIds = snapshot.selection.selectedLinkIds || [];
      this.selection.focusedId = snapshot.selection.focusedId || null;
      this.selection.focusedType = snapshot.selection.focusedType || null;
    }
    if (snapshot.ui) {
      Object.assign(this.ui, snapshot.ui);
    }
    this.notifyListeners();
  }

  getDebugInfo() {
    return {
      currentMode: this.mode.current,
      deviceCount: this.network.devices.length,
      linkCount: this.network.links.length,
      selectedDevices: this.selection.selectedDeviceIds.length,
      selectedFurniture: this.selection.selectedFurnitureIds.length,
      selectedLinks: this.selection.selectedLinkIds.length,
      activeTool: this.tools.activeTool,
      isDragging: this.tools.isDragging,
      zoomLevel: this.ui.zoomLevel,
      undoStackSize: this.commands.undoStack.length,
      redoStackSize: this.commands.redoStack.length,
      listenerCount: this.listeners.length
    };
  }
}

const appState = new AppState();

export default appState;
