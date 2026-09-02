import appState from '../state/AppState.js';
import LogicalLayout from '../core/layout/LogicalLayout.js';
import DeviceFactory from '../data/DeviceFactory.js';
import { createFurnitureInstance } from '../data/furnitureCatalog';
import Link from './network/Link.js';
import { validateConnection } from './utils/ValidateConnection.js';
import { showErrorModal, showConfirmationModal } from '../util/ErrorHandling.js';
import { CommandHistory } from './editor/CommandHistory.js';
import {
  CreateDomainCommand,
  CreateSiteCommand,
  CreateFloorCommand,
  CreateSpaceCommand,
  AddDeviceCommand,
  AddFurnitureCommand,
  RemoveDeviceCommand,
  RemoveDomainCommand,
  RemoveSiteCommand,
  RemoveFloorCommand,
  RemoveSpaceCommand,
  MoveCommand,
  DeleteEntityCommand
} from './editor/DrawingCommands.js';

// import QUICKSTART from './network/routing/QUICKSTART.js';

export class LogicalCanvasController {
  constructor(container, opts = {}) {
    this.counters = {
      domain: 0,
      site: 0,
      floor: 0,
      space: 0,
      conduit: 0,
      riser: 0,
      undergroundConduit: 0
    };

    // Map canvas entity IDs to structural entity IDs for tracking
    this.entityIdMap = new Map(); // canvas_id -> structural_id
    this.structuralToCanvasMap = new Map(); // structural_id -> canvas_id
    this._suppressDeviceAddedCommand = false;

    // --- ADD THIS TO THE BOTTOM OF THE CONSTRUCTOR ---
    this.positionSnapshot = new Map();
    // --- NEW: Global Listener for Entity Updates ---
    window.addEventListener('forceCanvasUpdate', (e) => {
        if (this.layout) {
            const { id, updates } = e.detail;
            const canvasEntity = this.layout.findEntityById(id);
            if (canvasEntity) {
                const isLogicalDevice =
                  canvasEntity.interfaces !== undefined ||
                  canvasEntity.catalogId !== undefined ||
                  typeof canvasEntity.tileX === 'number';

                if (isLogicalDevice) {
                    // Logical canvas devices use a 2D transform shape (`scale.factor`).
                    // The physical store uses a 3D transform shape (`scale.x/y/z`).
                    // Never overwrite the logical transform with the physical one.
                    const { transform, ...safeUpdates } = updates || {};
                    Object.assign(canvasEntity, safeUpdates);
                } else {
                    Object.assign(canvasEntity, updates);
                }
                // Ensure text properties sync
                if (updates.label !== undefined) {
                    canvasEntity.hostname = updates.label;
                    canvasEntity.name = updates.label;
                }
                this.layout._render(); // Force instant redraw
            }
        }
    });
    window.addEventListener('requestLinkUpdate', (e) => {
        const { linkId, cableType, endpointType, newDevice, clientX, clientY } = e.detail; 
        
        // Pass cableType as the 5th parameter
        this._handlePortSelect(newDevice, clientX, clientY, (selectedPort) => {
            if (!selectedPort) {
                this.layout._render();
                return; 
            }
            
            // 1. Execute the data update in the Store
            if (appState.network && typeof appState.network.updateLinkEndpoint === 'function') {
                appState.network.updateLinkEndpoint(linkId, endpointType, newDevice.id, selectedPort);
            }

            // 2. CRITICAL FIX: Sync the visual layout cable!
            if (this.layout && this.layout.cables) {
                const canvasCable = this.layout.cables.find(c => c.id === linkId);
                if (canvasCable) {
                    if (endpointType === 'source') {
                        canvasCable.sourceId = newDevice.id;
                        canvasCable.sourcePort = selectedPort;
                    } else {
                        canvasCable.targetId = newDevice.id;
                        canvasCable.targetPort = selectedPort;
                    }
                }
            }
            
            // 3. Force UI refresh so the cable visually snaps to the new device
            this.layout._render();
            
        }, cableType); 
    });

    window.addEventListener('requestLinkDeletion', (e) => {
        const { linkId, sourceName, targetName } = e.detail;
        
        showConfirmationModal(
            `Are you sure you want to delete the connection between ${sourceName} and ${targetName}?\n\nThe link will be removed and the device ports will become available again.`,
            "Confirm Deletion",
            () => {
                // If the user clicks "Delete Link", execute the deletion
                this.executeDelete(linkId);
                
                // Switch the tool back to select so they aren't stuck in delete mode
                if (appState.tools) {
                    appState.tools.setActiveTool('select');
                }
            }
        );
    });



    window.addEventListener('requestConduitDeletion', (e) => {
      const { conduitId } = e.detail;
      appState.structural.removeConduit(conduitId);
      this.layout.removeEntityById(conduitId);

      if (this.layout.routeManager) {
        this.layout.routeManager.clear();
        const links   = appState.network.getAllLinks();
        const devices = appState.network.getAllDevices();
        this.layout.routeManager.resolveAll(links, devices);
        this.layout._render();
      }
    });

    this.invalidMoveAlerted = new Set();
    this.pendingMoveEntities = new Map(); 
    window.addEventListener('pointerdown', () => {
        this.positionSnapshot.clear();
        this.pendingMoveEntities.clear();
        this.invalidMoveAlerted.clear();
        const st = appState.structural;
        if (!st) return;
        
        // Take a snapshot of every structure's X/Y before the drag starts
        const elements = [...(st.domains||[]), ...(st.sites||[]), ...(st.floors||[]), ...(st.spaces||[])];
        elements.forEach(el => {
            const x = Number(el.geometry ? el.geometry.x : (el.x || 0));
            const y = Number(el.geometry ? el.geometry.y : (el.y || 0));
            this.positionSnapshot.set(el.id, { x, y });
        });

        // Also snapshot all devices for drag undo/redo support
        const allDevices = typeof appState.getAllDevices === 'function' ? appState.getAllDevices() : [];
        allDevices.forEach(device => {
            const x = Number(device.transform?.position?.x || 0);
            const y = Number(device.transform?.position?.y || 0);
            this.positionSnapshot.set(device.id, { x, y });
        });
    }, { capture: true });

    // --- NEW: Global Keyboard Listener for Shortcuts & Deletions ---
    window.addEventListener('keydown', (e) => {
        // 1. GUARDRAIL: Let the browser handle shortcuts if the user is typing in a text box
        const activeElement = document.activeElement;
        const isTyping = activeElement.tagName === 'INPUT' || 
                         activeElement.tagName === 'TEXTAREA' || 
                         activeElement.isContentEditable;
        if (isTyping) return;

        // 2. TIME MACHINE SHORTCUTS (Undo / Redo)
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

        if (cmdOrCtrl) {
            // Undo: Ctrl + Z
            if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault(); // Stop browser's default undo
                this.undo();
                return; // Stop processing other keys
            }
            
            // Redo: Ctrl + Y (Windows) OR Ctrl + Shift + Z (Mac)
            if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
                e.preventDefault(); 
                this.redo();
                return; 
            }
        }

        // 3. DELETION SHORTCUTS (Backspace / Delete)
        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (!appState || !appState.selection) return;

            let ids = appState.selection.getSelectedDeviceIds();
            if (!ids || ids.length === 0) {
                const focused = appState.selection.getFocusedId();
                if (focused) ids = [focused];
            }

            if (ids && ids.length > 0) {
                const idToDelete = ids[0]; 

                if (appState.selection.focusedType === 'cable' && this.layout) {
                    const cable = this.layout.cables.find(c => c.id === idToDelete) || 
                                  appState.network?.getLink?.(idToDelete);
                                  
                    if (cable) {
                        const src = this.layout.findEntityById(cable.sourceId);
                        const dst = this.layout.findEntityById(cable.targetId);
                        
                        window.dispatchEvent(new CustomEvent('requestLinkDeletion', {
                            detail: {
                                linkId: cable.id,
                                sourceName: src?.label || src?.name || "Device",
                                targetName: dst?.label || dst?.name || "Device"
                            }
                        }));
                    }
                } else {
                    this.executeDelete(idToDelete);
                }
            }
        }
    });
    // ---------------------------------------------------

    // Add this to the bottom of your constructor
    this.lastKnownPositions = new Map();
    // -------------------------------------------------

    this.layout = new LogicalLayout({
      container,
      width: opts.width || 800,
      height: opts.height || 600,
      gridSize: opts.gridSize || 32,
      snap: opts.snap ?? true,

      onRectangleCreated: (rect) => this._handleShapeCreated(rect, 'rectangle'),
      onCircleCreated: (circle) => this._handleShapeCreated(circle, 'circle'),
      onPolygonCreated: (poly) => this._handleShapeCreated(poly, 'polygon'),
      onFreeformCreated: (freeform) => this._handleShapeCreated(freeform, 'freeform'),
      onWallCreated: (wall) => this._handleWallCreated(wall),
      onConduitCreated: (conduit) => this._handleConduitCreated(conduit),
      onRiserCreated: (riser) => this._handleRiserCreated(riser),
      onUndergroundConduitCreated: (ugConduit) => this._handleUndergroundConduitCreated(ugConduit),
      onCableCreated: (cable) => this._handleCableCreated(cable),
      onDeviceAdded: (device) => this._handleDeviceAdded(device),
      onDoorCreated: (door) => this._handleDoorCreated(door),
      onWindowCreated: (window) => this._handleWindowCreated(window),
      onFurnitureAdded: (furniture) => this._handleFurnitureAdded(furniture),
      onEntitySelected: (entity) => this._handleEntitySelected(entity),
      onPortSelect: (device, x, y, callback) => this._handlePortSelect(device, x, y, callback),
      onEntityChanged: (en, dx, dy) => this._handleEntityChanged(en, dx, dy)
    });

    // Initialize CommandHistory for undo/redo
    this.commandHistory = new CommandHistory(appState.commands);
  }

  // Helper method to determine if an entity is a furniture asset based on its properties
  _isFurnitureAsset(entity) {
    if (!entity || entity.sourceId || entity.targetId || entity.interfaces !== undefined) {
      return false;
    }

    return (
      entity.entityType === 'furniture' ||
      entity.type === 'furniture' ||
      ['desk', 'chair', 'rack', 'cabinet', 'table'].includes(entity.type) ||
      ['desk', 'chair', 'rack', 'cabinet', 'table'].includes(entity.catalogId) ||
      ['desk', 'chair', 'rack', 'cabinet', 'table'].includes(entity.modelId)
    );
  }

  destroy() {
    if (this.layout) {
      this.layout.destroy();
      this.layout = null;
    }
  }

  /**
   * Undo the last command
   */
  undo() {
    if (this.commandHistory) {
      this.commandHistory.undo();
      // Ensure canvas is refreshed after undo
      if (this.layout && typeof this.layout._render === 'function') {
        this.layout._render();
      }
    }
  }

  /**
   * Redo the last undone command
   */
  redo() {
    if (this.commandHistory) {
      this.commandHistory.redo();
      // Ensure canvas is refreshed after redo
      if (this.layout && typeof this.layout._render === 'function') {
        this.layout._render();
      }
    }
  }

  /**
   * Check if undo is available
   */
  canUndo() {
    return this.commandHistory ? this.commandHistory.canUndo() : false;
  }

  /**
   * Check if redo is available
   */
  canRedo() {
    return this.commandHistory ? this.commandHistory.canRedo() : false;
  }

  /**
   * Get the command store for UI subscriptions
   */
  getCommandStore() {
    return this.commandHistory ? this.commandHistory.getCommandStore() : null;
  }

  removeEntity(id) {
    if (!this.layout) return;

    // 1. Try removing it as a structural shape (Domain, Site, Floor, Space)
    if (typeof this.layout.removeShapeById === 'function') {
      this.layout.removeShapeById(id);
    }

    if (this.layout.cables) {
        const before = this.layout.cables.length;
        this.layout.cables = this.layout.cables.filter(c => c.id !== id);
        if (this.layout.cables.length < before) {
            this.layout._render?.();
            return; // was a cable, done
        }
    }

    // 2. Try removing it as a Device or Furniture
    if (typeof this.layout.removeDevice === 'function') {
      this.layout.removeDevice(id);
    }
    if (typeof this.layout.removeFurniture === 'function') {
      this.layout.removeFurniture(id);
    }
    
    // 3. Generic fallback just in case your layout engine uses a unified method
    if (typeof this.layout.removeEntity === 'function') {
      this.layout.removeEntity(id);
    }

    // 4. Force the canvas to re-draw so the shape instantly disappears
    if (typeof this.layout.render === 'function') {
      this.layout.render();
    } else if (typeof this.layout._render === 'function') {
      this.layout._render();
    }
  }

executeDelete(idToDelete) {
    // 1. Calculate how many items will be destroyed alongside this one
    const blastInfo = this._calculateBlastRadius(idToDelete);

    // 2. If children exist, throw the confirmation modal
    if (blastInfo.count > 0) {
        showConfirmationModal(
            `Are you sure you want to delete "${blastInfo.name}"?\n\nThis will permanently delete ${blastInfo.count} dependent item(s) located inside it.`,
            "Confirm Cascading Deletion",
            () => {
                this._commitDelete(idToDelete);
            }
        );
    } else {
        // 3. If it's empty (or just a standalone device), delete instantly
        this._commitDelete(idToDelete);
    }
  }

  _commitDelete(idToDelete) {
    // Stop bypassing the stack! Use the Time Machine.
    const command = new DeleteEntityCommand(appState, this, idToDelete);
    
    appState.pushCommand(command);
    command.execute();
  }

  setSize(w, h) {
    this.layout?.setSize(w, h);
  }

  setGridSize(size) {
    this.layout?.setGridSize(size);
  }

  restoreCanvasShape(structure, canvasId) {
    if (!this.layout?.shapeCreator || !structure) {
      return null;
    }

    // If we no longer have the previous canvas mapping, fall back to the structural id.
    if (!canvasId) {
      canvasId = structure.id;
    }

    // 1. Extract the structural metadata safely
    const structureType = structure.structureType || structure.type || '';
    
    // 2. CRITICAL FIX: The "Phantom Shape" Parser Shield
    // If the parser accidentally reads "Domain" or "Site" instead of a 2D shape type, force it back to a rectangle.
    let primitiveType = structure.shapeType || structure.type;
    if (!['rectangle', 'circle', 'polygon', 'freeform'].includes(primitiveType)) {
        primitiveType = 'rectangle'; 
    }

    const geom = structure.geometry || {};
    const x = Number(geom.x || 0);
    const y = Number(geom.y || 0);
    const w = Number(geom.width ?? geom.w ?? 0);
    const h = Number(geom.height ?? geom.h ?? 0);
    const r = Number(geom.radius ?? geom.r ?? 0);
    const points = Array.isArray(geom.points) ? geom.points : [];

    let shape = null;
    if (primitiveType === 'rectangle') {
      shape = this.layout.shapeCreator.createRectangle(
        { x, y },
        { x: x + w, y: y + h },
        structureType
      );
    } else if (primitiveType === 'circle') {
      shape = this.layout.shapeCreator.createCircle(
        { x, y },
        { x: x + r, y },
        structureType
      );
    } else if (primitiveType === 'polygon') {
      shape = this.layout.shapeCreator.createPolygon(points, structureType);
    } else if (primitiveType === 'freeform') {
      shape = this.layout.shapeCreator.createFreeform(points, structureType);
    }

    if (!shape) {
      return null;
    }

    shape.id = canvasId;
    shape.floorId = structure.floorId || null;
    if (shape.body) {
      shape.body.floorId = shape.floorId;
      shape.body.structType = structureType;
    }

    const containerMap = {
      rectangle: 'rectangles',
      circle: 'circles',
      polygon: 'polygons',
      freeform: 'freeforms'
    };
    const listName = containerMap[shape.type] || 'rectangles';

    if (Array.isArray(this.layout[listName])) {
      this.layout[listName].push(shape);
    }

    if (this.entityIdMap) {
      this.entityIdMap.set(canvasId, structure.id);
    }
    if (this.structuralToCanvasMap) {
      this.structuralToCanvasMap.set(structure.id, canvasId);
    }

    if (typeof this.layout._render === 'function') {
      this.layout._render();
    }

    return shape;
  }

restoreCanvasDevice(deviceData, canvasId, x, y) {
      if (!this.layout?.shapeCreator) return null;
      
      const safeX = x ?? deviceData.x ?? deviceData.position?.x ?? deviceData.transform?.position?.x ?? 0;
      const safeY = y ?? deviceData.y ?? deviceData.position?.y ?? deviceData.transform?.position?.y ?? 0;

      // FIX: Ensure hostname is checked! That's where Factory stores the real name.
      deviceData.label = deviceData.label || deviceData.name || deviceData.hostname || "Device";
      deviceData.name = deviceData.label;

      const layoutDevice = this.layout.shapeCreator.createDevice(
          deviceData, safeX, safeY, this.layout.shapeRenderer?.gridSize * 1.5 || 48
      );

      layoutDevice.id = canvasId || deviceData.id;
      layoutDevice.label = deviceData.label;
      layoutDevice.name = deviceData.name;
      layoutDevice.catalogId = deviceData.catalogId || deviceData.modelId;
      layoutDevice.floorId = deviceData.floorId;
      layoutDevice.spaceId = deviceData.spaceId;
      layoutDevice.iconHint = deviceData.iconHint;
      layoutDevice.isRehydration = true; 
      
      this.entityIdMap.set(layoutDevice.id, deviceData.id);
      this.structuralToCanvasMap.set(deviceData.id, layoutDevice.id);

      this.layout.devices.push(layoutDevice);
      this.layout._render();
      
      return layoutDevice;
  }

  restoreCanvasFurniture(furnitureData, canvasId, x, y) {
      if (!this.layout) return null;

      const fData = { ...furnitureData, id: canvasId || furnitureData.id };
      fData.x = x ?? fData.x ?? fData.transform?.position?.x ?? 0;
      fData.y = y ?? fData.y ?? fData.transform?.position?.y ?? 0;
      fData.isRehydration = true; 

      fData.label = fData.label || fData.name || "Furniture";
      fData.name = fData.label;

      // 🛑 ENGAGE TIME MACHINE LOCK: Stop the "Select Floor" modal loop!
      this._isRehydrating = true;

      // 🎨 PADDING FIX: Use the layout engine's native method! 
      // This automatically generates the white background box.
      if (typeof this.layout.addFurniture === 'function') {
          this.layout.addFurniture(fData, fData.x, fData.y);
      } else {
          if(!this.layout.furnitures) this.layout.furnitures = [];
          this.layout.furnitures.push(fData);
      }

      // 🟢 DISENGAGE TIME MACHINE LOCK
      this._isRehydrating = false;

      if (this.physicalController && this.physicalController.createFurnitureGLTFMesh) {
          this.physicalController.createFurnitureGLTFMesh(fData);
      }

      this.entityIdMap.set(fData.id, furnitureData.id);
      this.structuralToCanvasMap.set(fData.id, fData.id);

      this.layout._render();
      return fData;
  }
  enableSnap(enabled) {
    this.layout?.enableSnap(enabled);
  }

  startDrawRectangle(type = '') {
    this.layout?.startDrawRectangle(type);
  }

  startDrawCircle(type = '') {
    this.layout?.startDrawCircle(type);
  }

  startDrawPolygon(type = '') {
    this.layout?.startDrawPolygon(type);
  }

  startDrawFreeform(type = '') {
    this.layout?.startDrawFreeform(type);
  }

  startDrawWall() {
    this.layout?.startDrawWall();
  }

  startDrawConduit() {
    this.layout?.startDrawConduit();
  }

  startDrawRiser() {
    this.layout?.startDrawRiser();
  }

  startDrawUndergroundConduit() {
    this.layout?.startDrawUndergroundConduit();
  }

  startDrawDoor() {
    this.layout?.startDrawDoor();
  }

  startDrawWindow() {
    this.layout?.startDrawWindow();
  }

  startDrawCable() {
    this.layout?.startDrawCable();
  }

  startSelect() {
    this.layout?.startSelect();
  }

  startPan() {
    this.layout?.startPan();
  }

  cancelDrawing() {
    this.layout?.cancelDrawing();
  }

  getSnappedCoords(clientX, clientY) {
    return this.layout?.getSnappedCanvasCoords(clientX, clientY);
  }

  getEntityScreenPosition(entityId) {
    if (!this.layout || typeof this.layout.findEntityById !== 'function' || !this.layout.canvas) {
      return null;
    }

    let canvasEntity = this.layout.findEntityById(entityId);
    if (!canvasEntity && this.structuralToCanvasMap) {
      const mappedId = this.structuralToCanvasMap.get(entityId);
      if (mappedId) {
        canvasEntity = this.layout.findEntityById(mappedId);
      }
    }

    if (!canvasEntity) return null;

    const geom = canvasEntity.geometry || canvasEntity;
    const x = Number(geom.x ?? geom.left ?? 0);
    const y = Number(geom.y ?? geom.top ?? 0);
    let width = Number(geom.width ?? geom.w ?? 0);
    let height = Number(geom.height ?? geom.h ?? 0);

    if (geom.r !== undefined && Number.isFinite(geom.r)) {
      width = height = Number(geom.r) * 2;
    }

    const centerX = x + (width || 0) / 2;
    const centerY = y + (height || 0) / 2;
    const zoom = this.layout.pointerHandler.getZoom();
    const offset = this.layout.viewState || { e: 0, f: 0 };

    return {
      x: centerX * zoom + offset.e,
      y: centerY * zoom + offset.f,
    };
  }

  clear() {
    this.layout?.clear();
  }

  _applyCanvasEntityMoveById(entityId, dx, dy) {
    if (!this.layout || typeof this.layout.findEntityById !== 'function') {
      return null;
    }

    let canvasEntity = this.layout.findEntityById(entityId);
    if (!canvasEntity) {
      const mappedId = this.structuralToCanvasMap.get(entityId);
      if (mappedId) {
        canvasEntity = this.layout.findEntityById(mappedId);
      }
    }

    if (canvasEntity && typeof canvasEntity.move === 'function') {
      canvasEntity.move(dx, dy);
    }

    return canvasEntity;
  }

  _recordPendingMove(entityId, moveInfo) {
    if (!this.pendingMoveEntities.has(entityId)) {
      this.pendingMoveEntities.set(entityId, moveInfo);
    }
  }

  _getStructuralObjectById(structuralId) {
    const st = appState.structural;
    if (!st) return null;
    return (st.domains?.find(d => d.id === structuralId)
      || st.sites?.find(s => s.id === structuralId)
      || st.floors?.find(f => f.id === structuralId)
      || st.spaces?.find(sp => sp.id === structuralId)
      || null);
  }

  _getStructuralPosition(structure) {
    const geom = structure.geometry || structure;
    return {
      x: Number(geom.x ?? geom.left ?? 0),
      y: Number(geom.y ?? geom.top ?? 0)
    };
  }

  _isStructuralMoveWithinBounds(structure, shapeType, dx, dy) {
    if (!structure) return true;

    const getBounds = (shape) => {
      if (!shape) return null;
      const src = shape.geometry || shape;
      const x0 = Number(src.x ?? src.left ?? 0);
      const y0 = Number(src.y ?? src.top ?? 0);
      const w0 = Number(src.w ?? src.width ?? 0);
      const h0 = Number(src.h ?? src.height ?? 0);
      const minX0 = Math.min(x0, x0 + w0);
      const minY0 = Math.min(y0, y0 + h0);
      const maxX0 = Math.max(x0, x0 + w0);
      const maxY0 = Math.max(y0, y0 + h0);
      return {
        x: x0,
        y: y0,
        w: Math.abs(w0),
        h: Math.abs(h0),
        minX: minX0,
        minY: minY0,
        maxX: maxX0,
        maxY: maxY0
      };
    };

    const st = appState.structural;
    if (!st) return true;

    const childBounds = getBounds(structure);
    childBounds.minX += dx;
    childBounds.minY += dy;
    childBounds.maxX += dx;
    childBounds.maxY += dy;

    let parent = null;
    if (shapeType === 'site') {
      parent = st.domains?.find(d => d.id === structure.domainId);
    } else if (shapeType === 'floor') {
      parent = st.sites?.find(s => s.id === structure.siteId);
    } else if (shapeType === 'space') {
      parent = st.floors?.find(f => f.id === structure.floorId);
      if (parent && (!parent.geometry?.w && !parent.geometry?.h)) {
        const parentSite = st.sites?.find(s => s.id === parent.siteId);
        if (parentSite) {
          parent = parentSite;
        }
      }
    }

    if (!parent) {
      return true;
    }

    const parentBounds = getBounds(parent);
    if (parentBounds.w === 0 || parentBounds.h === 0) {
      return true;
    }

    const tol = 2;
    return !(
      childBounds.minX < parentBounds.minX - tol ||
      childBounds.minY < parentBounds.minY - tol ||
      childBounds.maxX > parentBounds.maxX + tol ||
      childBounds.maxY > parentBounds.maxY + tol
    );
  }

  applyStructuralMove(structuralId, shapeType, dx, dy, options = {}) {
    const structure = this._getStructuralObjectById(structuralId);
    if (!structure || (dx === 0 && dy === 0)) {
      return false;
    }

    const skipCanvasMove = options.skipCanvasMove === true;
    const skipBounds = options.skipBounds === true;

    if (!skipBounds && !this._isStructuralMoveWithinBounds(structure, shapeType, dx, dy)) {
      return false;
    }

    const moveItem = (item) => {
      if (!item) return;
      if (item.geometry) {
        item.geometry.x = Number(item.geometry.x) + dx;
        item.geometry.y = Number(item.geometry.y) + dy;
      } else {
        item.x = Number(item.x || 0) + dx;
        item.y = Number(item.y || 0) + dy;
      }
    };

    moveItem(structure);
    if (!skipCanvasMove) {
      this._applyCanvasEntityMoveById(structuralId, dx, dy);
    }

    let childSites = [];
    let childFloors = [];
    let childSpaces = [];
    const st = appState.structural;

    if (shapeType === 'domain') {
      childSites = st.sites.filter(s => s.domainId === structuralId);
      childFloors = st.floors.filter(f => childSites.some(s => s.id === f.siteId));
      childSpaces = st.spaces.filter(sp => childFloors.some(f => f.id === sp.floorId));
    } else if (shapeType === 'site') {
      childFloors = st.floors.filter(f => f.siteId === structuralId);
      childSpaces = st.spaces.filter(sp => childFloors.some(f => f.id === sp.floorId));
    } else if (shapeType === 'floor') {
      childSpaces = st.spaces.filter(sp => sp.floorId === structuralId);
    }

    const allChildStructures = [...childSites, ...childFloors, ...childSpaces];
    allChildStructures.forEach(child => {
      moveItem(child);
      this._applyCanvasEntityMoveById(child.id, dx, dy);
    });

    const floorIds = childFloors.map(f => f.id);
    if (shapeType === 'floor') floorIds.push(structuralId);

    const spaceIds = childSpaces.map(sp => sp.id);
    if (shapeType === 'space') spaceIds.push(structuralId);

    const moveItems = (items) => {
      (items || []).forEach(item => {
        if (floorIds.includes(item.floorId) || spaceIds.includes(item.spaceId)) {
          if (item.transform?.position) {
            item.transform.position.x = Number(item.transform.position.x || 0) + dx;
            item.transform.position.y = Number(item.transform.position.y || 0) + dy;
          } else {
            item.x = Number(item.x || 0) + dx;
            item.y = Number(item.y || 0) + dy;
          }
          if (!skipCanvasMove) {
            this._applyCanvasEntityMoveById(item.id, dx, dy);
          }
        }
      });
    };

    if (appState.network && typeof appState.network.getAllDevices === 'function') {
      moveItems(appState.network.getAllDevices());
      if (typeof appState.network.notify === 'function') {
        appState.network.notify();
      }
    }
    if (appState.furniture && appState.furniture.furnitures) {
      moveItems(appState.furniture.furnitures);
    }

    if (appState.structural && typeof appState.structural.notify === 'function') {
      appState.structural.notify();
    }

    if (typeof this.layout._render === 'function') {
      this.layout._render();
    }

    return true;
  }

  // applyDeviceMove(deviceId, dx, dy, options = {}) {
  //   if (dx === 0 && dy === 0) {
  //     return false;
  //   }

  applyDeviceMove(deviceId, dx, dy, options = {}) {
    if (dx === 0 && dy === 0) {
      return false;
    }

    const device = typeof appState.getDevice === 'function' ? appState.getDevice(deviceId) : null;
    if (!device) {
      return false;
    }

    device.transform = device.transform || { position: { x: 0, y: 0, z: 0 } };
    device.transform.position.x = Number(device.transform.position.x || 0) + dx;
    device.transform.position.z = Number(device.transform.position.z || 0) + dy;

    if (!options.skipCanvasMove) {
      this._applyCanvasEntityMoveById(deviceId, dx, dy);
    }

    if (appState.network && typeof appState.network.notify === 'function') {
      appState.network.notify();
    }

    if (typeof this.layout._render === 'function') {
      this.layout._render();
    }

    return true;
  }

  applyFurnitureMove(furnitureId, dx, dy, options = {}) {
    if (dx === 0 && dy === 0) {
      return false;
    }

    const furniture = appState.furniture?.getFurniture?.(furnitureId);
    if (!furniture) {
      return false;
    }

    furniture.transform = furniture.transform || {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };

    furniture.transform.position.x = Number(furniture.transform.position.x || 0) + (dx * 0.7);
    furniture.transform.position.z = Number(furniture.transform.position.z || 0) + (dy * 0.7);

    if (!options.skipCanvasMove) {
      this._applyCanvasEntityMoveById(furnitureId, dx, dy);
    }

    appState.furniture?.notify?.();

    if (typeof this.layout._render === 'function') {
      this.layout._render();
    }

    return true;
  }

  _commitPendingMoveCommands() {
    if (!this.pendingMoveEntities.size) {
      return;
    }

    this.pendingMoveEntities.forEach((moveInfo, entityId) => {
      if (moveInfo.kind === 'structure') {
        const startingPos = this.positionSnapshot.get(entityId);
        const model = this._getStructuralObjectById(entityId);
        if (!model || !startingPos) {
          return;
        }

        const currentPos = this._getStructuralPosition(model);
        const dx = Number(currentPos.x) - Number(startingPos.x);
        const dy = Number(currentPos.y) - Number(startingPos.y);
        if (dx === 0 && dy === 0) {
          return;
        }

        const moveCommand = new MoveCommand(appState, this, entityId, 'structure', moveInfo.structureType, dx, dy);
        this.commandHistory.executeCommand(moveCommand);
      } else if (moveInfo.kind === 'device') {
        const startingPos = this.positionSnapshot.get(entityId);
        if (!startingPos) {
          return;
        }

        const currentDevice = typeof appState.getDevice === 'function' ? appState.getDevice(entityId) : null;
        const currentX = Number(currentDevice?.transform?.position?.x || 0);
        const currentY = Number(currentDevice?.transform?.position?.y || 0);
        const dx = currentX - Number(startingPos.x);
        const dy = currentY - Number(startingPos.y);
        if (dx === 0 && dy === 0) {
          return;
        }

        const moveCommand = new MoveCommand(appState, this, entityId, 'device', null, dx, dy);
        this.commandHistory.executeCommand(moveCommand);
      }
    });

    this.pendingMoveEntities.clear();
  }

  setActiveFloor(floorId) {
    appState.ui.setActiveFloor(floorId); // ADDED: keep the global active floor in sync for shape creation and overlap checks
    this.layout?.setActiveFloor(floorId);
  }

  _getEntityBounds(entity) {
    if (!entity) return null;

    if (typeof entity.tileX === 'number' && typeof entity.tileY === 'number' &&
        typeof entity.tileWidth === 'number' && typeof entity.tileHeight === 'number') {
      return {
        minX: entity.tileX,
        minY: entity.tileY,
        maxX: entity.tileX + entity.tileWidth,
        maxY: entity.tileY + entity.tileHeight
      };
    }

    if (typeof entity.x === 'number' && typeof entity.y === 'number' &&
        typeof entity.width === 'number' && typeof entity.height === 'number') {
      return {
        minX: entity.x,
        minY: entity.y,
        maxX: entity.x + entity.width,
        maxY: entity.y + entity.height
      };
    }

    if (typeof entity.getCurrentBounds === 'function') {
      return entity.getCurrentBounds();
    }

    return null;
  }

  _getParentBounds(entity) {
    if (!entity || !appState.structural) return null;
    const st = appState.structural;
    const getBounds = (shape) => {
      if (!shape) return null;
      const src = shape.geometry || shape;
      const x = Number(src.x ?? src.left ?? 0);
      const y = Number(src.y ?? src.top ?? 0);
      const w = Number(src.w ?? src.width ?? 0);
      const h = Number(src.h ?? src.height ?? 0);
      const minX = Math.min(x, x + w);
      const minY = Math.min(y, y + h);
      const maxX = Math.max(x, x + w);
      const maxY = Math.max(y, y + h);
      return { minX, minY, maxX, maxY, width: Math.abs(w), height: Math.abs(h) };
    };

    if (entity.spaceId) {
      const space = st.spaces?.find(s => s.id === entity.spaceId);
      if (space) {
        return getBounds(space);
      }
    }

    if (entity.floorId) {
      const floor = st.floors?.find(f => f.id === entity.floorId);
      if (floor) {
        const floorBounds = getBounds(floor);
        if (floorBounds && floorBounds.width > 0 && floorBounds.height > 0) {
          return floorBounds;
        }
        const parentSite = st.sites?.find(s => s.id === floor.siteId);
        if (parentSite) {
          return getBounds(parentSite);
        }
      }
    }

    return null;
  }

  // _isEntityWithinAssignedParentBounds(entity) {
  //   const entityBounds = this._getEntityBounds(entity);
  //   const parentBounds = this._getParentBounds(entity);
  //   if (!entityBounds || !parentBounds) return true;

  _isEntityWithinAssignedParentBounds(entity) {
    const entityBounds = this._getEntityBounds(entity);
    const parentBounds = this._getParentBounds(entity);
    if (!entityBounds || !parentBounds) return true;
    const tol = 2;
//     return !(
//       entityBounds.minX < parentBounds.minX - tol ||
//       entityBounds.minY < parentBounds.minY - tol ||
//       entityBounds.maxX > parentBounds.maxX + tol ||
//       entityBounds.maxY > parentBounds.maxY + tol
//     );
//   }

// addDevice(deviceData, x, y) {
//     if (!this.layout) return;
    return !(
      entityBounds.minX < parentBounds.minX - tol ||
      entityBounds.minY < parentBounds.minY - tol ||
      entityBounds.maxX > parentBounds.maxX + tol ||
      entityBounds.maxY > parentBounds.maxY + tol
    );
  } 

   _getDuplicateSelection() {
    const deviceIds = appState.selection?.getSelectedDeviceIds?.() || [];
    const furnitureIds = appState.selection?.getSelectedFurnitureIds?.() || [];
    const focusedId = appState.selection?.getFocusedId?.();
    const focusedType = appState.selection?.focusedType;

    if (deviceIds.length || furnitureIds.length) {
      return { deviceIds, furnitureIds };
    }

    if (focusedId && focusedType === 'device') {
      return { deviceIds: [focusedId], furnitureIds: [] };
    }

    if (focusedId && focusedType === 'furniture') {
      return { deviceIds: [], furnitureIds: [focusedId] };
    }

    return { deviceIds: [], furnitureIds: [] };
  }

  _getEntityCanvasPosition(entity) {
    const layoutEntity = this.layout?.findEntityById?.(entity.id);
    if (layoutEntity && typeof layoutEntity.x === 'number' && typeof layoutEntity.y === 'number') {
      return { x: layoutEntity.x, y: layoutEntity.y };
    }

    if (entity.position && typeof entity.position.x === 'number' && typeof entity.position.y === 'number') {
      return { x: entity.position.x, y: entity.position.y };
    }

    const physicalPosition = entity.transform?.position;
    if (physicalPosition && typeof physicalPosition.x === 'number' && typeof physicalPosition.z === 'number') {
      return {
        x: physicalPosition.x / 0.7,
        y: physicalPosition.z / 0.7
      };
    }

    return { x: 0, y: 0 };
  }

  _getDuplicatePosition(entity, index) {
    const basePosition = this._getEntityCanvasPosition(entity);
    const offset = 48;
    const stagger = index * 12;

    return {
      x: basePosition.x + offset + stagger,
      y: basePosition.y + offset + stagger
    };
  }

  _buildDuplicateLabel(baseLabel, existingLabels = []) {
    const trimmedBase = (baseLabel || 'Item').trim();
    const existing = new Set(existingLabels.filter(Boolean));
    let nextLabel = `${trimmedBase} Copy`;
    let counter = 2;

    while (existing.has(nextLabel)) {
      nextLabel = `${trimmedBase} Copy ${counter++}`;
    }

    return nextLabel;
  }

  _copyPrimaryInterfaceIPv4(sourceDevice, targetDevice) {
    if (!Array.isArray(sourceDevice.interfaces) || !Array.isArray(targetDevice.interfaces)) {
      return;
    }

    sourceDevice.interfaces.forEach((sourceInterface, index) => {
      const targetInterface = targetDevice.interfaces[index];
      if (!targetInterface || !sourceInterface?.ipv4) return;

      const address = sourceInterface.ipv4.address || '';
      const subnetMask = sourceInterface.ipv4.subnetMask || '';

      if (typeof targetInterface.configureIPv4 === 'function') {
        targetInterface.configureIPv4(address, subnetMask);
      } else {
        targetInterface.ipv4 = {
          ...(targetInterface.ipv4 || {}),
          address,
          subnetMask
        };
      }
    });
  }

  _selectDuplicatedEntities(duplicatedIds = []) {
    if (!duplicatedIds.length || !appState.selection) return;

    appState.selection.clearSelection?.();

    duplicatedIds.forEach(({ id, type }, index) => {
      const multiSelect = index > 0;
      if (type === 'device') {
        appState.selection.selectDevice?.(id, multiSelect);
      } else if (type === 'furniture') {
        appState.selection.selectFurniture?.(id, multiSelect);
      }
    });
  }

  duplicateSelection() {
    if (!this.layout) return false;

    const { deviceIds, furnitureIds } = this._getDuplicateSelection();
    if (!deviceIds.length && !furnitureIds.length) {
      return false;
    }

    const existingDeviceLabels = [
      ...(this.layout.devices || []).map(device => device?.label || device?.name),
      ...(appState.network?.devices || []).map(device => device?.label || device?.name || device?.hostname)
    ];
    const existingFurnitureLabels = [
      ...(this.layout.furnitures || []).map(furniture => furniture?.label || furniture?.name),
      ...(appState.furniture?.furnitures || []).map(furniture => furniture?.label || furniture?.name)
    ];

    const duplicatedSelections = [];

    deviceIds.forEach((deviceId, index) => {
      const sourceDevice = appState.network?.getDevice?.(deviceId);
      if (!sourceDevice) return;

      const duplicatePosition = this._getDuplicatePosition(sourceDevice, index);
      const duplicateLabel = this._buildDuplicateLabel(
        sourceDevice.label || sourceDevice.name || sourceDevice.hostname,
        existingDeviceLabels
      );
      const catalogId = sourceDevice.catalogId || sourceDevice.modelId;
      if (!catalogId) return;

      const duplicatedDevice = DeviceFactory.create(catalogId, { ...duplicatePosition, z: 0 }, {
        hostname: duplicateLabel
      });

      duplicatedDevice.label = duplicateLabel;
      duplicatedDevice.name = duplicateLabel;
      duplicatedDevice.hostname = duplicateLabel;
      duplicatedDevice.floorId = sourceDevice.floorId || null;
      duplicatedDevice.spaceId = sourceDevice.spaceId || null;
      duplicatedDevice.defaultGateway = sourceDevice.defaultGateway || '';
      duplicatedDevice.modeCreatedIn = sourceDevice.modeCreatedIn || 'logical';

      this._copyPrimaryInterfaceIPv4(sourceDevice, duplicatedDevice);

      const layoutDevice = this.layout.shapeCreator.createDevice(
        duplicatedDevice,
        duplicatePosition.x,
        duplicatePosition.y,
        this.layout.shapeRenderer.gridSize * 1.5
      );

      layoutDevice.id = duplicatedDevice.id;
      layoutDevice.label = duplicatedDevice.label;
      layoutDevice.name = duplicatedDevice.name;
      layoutDevice.hostname = duplicatedDevice.hostname;
      layoutDevice.catalogId = duplicatedDevice.catalogId;
      layoutDevice.floorId = duplicatedDevice.floorId;
      layoutDevice.spaceId = duplicatedDevice.spaceId;

      this.layout.devices.push(layoutDevice);
      appState.network?.addDevice?.(duplicatedDevice);

      existingDeviceLabels.push(duplicateLabel);
      duplicatedSelections.push({ id: duplicatedDevice.id, type: 'device' });
    });

    furnitureIds.forEach((furnitureId, index) => {
      const sourceFurniture = appState.furniture?.getFurniture?.(furnitureId);
      if (!sourceFurniture) return;

      const duplicatePosition = this._getDuplicatePosition(sourceFurniture, index);
      const duplicateLabel = this._buildDuplicateLabel(
        sourceFurniture.label || sourceFurniture.name,
        existingFurnitureLabels
      );
      const catalogId = sourceFurniture.catalogId || sourceFurniture.modelId || sourceFurniture.type;
      if (!catalogId) return;

      const duplicatedFurniture = createFurnitureInstance(catalogId, { ...duplicatePosition, z: 0 }, {
        name: duplicateLabel
      });

      duplicatedFurniture.catalogId = catalogId;
      duplicatedFurniture.modelId = catalogId;
      duplicatedFurniture.label = duplicateLabel;
      duplicatedFurniture.name = duplicateLabel;
      duplicatedFurniture.floorId = sourceFurniture.floorId || null;
      duplicatedFurniture.spaceId = sourceFurniture.spaceId || null;
      duplicatedFurniture.rotation = sourceFurniture.rotation || 0;
      duplicatedFurniture.properties = {
        ...(sourceFurniture.properties || {})
      };
      duplicatedFurniture.modeCreatedIn = sourceFurniture.modeCreatedIn || 'logical';

      this.layout.addFurniture({ ...duplicatedFurniture }, duplicatePosition.x, duplicatePosition.y);
      appState.furniture?.addFurniture?.(duplicatedFurniture);
      this.physicalController?.createFurnitureGLTFMesh?.(duplicatedFurniture);

      existingFurnitureLabels.push(duplicateLabel);
      duplicatedSelections.push({ id: duplicatedFurniture.id, type: 'furniture' });
    });

    if (!duplicatedSelections.length) {
      return false;
    }

    this.layout._render();
    this._selectDuplicatedEntities(duplicatedSelections);
    return true;
  }

   addDevice(deviceData, x, y) {
    if (!this.layout) return;
    if (deviceData.entityType === 'furniture') return this.addFurniture(deviceData, x, y);

    const focusedType = appState.selection.focusedType;
    const focusedId = appState.selection.focusedId;

    if (focusedType !== 'floor' && focusedType !== 'space') {
        showErrorModal("Please select a floor or space in the hierarchy before adding a device.", "Invalid Selection");
        return;
    }

    if (this.layout && typeof this.layout.isPointInsideShape === 'function') {
        const canvasParentId = this.structuralToCanvasMap.get(focusedId) || focusedId;
        const dropIsInsideParent = this.layout.isPointInsideShape(canvasParentId, x, y);
        if (!dropIsInsideParent) {
            const prettyTypeName = focusedType.charAt(0).toUpperCase() + focusedType.slice(1);
            showErrorModal(`Placement Failed.\nYou dropped the item outside the physical area of the selected ${prettyTypeName}.`, "Out of Bounds Error");
            return; 
        }
    }

    if (focusedType === 'floor' && appState.structural && appState.structural.spaces) {
        const spacesOnFloor = appState.structural.spaces.filter(s => s.floorId === focusedId);
        const droppedInsideSpace = spacesOnFloor.find(space => {
            const canvasSpaceId = this.structuralToCanvasMap.get(space.id) || space.id;
            return this.layout.isPointInsideShape(canvasSpaceId, x, y);
        });
        if (droppedInsideSpace) {
            showErrorModal(`You dropped the device inside "${droppedInsideSpace.label}".\n\nTo place a device inside a Space, you must explicitly select that Space in the Hierarchy Panel first.`, "Specific Placement Required");
            return; 
        }
    }

    const catalogId = deviceData.modelId || deviceData.catalogId;
    if (!catalogId) return;

    try {
        // BUG 1 FIX: Don't forcefully overwrite the name! Let the Factory fetch the real catalog name.
        const providedLabel = deviceData.label || deviceData.displayName || deviceData.name;
        const opts = { id: deviceData.id, iconHint: deviceData.iconHint };
        
        // Only override if the user explicitly typed a custom name. Otherwise, let the Factory handle it.
        if (providedLabel && providedLabel.toLowerCase() !== 'device') {
            opts.hostname = providedLabel;
        }

        const newDevice = DeviceFactory.create(catalogId, { x, y, z: 0 }, opts);
        
        // Now extract the 100% accurate, Factory-approved base name!
        const baseName = newDevice.hostname;
        
        const existing = this.layout.devices.filter(d => d.name === baseName || d.label?.startsWith(baseName));
        let newLabel = baseName;
        if (existing.length > 0) newLabel = baseName + " (" + (existing.length + 1) + ")";

        newDevice.x = x;
        newDevice.y = y;
        newDevice.transform = newDevice.transform || { position: { x, y, z: 0 } };
        newDevice.transform.position.x = x * 0.7;
        newDevice.transform.position.z = y * 0.7;


        // newDevice.x = x;
        // newDevice.y = y;
        // newDevice.transform = newDevice.transform || { position: { x, y, z: 0 } };
        // newDevice.transform.position.x = x * 0.7;
        // newDevice.transform.position.z = y * 0.7;

        newDevice.label = newLabel;
        newDevice.name = newLabel;
        newDevice.iconHint = deviceData.iconHint; 


        if (focusedType === 'space') {
            newDevice.spaceId = focusedId;
            const space = appState.structural.spaces.find(s => s.id === focusedId);
            if (space) newDevice.floorId = space.floorId;

            const floor = appState.structural.floors.find(f => f.id === space.floorId);
            if (floor) newDevice.siteId = floor.siteId;
        } else if (focusedType === 'floor') {
            newDevice.floorId = focusedId;

            const floor = appState.structural.floors.find(f => f.id === focusedId);
            if (floor) newDevice.siteId = floor.siteId;
        }

        const command = new AddDeviceCommand(appState, this, newDevice, x, y);
        appState.pushCommand(command);
        command.execute();
    } catch (error) {
        showErrorModal("The selected object is not supported for placement yet.", "Unsupported Object");
    }
  }

  addFurniture(furnitureData, x, y) {
    if (!this.layout) return;

    const focusedType = appState.selection.focusedType;
    const focusedId = appState.selection.focusedId;

    if (focusedType !== 'floor' && focusedType !== 'space') {
        showErrorModal('Please select a floor or space in the hierarchy before adding furniture.', "Invalid Selection");
        return;
    }

    if (this.layout && typeof this.layout.isPointInsideShape === 'function') {
        const canvasParentId = this.structuralToCanvasMap.get(focusedId) || focusedId;
        const dropIsInsideParent = this.layout.isPointInsideShape(canvasParentId, x, y);
        if (!dropIsInsideParent) {
            const prettyTypeName = focusedType.charAt(0).toUpperCase() + focusedType.slice(1);
            showErrorModal(`Placement Failed.\nYou dropped the furniture outside the physical area of the selected ${prettyTypeName}.`, "Out of Bounds Error");
            return;
        }
    }

    if (focusedType === 'floor' && appState.structural && appState.structural.spaces) {
        const spacesOnFloor = appState.structural.spaces.filter(s => s.floorId === focusedId);
        const droppedInsideSpace = spacesOnFloor.find(space => {
            const canvasSpaceId = this.structuralToCanvasMap.get(space.id) || space.id;
            return this.layout.isPointInsideShape(canvasSpaceId, x, y);
        });
        if (droppedInsideSpace) {
            showErrorModal(`You dropped the furniture inside "${droppedInsideSpace.label}".\n\nTo place furniture inside a Space, you must explicitly select that Space in the Hierarchy Panel first.`, "Specific Placement Required");
            return;
        }
    }

    const catalogId = furnitureData.modelId || furnitureData.catalogId;
    if (!catalogId) return;

    try {
        const providedName = furnitureData.displayName || furnitureData.label || furnitureData.name || furnitureData.type || "Furniture";
        const newFurniture = createFurnitureInstance(catalogId, { x, y, z: 0 });
        
        newFurniture.x = x;
        newFurniture.y = y;
        newFurniture.transform = newFurniture.transform || { position: { x, y, z: 0 } };
        newFurniture.transform.position.x = x * 0.7;
        newFurniture.transform.position.z = y * 0.7;

        newFurniture.catalogId = catalogId; 
        newFurniture.label = providedName;
        newFurniture.iconHint = furnitureData.iconHint || "furniture";

        if (focusedType === 'space') {
            newFurniture.spaceId = focusedId;
            const space = appState.structural.spaces.find(s => s.id === focusedId);
            if (space) newFurniture.floorId = space.floorId;
        } else if (focusedType === 'floor') {
            newFurniture.floorId = focusedId;
        }

        const command = new AddFurnitureCommand(appState, this, newFurniture, x, y);
        appState.pushCommand(command);
        command.execute();
    } catch (error) {
        console.error("Failed to add furniture:", error.message);
    }
  }

  updateEntityTransform(id, updates) {
    this.layout?.updateEntityTransform(id, updates);
  }

  // =========================================================
  // STATE MANAGEMENT HANDLERS
  // =========================================================

_handlePortSelect(device, x, y, callback, overrideCableType = null) {
    const existingMenu = document.getElementById('canvas-port-menu');
    if (existingMenu) existingMenu.remove();

    console.log('🔌 _handlePortSelect called for device:', device.id, device.label);
    
    const realDevice = appState.network.getDevice?.(device.id);
    
    console.log('🔌 realDevice found:', realDevice);
    console.log('🔌 realDevice.ports:', realDevice?.ports);
    console.log('🔌 appState.getDevice:', typeof appState.getDevice);
    console.log('🔌 appState.network:', appState.network);

    if (!realDevice || !realDevice.ports || realDevice.ports.length === 0) {
      console.warn(`Device ${device.label} has no ports available.`);
      callback(null);
      return;
    }

    const usedPorts = new Set();
    if (this.layout && this.layout.cables) {
      this.layout.cables.forEach(cable => {
        if (cable.sourceId === device.id && cable.sourcePort) {
          usedPorts.add(cable.sourcePort?.name ?? cable.sourcePort);
        }
        if (cable.targetId === device.id && cable.targetPort) {
          usedPorts.add(cable.targetPort?.name ?? cable.targetPort);
        }
      });
    }

    const availablePorts = realDevice.ports.filter(port => !usedPorts.has(port.name));

    if (availablePorts.length === 0) {
      alert(`All ports on ${device.label} are currently in use!`);
      callback(null);
      return;
    }

    const menu = document.createElement('div');
    menu.id = 'canvas-port-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.backgroundColor = '#ffffff';
    menu.style.border = '1px solid #94a3b8';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    menu.style.padding = '4px 0';
    menu.style.zIndex = '9999';
    menu.style.minWidth = '140px';
    menu.style.maxHeight = '300px'; 
    menu.style.overflowY = 'auto';  
    menu.style.fontFamily = 'sans-serif';
    menu.style.fontSize = '12px';
    menu.style.color = '#0f172a';

    availablePorts.forEach(port => {
      const item = document.createElement('div');
      item.innerText = port.name;
      item.style.padding = '8px 16px';
      item.style.cursor = 'pointer';
      item.style.transition = 'background-color 0.1s';

      item.onmouseenter = () => item.style.backgroundColor = '#f1f5f9';
      item.onmouseleave = () => item.style.backgroundColor = '#ffffff';

      item.onclick = (e) => {
        e.stopPropagation();
        menu.remove();
        document.removeEventListener('pointerdown', outsideClickListener);
        callback(port);
      };

      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    const outsideClickListener = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('pointerdown', outsideClickListener);
        callback(null);
      }
    };

    setTimeout(() => {
      document.addEventListener('pointerdown', outsideClickListener);
    }, 10);
  }

_handleShapeCreated(shapeData, shapeType) {
    const { structureType, id, r, points } = shapeData;
    console.log(`📥 _handleShapeCreated: received shapeData with id=${id}, structureType=${structureType}`);

    // --- 1. TOP-LEVEL HIERARCHY PRE-CHECK ---
    // Stop invalid Domain creation BEFORE overlap or bounds logic runs
    if (structureType === 'Domain') {
      const selectedType = appState.selection?.focusedType;
      
      if (selectedType === 'site' || selectedType === 'floor' || selectedType === 'space') {
        showErrorModal(
          `You cannot create a Domain while a ${selectedType} is selected. Domains are top-level structures. Please click the canvas background to deselect before drawing.`, 
          "Invalid Hierarchy"
        );
        
        // Remove the invalid shape immediately
        setTimeout(() => {
          if (this.layout && typeof this.layout.removeShapeById === 'function') {
             this.layout.removeShapeById(id);
          }
        }, 10);
        if (appState.tools) appState.tools.setActiveTool('pointer');
        
        return; // Halt the function completely so overlap checks don't run
      }
    }

    // --- 2. BULLETPROOF BOUNDS EXTRACTOR ---
    // Safely extracts coordinates, forces them to be numbers, and handles missing widths
    // Also handles circular shapes by converting radius to bounding box
    const getBounds = (shape) => {
      if (!shape) return null;
      // Handle both raw shape data and state-wrapped shapes (like geometry)
      const src = shape.geometry || shape;
      
      // If it's a circle, calculate bounding box from center and radius
      if (src.r !== undefined && src.r !== null) {
        const cx = Number(src.x ?? 0);
        const cy = Number(src.y ?? 0);
        const r = Number(src.r ?? 0);
        return {
          minX: cx - r, maxX: cx + r,
          minY: cy - r, maxY: cy + r,
          w: r * 2, h: r * 2, x: cx - r, y: cy - r, r
        };
      }
      
      let x = Number(src.x ?? src.left ?? 0);
      let y = Number(src.y ?? src.top ?? 0);
      let w = Number(src.w ?? src.width ?? 0);
      let h = Number(src.h ?? src.height ?? 0);
      
      // If width/height are missing, calculate them from maxX/maxY
      if (!w && src.maxX !== undefined) w = Number(src.maxX) - x;
      if (!h && src.maxY !== undefined) h = Number(src.maxY) - y;

      return {
        minX: Math.min(x, x + w), maxX: Math.max(x, x + w),
        minY: Math.min(y, y + h), maxY: Math.max(y, y + h),
        w: Math.abs(w), h: Math.abs(h), x, y
      };
    };

    // Prepare child coordinates for boundary checks and saving
    const cBounds = getBounds(shapeData);
    const x = cBounds.x, y = cBounds.y, w = cBounds.w, h = cBounds.h;
    const maxX = cBounds.maxX, maxY = cBounds.maxY;

    const removeInvalidShape = () => {
      setTimeout(() => {
        if (this.layout && typeof this.layout.removeShapeById === 'function') {
           this.layout.removeShapeById(id);
        }
      }, 10);
      if (appState.tools) appState.tools.setActiveTool('pointer');
    };

    // --- 3. BOUNDARY CHECKING LOGIC ---
    const checkParentBounds = (parentId, parentType) => {
      let parent = null;
      const st = appState.structural;
      
      if (parentType === 'domain') {
        parent = (st.domains || []).find(d => d.id === parentId);
      } 
      else if (parentType === 'site') {
        parent = (st.sites || []).find(s => s.id === parentId);
      } 
      else if (parentType === 'floor') {
        parent = (st.floors || []).find(f => f.id === parentId);
        
        // --- AUTO-GENERATED FLOOR FALLBACK ---
        // If the floor exists but has no intrinsic width/height because it was auto-generated,
        // we borrow the exact dimensions from the Site it belongs to.
        if (parent) {
          const tempBounds = getBounds(parent);
          if (tempBounds.w === 0 || tempBounds.h === 0) {
            const parentSite = (st.sites || []).find(s => s.id === parent.siteId);
            if (parentSite) {
              console.log(`Borrowing bounds from Site (ID: ${parentSite.id}) for auto-generated Floor.`);
              parent = parentSite; 
            } else {
              console.warn("Could not find the parent Site to borrow bounds from!");
            }
          }
        }
      }

      if (!parent) {
        console.error(`Bounds Check: Parent ${parentType} (ID: ${parentId}) not found in state.`);
        return false; 
      }

      const pBounds = getBounds(parent);

      // We only flag stale state if BOTH the floor AND its fallback site have 0 dimensions
      if (pBounds.w === 0 || pBounds.h === 0) {
         console.warn(`Bounds Check: The selected ${parentType} has 0 width/height in state. It was likely drawn before the code fix. Please delete it and redraw it.`);
         return false; 
      }

      const tol = 5; 

      if (
        cBounds.minX < pBounds.minX - tol || 
        cBounds.minY < pBounds.minY - tol || 
        cBounds.maxX > pBounds.maxX + tol || 
        cBounds.maxY > pBounds.maxY + tol
      ) {
        console.error("Out of Bounds Mathematical Failure:");
        console.table({
           "Parent Limits (Borrowed from Site)": { MinX: pBounds.minX, MinY: pBounds.minY, MaxX: pBounds.maxX, MaxY: pBounds.maxY },
           "Child Limits (Space)": { MinX: cBounds.minX, MinY: cBounds.minY, MaxX: cBounds.maxX, MaxY: cBounds.maxY }
        });
        return false; 
      }
      return true; 
    };

    // --- 4. SHAPE ROUTING - Execute commands for undo/redo tracking ---
// --- 4. SHAPE ROUTING - Execute commands for undo/redo tracking ---
    if (structureType === 'Domain') {
      const domainData = {
        id, shapeType, structureType: 'Domain',
        x, y, w, h, maxX, maxY, r, points,
        // CRITICAL FIX: Match the exact property names expected by the Class constructors
        geometry: { x, y, width: w, height: h, radius: r, points }, 
        label: `Domain ${this.counters.domain++}`
      };
      console.log(`🏢 Creating Domain with id=${domainData.id}`);
      const command = new CreateDomainCommand(appState, this, domainData, id);
      this.commandHistory.executeCommand(command);
    }
    else if (structureType === 'Site') {
      const parentId = appState.selection.focusedType === 'domain' ? appState.selection.focusedId : null;
      if (!parentId) {
        showErrorModal("A Domain must be selected from the Hierarchy panel before creating a Site.", "Invalid Hierarchy");
        return removeInvalidShape();
      }
      if (!checkParentBounds(parentId, 'domain')) {
        showErrorModal("The Site exceeds the physical boundaries of the selected Domain.", "Out of Bounds Error");
        return removeInvalidShape();
      }
      const siteData = {
        id, shapeType, structureType: 'Site',
        x, y, w, h, maxX, maxY, r, points,
        geometry: { x, y, width: w, height: h, radius: r, points }, 
        label: `Site ${this.counters.site++}`
      };
      console.log(`🏪 Creating Site with id=${siteData.id}, domainId=${parentId}`);
      const command = new CreateSiteCommand(appState, this, siteData, parentId, id);
      this.commandHistory.executeCommand(command);
    } 
    else if (structureType === 'Floor') {
      const parentId = appState.selection.focusedType === 'site' ? appState.selection.focusedId : null;
      if (!parentId) {
        showErrorModal("A Site must be selected from the Hierarchy panel before creating a Floor.", "Invalid Hierarchy");
        return removeInvalidShape();
      }
      if (!checkParentBounds(parentId, 'site')) {
        showErrorModal("The Floor exceeds the physical boundaries of the selected Site.", "Out of Bounds Error");
        return removeInvalidShape();
      }
      const floorData = {
        id, shapeType, structureType: 'Floor',
        x, y, w, h, maxX, maxY, r, points,
        geometry: { x, y, width: w, height: h, radius: r, points }, 
        label: `Floor ${this.counters.floor++}`
      };
      console.log(`🏗️ Creating Floor with id=${floorData.id}, siteId=${parentId}`);
      const command = new CreateFloorCommand(appState, this, floorData, parentId, id);
      this.commandHistory.executeCommand(command);
    }
    else if (structureType === 'Space') {
      const parentId = appState.selection.focusedType === 'floor' ? appState.selection.focusedId : null;
      if (!parentId) {
        showErrorModal("A Floor must be selected from the Hierarchy panel before creating a Space.", "Invalid Hierarchy");
        return removeInvalidShape();
      }
      if (!checkParentBounds(parentId, 'floor')) {
        showErrorModal("The Space exceeds the physical boundaries of the selected Floor.", "Out of Bounds Error");
        return removeInvalidShape();
      }
      const spaceData = {
        id, shapeType, structureType: 'Space',
        x, y, w, h, maxX, maxY, r, points,
        geometry: { x, y, width: w, height: h, radius: r, points },
        label: `Space ${this.counters.space++}`
      };
      console.log(`🎨 Creating Space with id=${spaceData.id}, floorId=${parentId}`);
      const command = new CreateSpaceCommand(appState, this, spaceData, parentId, id);
      this.commandHistory.executeCommand(command);
    }
  }

  _calculateBlastRadius(idToDelete) {
    const st = appState.structural;
    if (!st) return { count: 0 };

    let targetType = null;
    let targetObj = null;

    // 1. Identify what type of structure is being deleted
    if (st.domains?.some(d => d.id === idToDelete)) { targetType = 'domain'; targetObj = st.domains.find(d => d.id === idToDelete); }
    else if (st.sites?.some(s => s.id === idToDelete)) { targetType = 'site'; targetObj = st.sites.find(s => s.id === idToDelete); }
    else if (st.floors?.some(f => f.id === idToDelete)) { targetType = 'floor'; targetObj = st.floors.find(f => f.id === idToDelete); }
    else if (st.spaces?.some(s => s.id === idToDelete)) { targetType = 'space'; targetObj = st.spaces.find(s => s.id === idToDelete); }

    // If it's a device or standalone object, the cascading blast radius is 0
    if (!targetType) return { count: 0 }; 

    // 2. Map the structural descendants
    let childSites = [], childFloors = [], childSpaces = [];

    if (targetType === 'domain') {
        childSites = (st.sites || []).filter(s => s.domainId === idToDelete);
        childFloors = (st.floors || []).filter(f => childSites.some(s => s.id === f.siteId));
        childSpaces = (st.spaces || []).filter(sp => childFloors.some(f => f.id === sp.floorId));
    } else if (targetType === 'site') {
        childFloors = (st.floors || []).filter(f => f.siteId === idToDelete);
        childSpaces = (st.spaces || []).filter(sp => childFloors.some(f => f.id === sp.floorId));
    } else if (targetType === 'floor') {
        childSpaces = (st.spaces || []).filter(sp => sp.floorId === idToDelete);
    }

    const structuralChildrenCount = childSites.length + childFloors.length + childSpaces.length;

    // 3. Map the dependent physical assets (Devices & Furniture)
    const affectedFloorIds = childFloors.map(f => f.id);
    if (targetType === 'floor') affectedFloorIds.push(idToDelete);

    const affectedSpaceIds = childSpaces.map(sp => sp.id);
    if (targetType === 'space') affectedSpaceIds.push(idToDelete);

    const isAssetAffected = (item) => {
        return affectedFloorIds.includes(item.floorId) || affectedSpaceIds.includes(item.spaceId);
    };

    // We check the layout arrays to guarantee we count exactly what the user sees on canvas
    const dependentDevices = (this.layout?.devices || []).filter(isAssetAffected).length;
    const dependentFurniture = (this.layout?.furnitures || []).filter(isAssetAffected).length;

    const totalChildren = structuralChildrenCount + dependentDevices + dependentFurniture;

    return {
        count: totalChildren,
        name: targetObj.label || targetObj.name || targetType
    };
  }

  _handleWallCreated(wallData) {
    const activeFloorId = appState.ui?.activeFloorId;
    if (activeFloorId && appState.structural.addFenestration) {
      console.log('New Wall Data: ', wallData);
      appState.structural.addWall({ ...wallData, floorId: activeFloorId });
    }
  }

  _handleConduitCreated(conduitData) {
    let spaceId = null;
    let floorId = null;

    if (appState.selection.focusedType === 'space') {
        spaceId = appState.selection.focusedId;
        const space = appState.structural.spaces.find(s => s.id === spaceId);
        if (space) floorId = space.floorId;
    } else if (appState.selection.focusedType === 'floor') {
        floorId = appState.selection.focusedId;
    }

    if ((floorId || spaceId) && appState.structural.addConduit) {
      console.log('New Conduit Data: ', conduitData);
      appState.structural.addConduit({ ...conduitData, floorId, spaceId, label: conduitData.label || `Conduit ${this.counters.conduit++}` });
    }
  }

  _handleRiserCreated(riserData) {
    let spaceId = null;
    let floorId = null;

    if (appState.selection.focusedType === 'space') {
        spaceId = appState.selection.focusedId;
        const space = appState.structural.spaces.find(s => s.id === spaceId);
        if (space) floorId = space.floorId;
    } else if (appState.selection.focusedType === 'floor') {
        floorId = appState.selection.focusedId;
    }

    if ((floorId || spaceId) && appState.structural.addRiser) {
      console.log('New Riser Data: ', riserData);
      appState.structural.addRiser({ ...riserData, floorId, spaceId, label: riserData.label || `Riser ${this.counters.riser++}` });
    }
  }

  _handleUndergroundConduitCreated(ugConduitData) {
    const activeSiteId = appState.selection.focusedType === 'site' ? appState.selection.focusedId : null;
    if (activeSiteId || appState.structural.addUndergroundConduit) {
      console.log('New Underground Conduit Data: ', ugConduitData);
      appState.structural.addUndergroundConduit({ ...ugConduitData, siteId: activeSiteId, label: ugConduitData.label || `Underground Conduit ${this.counters.undergroundConduit++}` });
    }
  }

  _handleDoorCreated(doorData) {
    const activeSpaceId = appState.selection.focusedId;
    const activeFloorId = appState.structural.spaces.find(s => s.id === activeSpaceId)?.floorId;
    if (activeFloorId && appState.structural.addDoor) {
      console.log('🚪 Persisting Door:', doorData);
      appState.structural.addDoor({ ...doorData, floorId: activeFloorId, spaceId: activeSpaceId});
    }
  }

  _handleWindowCreated(windowData) {
    const activeSpaceId = appState.selection.focusedId;
    const activeFloorId = appState.ui?.activeFloorId;
    if ((activeFloorId || activeSpaceId) && appState.structural.addWindow) {
      console.log('🚪 Persisting Window:', windowData);
      appState.structural.addWindow({ ...windowData, floorId: activeFloorId, spaceId: activeSpaceId});
    }
  }

  _handleCableCreated(cableData) {
    console.log("🔌 Finalizing connection with data:", cableData);

    if (cableData.sourceId && cableData.targetId) {
      
      const sourceDevice = appState.getDevice(cableData.sourceId) || this.layout.devices.find(d => d.id === cableData.sourceId);
      const targetDevice = appState.getDevice(cableData.targetId) || this.layout.devices.find(d => d.id === cableData.targetId);

      const sourceId = cableData.sourceDeviceId;
      const targetId = cableData.targetDeviceId;

      if (!sourceDevice || !targetDevice) {
         console.error("Could not find source or target device.");
         return;
      }

      const possibleTypes = [
        appState.ui?.selectedCable, 
        appState.tools?.activeTool, 
        cableData.cableType, 
        cableData.type
      ];

      let actualCableId = possibleTypes.find(type => type && type !== 'cable');     
      if (actualCableId === 'straight') actualCableId = 'copper-straight';
      if (actualCableId === 'crossover') actualCableId = 'copper-crossover';
      if (!actualCableId) actualCableId = 'copper-straight';

      const validation = validateConnection({
          cableType: actualCableId,
          sourcePort: cableData.sourcePort,
          targetPort: cableData.targetPort
      });

      if (!validation.valid) {
       showErrorModal(validation.error, "Connection Error");    
        if (this.layout && this.layout.cables) {
            this.layout.cables = this.layout.cables.filter(c => c.id !== cableData.id);
            if (typeof this.layout.render === 'function') {
                this.layout.render();
            } else if (typeof this.layout._render === 'function') {
                this.layout._render();
            }
        }
        return; 
      }

      try {
          const link = new Link({
              cableType:  actualCableId,
              sourcePort: cableData.sourcePort,
              targetPort: cableData.targetPort,
              geometry: {
                  points: [
                      { x: sourceDevice?.x ?? 0, y: sourceDevice?.y ?? 0, z: 0 },
                      { x: targetDevice?.x ?? 0, y: targetDevice?.y ?? 0, z: 0 },
                  ]
              }
          });

          cableData.linkId = link.id;

          console.log('Network Adding Link...');
          appState.network.addLink(link);
          const srcDevice = appState.network.getDevice(cableData.sourceDeviceId);
          const dstDevice = appState.network.getDevice(cableData.targetDeviceId);
          if (srcDevice && dstDevice && this.layout.routeManager) {
            this.layout.routeManager.resolveOne(link, srcDevice, dstDevice);
          }


      } catch (err) {
          showErrorModal(err.message, "Connection Error");
          if (this.layout?.cables) {
              this.layout.cables = this.layout.cables.filter(c => c.id !== cableData.id);
              this.layout._render?.();
          }
      }

    }
  }

  _handleZoomSelected(zoom) {
    this.layout.setZoom(zoom);
  }

  _handleDeviceAdded(device) {
    if (device.isRehydration || this._isRehydrating) return;
    this.addDevice(device, device.x, device.y);
  }

  _handleFurnitureAdded(furniture) {
    if (furniture.isRehydration || this._isRehydrating) return;
    this.addFurniture(furniture, furniture.x, furniture.y);
  }
  
_handleEntitySelected(entity) {
    if (!entity || !entity.id) {
      appState.selection.clearSelection?.();
      appState.selection.notify?.();
      return;
    }

    // --- Intercept clicks for Delete Mode safely ---
if (appState.tools && appState.tools.activeTool === 'delete') {
        window.addEventListener('pointerup', () => {
            setTimeout(() => {
                // NEW: Check if the clicked entity is a Cable (cables have source/target IDs)
                if (entity.sourceId && entity.targetId) {
                    const src = this.layout.findEntityById(entity.sourceId);
                    const dst = this.layout.findEntityById(entity.targetId);
                    
                    // Trigger the confirmation modal!
                    window.dispatchEvent(new CustomEvent('requestLinkDeletion', { 
                        detail: { 
                            linkId: entity.id, 
                            sourceName: src?.label || src?.name || "Device", 
                            targetName: dst?.label || dst?.name || "Device" 
                        } 
                    }));
                } else {
                    // Standard instant-delete for Devices, Furniture, and Spaces
                    if (this.executeDelete) {
                        this.executeDelete(entity.id);
                    }
                    // Reset tool back to select
                    if (appState.tools) appState.tools.setActiveTool('select');
                }
            }, 0);
        }, { once: true }); 
        return; 
    }

    const selectionCount = appState.selection.getSelectionCount?.() ?? 0;
    const isAlreadyMultiSelected =
      selectionCount > 1 &&
      (
        appState.selection.isDeviceSelected?.(entity.id) ||
        appState.selection.isFurnitureSelected?.(entity.id) ||
        appState.selection.isLinkSelected?.(entity.id)
      );

    if (isAlreadyMultiSelected) {
      appState.selection.notify?.();
      return;
    }

    if (entity.structureType) {
        const typeStr = entity.structureType.toLowerCase(); 
      
        appState.selection.focusedId = entity.id;
        appState.selection.focusedType = typeStr;
        appState.selection.notify?.(); 
    } 
    else if (this._isFurnitureAsset(entity)) {
        if (typeof appState.selection.selectFurniture === 'function') {
            appState.selection.selectFurniture(entity.id);
        } else {
            appState.selection.focusedId = entity.id;
            appState.selection.focusedType = 'furniture';
            appState.selection.notify?.();
        }
    }
    else if (entity.type === 'wall') {
        appState.selection.focusedId = entity.id;
        appState.selection.focusedType = 'wall';
        appState.selection.notify?.();
    }
    else {
        appState.selection.selectDevice?.(entity.id, false);
    }
  }

_handleEntityChanged(en, dx = 0, dy = 0) {
    console.log(`📢 _handleEntityChanged called: en.id=${en?.id}, en.structureType=${en?.structureType}, dx=${dx}, dy=${dy}`);
    
    if (!en || !en.id) {
        console.log(`⚠️ Entity is null or has no ID, skipping`);
        appState.selection.notify();
        return;
    }

    const isFurniture = this._isFurnitureAsset(en);
    const isDevice = !isFurniture && (en.interfaces !== undefined || en.catalogId !== undefined);
    const hasSavedPosition = en && en.savedPosition !== undefined;
    const moved = (dx !== 0 || dy !== 0) ||
      (hasSavedPosition && (en.x !== en.savedPosition.x || en.y !== en.savedPosition.y));

    if ((isDevice || isFurniture) && moved) {
        if (!this._isEntityWithinAssignedParentBounds(en)) {
            if (typeof en.restoreToSavedPosition === 'function') {
                en.restoreToSavedPosition();
            }

            if (this.layout) {
                if (typeof this.layout._render === 'function') {
                    this.layout._render();
                } else if (typeof this.layout.render === 'function') {
                    this.layout.render();
                }
            }

            appState.selection.notify?.();
            return;
        }
    }

    if (isDevice) {
        if (dx !== 0 || dy !== 0) {
            const deviceId = this.entityIdMap.get(en.id) || en.id;
            const success = this.applyDeviceMove(deviceId, dx, dy, { skipCanvasMove: true });
            if (success) {
                this._recordPendingMove(deviceId, { kind: 'device' });
            }
        }

        appState.selection.notify?.();
        return;
    }

    if (isFurniture) {
        if (dx !== 0 || dy !== 0) {
            const furnitureId = this.entityIdMap.get(en.id) || en.id;
            this.applyFurnitureMove(furnitureId, dx, dy, { skipCanvasMove: true });
        }

        appState.selection.notify?.();
        return;
    }


    // Debug: Log movement
    if ((dx !== 0 || dy !== 0) && en.structureType) {
        console.log(`🚀 Moving ${en.structureType} canvas entity (${en.id}) by dx=${dx}, dy=${dy}`);
        console.log(`   Canvas entity object:`, en);
        console.log(`   Current position: x=${en.x}, y=${en.y}`);
    }

    // Only process children if the parent actually moved
    if (dx !== 0 || dy !== 0) {
        const st = appState.structural;
        let shapeType = null;
        let shapeObj = null;

        // CRITICAL: Convert canvas entity ID to structural entity ID using mapping
        const structuralId = this.entityIdMap.get(en.id);
        console.log(`🔄 Converting canvas id(${en.id}) -> structural id(${structuralId})`);

        if (st.domains && st.domains.some(d => d.id === structuralId)) { 
            shapeType = 'domain'; 
            shapeObj = st.domains.find(d => d.id === structuralId);
            console.log(`✅ Found Domain: ${shapeObj?.id}`);
        }
        else if (st.sites && st.sites.some(s => s.id === structuralId)) { 
            shapeType = 'site'; 
            shapeObj = st.sites.find(s => s.id === structuralId);
            console.log(`✅ Found Site: ${shapeObj?.id}`);
        }
        else if (st.floors && st.floors.some(f => f.id === structuralId)) { 
            shapeType = 'floor'; 
            shapeObj = st.floors.find(f => f.id === structuralId);
            console.log(`✅ Found Floor: ${shapeObj?.id}`);
        }
        else if (st.spaces && st.spaces.some(s => s.id === structuralId)) { 
            shapeType = 'space'; 
            shapeObj = st.spaces.find(s => s.id === structuralId);
            console.log(`✅ Found Space: ${shapeObj?.id}`);
        }

            if (shapeObj) {
            const success = this.applyStructuralMove(structuralId, shapeType, dx, dy, { skipCanvasMove: true });
            if (success) {
                this._recordPendingMove(structuralId, { kind: 'structure', structureType: shapeType });
            }
        } else if (appState.network && typeof appState.getDevice === 'function') {
            const deviceId = this.entityIdMap.get(en.id) || en.id;
            const device = appState.getDevice(deviceId);
            if (device) {
                this.applyDeviceMove(deviceId, dx, dy, { skipCanvasMove: true });
                this._recordPendingMove(deviceId, { kind: 'device' });
            }
        }
    }

    appState.selection.notify();
  }
}

export default LogicalCanvasController;