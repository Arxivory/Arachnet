import Grid from './Grid.js';
import ShapeCreator from './ShapeCreator.js';
import CableEntity from './entities/CableEntity.js'; 
// import { buildDeviceIconImages, resolveDeviceIconKey } from './entities/DeviceIcons.js';
import { buildDeviceIconImages } from './entities/DeviceIcons.js';
import ShapeRenderer from '../rendering/ShapeRenderer.js';
import PointerHandler from '../rendering/PointerHandler.js';
import { Selection } from '../editor/Selection.js';
import EntityTransformer from './transform/EntityTransformer.js';
import { System } from 'check2d';
import appState from '../../state/AppState.js';
import { CableRouteManager } from '../cabling/CableRouteManager.js';

// ADD THIS IMPORT:
import { UnitSystem, GridScale } from '../../util/UnitSystem.js'; // Adjust path if needed

export class LogicalLayout {
  constructor(opts = {}) {
    this.container = opts.container || document.body;
    this.width = opts.width || 800;
    this.height = opts.height || 600;
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.hoveredCable = null;

    this.system = new System();

    this.grid = new Grid({
      gridSize: opts.gridSize || 32,
      gridColor: opts.gridColor || '#818181ff',
      gridMajorColor: opts.gridMajorColor || '#6b6b6bff',
      gridMinorAlpha: opts.gridMinorAlpha || 0.12,
      snap: opts.snap ?? true,
      snapTolerance: opts.snapTolerance || 8
    });

    this.shapeCreator = new ShapeCreator({
      onRectangleCreated: opts.onRectangleCreated || null,
      onCircleCreated: opts.onCircleCreated || null,
      onPolygonCreated: opts.onPolygonCreated || null,
      onFreeformCreated: opts.onFreeformCreated || null,
      onDeviceAdded: opts.onDeviceAdded || null,
      onWallCreated: opts.onWallCreated || null,
      onDoorCreated: opts.onDoorCreated || null,
      onWindowCreated: opts.onWindowCreated || null,
      onCableCreated: opts.onCableCreated || null,
      onConduitCreated: opts.onConduitCreated ||null,
      onRiserCreated: opts.onRiserCreated || null,
      onUndergroundConduitCreated: opts.onUndergroundConduitCreated || null,
      system: this.system
    });

    this.routeManager = new CableRouteManager(appState.structural, 0.7);

    // --- NEW: Global Listener for Entity Deletions ---
    window.addEventListener('forceCanvasDelete', (e) => {
      if (e.detail && e.detail.id) {
        this.removeEntityById(e.detail.id);
      }
    });

    this.shapeRenderer = new ShapeRenderer({
      gridSize: opts.gridSize || 32
    });

    this.pointerHandler = new PointerHandler({
      onPointerDown: this._onPointerDown.bind(this),
      onPointerMove: this._onPointerMove.bind(this),
      onPointerUp: this._onPointerUp.bind(this),
      onRightClick: this._onRightClick.bind(this)
    });

    this.selection = new Selection({
      dpr: this.devicePixelRatio
    });

    this.entityTransformer = new EntityTransformer();

    this.selectedEntity = null;
    this.selectedEntities = [];
    this.isResizing = false;
    this.resizeStart = null;

    this.canvas = null;
    this.ctx = null;

    this.mode = 'select';
    this.startPoint = null;
    this.currentPoint = null;
    this.viewState = { e: 0, f: 0 };

    this.rectangles = [];
    this.polygons = [];
    this.currentPolygon = [];
    this.circles = [];
    this.walls = [];
    this.doors = [];
    this.windows = [];
    this.roofs = [];
    this.freeforms = [];
    this.currentFreeform = [];
    this.devices = [];
    this.cables = [];
    this.furnitures = [];
    this.conduits = [];
    this.risers = [];
    this.undergroundConduits = [];
    this.store = appState.selection;

    this.store.subscribe(() => this.syncWithState());

    this.pendingCableSource = null;   // { device } | null — port stored separately
    this.pendingCableSourcePort = null;   // PhysicalPort | null
    this.activeCableType = 'copper-straight'; // catalog key, not UI alias
    this.hoveredDevice = null;

    this.structureType = '';
    this.bgColor = opts.bgColor || '#ffffffff';
    this.activeFloorId = null;

    this.onZoomSelected = opts.onZoomSelected || null;
    this.onDeviceAdded = opts.onDeviceAdded || null;
    this.onFurnitureAdded = opts.onFurnitureAdded || null;
    this.onEntitySelected = opts.onEntitySelected || null;
    this.onEntityChanged = opts.onEntityChanged || null;
    this.onPortSelect = opts.onPortSelect || null;

    this.selectedEntity = null;
    this.selectedEntities = [];
    this.originalEntity = null;

    this.interaction = {
      mode: null,
      handle: null,
      start: null
    };


    // Icon images are now managed in DeviceIcons.js — single source of truth.
    this.deviceIcons = buildDeviceIconImages();

    this._initCanvas();
    this._render();

    this.syncWithState();

  }

  syncWithState() {
    this.selectedEntity = this.findEntityById(this.store.getFocusedId());
    this.selectedEntities = this._getSelectedEntitiesFromStore();
    this._render();
  }

  _getSelectedEntitiesFromStore() {
    const ids = new Set([
      ...(this.store.getSelectedDeviceIds?.() || []),
      ...(this.store.getSelectedFurnitureIds?.() || []),
      ...(this.store.getSelectedLinkIds?.() || [])
    ]);

    const focusedId = this.store.getFocusedId?.();
    if (focusedId) ids.add(focusedId);

    return [...ids]
      .map(id => this.findEntityById(id))
      .filter(Boolean);
  }

  _getMovableSelectedEntities(primaryEntity = null) {
    const entities = this.selectedEntities?.length
      ? this.selectedEntities
      : (primaryEntity ? [primaryEntity] : []);

    const unique = new Map();
    for (const entity of entities) {
      if (!entity || entity.sourceId || typeof entity.move !== 'function') continue;
      unique.set(entity.id, entity);
    }

    if (primaryEntity && !primaryEntity.sourceId && typeof primaryEntity.move === 'function') {
      unique.set(primaryEntity.id, primaryEntity);
    }

    return [...unique.values()];
  }

  _prepareMoveSelection(primaryEntity = null) {
    const moveEntities = this._getMovableSelectedEntities(primaryEntity);
    moveEntities.forEach((entity) => {
      if (entity?.saveCurrentPosition) {
        entity.saveCurrentPosition();
      }
    });
    return moveEntities;
  }

  _resolveGroupMoveDelta(entities, dx, dy) {
    if (!entities?.length) return { dx, dy };

    let clampedDx = dx;
    let clampedDy = dy;

    for (const entity of entities) {
      if (!entity) continue;

      if (this._isDeviceEntity(entity) || this._isFurnitureEntity(entity)) {
        const clamped = this._clampMovementWithinParent(entity, clampedDx, clampedDy);

        if (Math.abs(clamped.dx) < Math.abs(clampedDx)) {
          clampedDx = clamped.dx;
        }

        if (Math.abs(clamped.dy) < Math.abs(clampedDy)) {
          clampedDy = clamped.dy;
        }
      }
    }

    return { dx: clampedDx, dy: clampedDy };
  }

  _initCanvas() {
    const c = document.createElement('canvas');
    c.style.display = 'block';
    c.style.width = this.width + 'px';
    c.style.height = this.height + 'px';
    c.width = Math.floor(this.width * this.devicePixelRatio);
    c.height = Math.floor(this.height * this.devicePixelRatio);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
    this.container.appendChild(c);
    this.pointerHandler.attach(c);
  }

  destroy() {
    if (!this.canvas) return;
    this.pointerHandler.detach();
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    if (!this.canvas) return;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.canvas.width = Math.floor(w * this.devicePixelRatio);
    this.canvas.height = Math.floor(h * this.devicePixelRatio);
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
    this._render();
  }

  setGridSize(size) {
    this.grid.setSize(size);
    this.shapeRenderer.gridSize = size;
    this._render();
  }

  enableSnap(enabled) {
    this.grid.setSnap(enabled);
  }

  clear() {
    this.rectangles = [];
    this.polygons = [];
    this.currentPolygon = [];
    this.circles = [];
    this.walls = [];
    this.roofs = [];
    this.doors = [];
    this.windows = [];
    this.freeforms = [];
    this.devices = [];
    this.furnitures = [];
    this.cables = [];
    this.mode = 'none';
    this.startPoint = null;
    this.currentPoint = null;
    this._render();
  }

  removeShapeById(id) {
    const entity = this.findEntityById(id);
    if (entity) {
      if (entity.body) {
        this.system.remove(entity.body);
      } else if (entity.bodies) {
        for (const body of entity.bodies) {
          this.system.remove(body);
        }
      }
    }
    this.rectangles = this.rectangles.filter(e => e.id !== id);
    this.polygons = this.polygons.filter(e => e.id !== id);
    this.circles = this.circles.filter(e => e.id !== id);
    this.freeforms = this.freeforms.filter(e => e.id !== id);

    this._render();
  }

  isPointInsideShape(id, x, y) {
    // 1. Try standard entity search
    let entity = null;
    if (typeof this.findEntityById === 'function') {
      entity = this.findEntityById(id);
    }

    // 2. If not found, it's likely a Structure! Search other common arrays.
    if (!entity && this.structures) {
      entity = this.structures.find(s => s.id === id);
    }
    if (!entity && this.shapes) {
      entity = this.shapes.find(s => s.id === id);
    }
    // Check inside shapeCreator just in case your shapes live there
    if (!entity && this.shapeCreator && this.shapeCreator.shapes) {
      entity = this.shapeCreator.shapes.find(s => s.id === id);
    }

    // 3. SAFE FALLBACK: If we completely fail to find the physical shape in the layout,
    // do NOT block the drop. Log a warning for debugging and allow it.
    if (!entity) {
      console.warn(`Bounds Check: Could not find physical shape for ID ${id}. Allowing drop by default.`);
      return true;
    }

    // 4. Check using the standard hit-test bounds (Rectangle.js)
    if (typeof entity.getCurrentBounds === 'function') {
      const bounds = entity.getCurrentBounds();
      return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
    }

    // 5. Fallback to basic coordinate checking
    if (entity.x !== undefined && entity.w !== undefined && entity.h !== undefined) {
      return x >= entity.x && x <= (entity.x + entity.w) && y >= entity.y && y <= (entity.y + entity.h);
    }

    return true; // Default to allowing placement
  }

  validateDropLocation(x, y) {
    const selection = appState.selection;
    const targetId = selection.focusedId;

    // If nothing is selected, or layout is missing, fail the check
    if (!targetId || !this.layout) return false;

    if (typeof this.layout.isPointInsideShape === 'function') {
      return this.layout.isPointInsideShape(targetId, x, y);
    }
    return true;
  }

  setActiveFloor(floorId) {
    this.activeFloorId = floorId;
    this._render();
  }

  startDrawRectangle(structureType = '') {
    this.mode = 'rectangle';
    this.structureType = structureType;
    this._updateCursor();
  }

  startDrawCircle(structureType = '') {
    this.mode = 'circle';
    this.structureType = structureType;
    this._updateCursor();
  }

  startDrawPolygon(structureType = '') {
    this.mode = 'polygon';
    this.currentPolygon = [];
    this.structureType = structureType;
    this._updateCursor();
  }

  startDrawFreeform(structureType = '') {
    this.mode = 'freeform';
    this.currentFreeform = [];
    this.structureType = structureType;
    this._updateCursor();
  }

  startDrawDoor() {
    this.mode = 'door';
    this._updateCursor();
  }

  startDrawWindow() {
    this.mode = 'window';
    this._updateCursor();
  }

  startDrawWall() {
    this.mode = 'wall';
    this._updateCursor();
  }

  startDrawConduit() {
    this.mode = 'conduit';
    this._updateCursor();
  }

  startDrawRiser() {
    this.mode = 'riser';
    this._updateCursor();
  }

  startDrawUndergroundConduit() {
    this.mode = 'underground-conduit';
    this._updateCursor();
  }

  // Map legacy UI aliases to catalog keys so cables[type] lookups never miss.
  static _normalizeCableType(type) {
    const aliases = {
      straight: 'copper-straight',
      crossover: 'copper-crossover',
      'cross-over': 'copper-crossover',
      serial: 'console',
    };
    return aliases[type] ?? type;
  }

  startDrawCable(type = 'copper-straight') {
    this.mode = 'cable';
    this.activeCableType = LogicalLayout._normalizeCableType(type);
    this._updateCursor();
  }


  startSelect() {
    this.mode = 'select';
    this._updateCursor();
  }

  startPan() {
    this.mode = 'pan';
    this._updateCursor();
  }

  cancelDrawing() {
    this.mode = 'none';
    this.startPoint = null;
    this.currentPoint = null;
    this.pointerHandler.setPointerDown(false);
    this._updateCursor();
    this._render();
  }

  addDevice(deviceData, x, y) {
    const size = this.shapeRenderer.gridSize * 1.5;
    const device = this.shapeCreator.createDevice(deviceData, x, y, size);
    const activeFloor = appState.ui.activeFloorId;
    device.floorId = activeFloor || null;

    console.log("ADD → layout instance:", this.layout);
    console.log("ADD layout === global?", this.layout === window.__layoutRef);
    window.__layoutRef = this.layout;

    if (!this._checkForOverlap(device, "creation")) {
      this.devices.push(device);

      this._render();
    }
  }

  addFurniture(furnitureData, x, y) {
    console.log('Adding furniture with data:', furnitureData, 'from LogicalLaypout bsuiyti');
    const size = this.shapeRenderer.gridSize * 1.5;

    // Combine type and name to figure out what icon to show (if you have them)
    const rawType = (furnitureData.type + ' ' + (furnitureData.name || furnitureData.label || '')).toLowerCase();

    let iconKey = null;

    if (rawType.includes('desk') || rawType.includes('table')) {
      iconKey = 'desk';
    } else if (rawType.includes('chair') || rawType.includes('seat')) {
      iconKey = 'chair';
    } else if (rawType.includes('cabinet') || rawType.includes('rack')) {
      iconKey = 'rack';
    }

    // Assuming you might add a furnitureIcons dictionary in the future.
    // If it's undefined, your render loop will likely just draw the bounding box/path, which is fine!
    const iconImage = this.deviceIcons[iconKey];

    const half = size / 2;
    const px = x - half;
    const py = y - half;
    const path = new Path2D();
    path.rect(px, py, size, size);

    const updateFurniturePath = (entity) => {
      const halfW = entity.width / 2;
      const halfH = entity.height / 2;
      const updatedPath = new Path2D();
      updatedPath.rect(entity.x - halfW, entity.y - halfH, entity.width, entity.height);
      entity.path = updatedPath;
    };

    
    const furniture = { 
      id: furnitureData.id || `furniture_${Math.random().toString(36).slice(2, 9)}`, 
      // type: furnitureData.type || 'furniture',
      // entityType: 'furniture',
      // label: furnitureData.name || furnitureData.label || 'Furniture',
      // catalogId: furnitureData.catalogId || null, // ADDED: preserve catalog metadata
      // floorId: furnitureData.floorId ?? appState.ui.activeFloorId ?? null, // ADDED: preserve floor context
      // spaceId: furnitureData.spaceId ?? null, // ADDED: preserve space context
      // // CHANGED: keep the same id as the furniture store/hierarchy node
      type: furnitureData.type || 'furniture',
      entityType: 'furniture',
      label: furnitureData.name || furnitureData.label || 'Furniture',
      catalogId: furnitureData.catalogId || null, // ADDED: preserve catalog metadata
      floorId: furnitureData.floorId ?? appState.ui.activeFloorId ?? null, // ADDED: preserve floor context
      spaceId: furnitureData.spaceId ?? null, // ADDED: preserve space context
      x,
      y,
      width: size,
      height: size,
      icon: iconImage,
      transform: {
        position: { x, y, z: 0 },
        scale: 1,
        rotation: { x: 0, y: 0, z: 0 }
      },
      path,
    //   hitTestMode: 'path',
    //   saveCurrentPosition() {
    //     this.savedPosition = { x: this.x, y: this.y };
    //   },
    //   restoreToSavedPosition() {
    //     if (!this.savedPosition) return;
    //     this.x = this.savedPosition.x;
    //     this.y = this.savedPosition.y;
    //     this.transform.position.x = this.x;
    //     //  updateFurniturePath(this);
    //     this.transform.position.y = this.y;
    //   }
    // };

    hitTestMode: 'path',
      saveCurrentPosition() {
        this.savedPosition = { x: this.x, y: this.y };
      },
      move(dx, dy) {
        this.x += dx;
        this.y += dy;
        this.transform.position.x = this.x;
        this.transform.position.y = this.y;
        updateFurniturePath(this);
      },
      restoreToSavedPosition() {
        if (!this.savedPosition) return;
        this.x = this.savedPosition.x;
        this.y = this.savedPosition.y;
        this.transform.position.x = this.x;
        this.transform.position.y = this.y;
        updateFurniturePath(this);
      }
    };


  //   this.furnitures.push(furniture);

  //   if (this.onFurnitureAdded) {

  //     this.onFurnitureAdded(furniture);
  //   }
  //   this._render();
  // } 


  // ADDED: New method to add furniture directly from the layout, bypassing the store. Useful for drag-and-drop where the store update might be async or handled separately.
  this.furnitures.push(furniture);
    this._render();
  }

  getSnappedCanvasCoords(clientX, clientY) {
    const zoomFactor = this.pointerHandler.getZoom();
    const canvasPoint = this.pointerHandler.clientToWorld(clientX, clientY, this.viewState, zoomFactor);
    return this.grid.snapToGrid(canvasPoint);
  }

  _updateCursor() {
    const cursorMap = {
      'rectangle': 'crosshair',
      'circle': 'crosshair',
      'polygon': 'crosshair',
      'freeform': 'crosshair',
      'wall': 'crosshair',
      'door': 'crosshair',
      'window': 'crosshair',
      'cable': 'crosshair',
      'pan': 'grab',
      'none': 'default',
      'conduit': 'crosshair',
      'riser': 'crosshair',
      'underground-conduit': 'crosshair',
      'select': 'default'
    };
    this.pointerHandler.setCursor(cursorMap[this.mode] || 'default');
  }

  _onPointerDown(e) {
    if (this.mode === 'none') {
      this.pointerHandler.setPointerDown(false);
      return;
    }

    if (this.mode === 'pan') {
      this.pointerHandler.setCursor('grabbing');
      this.pointerHandler.setPanStart(e.clientX, e.clientY);
      this.pointerHandler.setPointerDown(true);
    }

    const zoomFactor = this.pointerHandler.getZoom();
    const p = this.pointerHandler.clientToWorld(e.clientX, e.clientY, this.viewState, zoomFactor);
    const snapped = this.grid.snapToGrid(p);

    if (this.mode === 'cable') {
      const device = this._findDeviceAt(snapped.x, snapped.y);
      if (!device) return;

      if (this.onPortSelect) {
        this.onPortSelect(device, e.clientX, e.clientY, (selectedPort) => {
          if (!selectedPort) return;

          // ── First click: record source device + port ──────────────────────
          if (!this.pendingCableSource) {
            this.pendingCableSource = device;
            this.pendingCableSourcePort = selectedPort; // PhysicalPort instance
            this._render();
            return;
          }

          // ── Second click: validate → Link → CableEntity ───────────────────
          const srcDevice = this.pendingCableSource;
          const srcPort = this.pendingCableSourcePort; // PhysicalPort
          const dstDevice = device;
          const dstPort = selectedPort;               // PhysicalPort

          // Rough geometry for cable-length calculation inside Link
          const geometry = {
            points: [
              { x: srcDevice.x, y: srcDevice.y, z: 0 },
              { x: dstDevice.x, y: dstDevice.y, z: 0 },
            ],
          };

          console.log('Source Port: ', srcPort);
          console.log('Dst Port: ', dstPort);

          const result = this.shapeCreator.createCable({
            cableType: this.activeCableType,
            sourcePort: srcPort,
            targetPort: dstPort,
            sourceDeviceId: srcDevice.id,
            targetDeviceId: dstDevice.id,
            geometry,
            floorId: srcDevice.floorId ?? null,
            spaceId: srcDevice.spaceId ?? null,
          });

          if (result.error) {
            // Surface validation failure. Replace alert() with your toast system.
            console.warn(`[Cable] ${result.error}`);
            alert(result.error);
          } else {
            if (result.warnings.length > 0) {
              console.warn(`[Cable warnings] ${result.warnings.join('\n')}`);
            }
            this.cables.push(result.cable);
          }

          this.pendingCableSource = null;
          this.pendingCableSourcePort = null;
          this._render();
        });
      }
      return;
    }

    if (this.mode === 'conduit') {
      const conduit = this._placeConduitAt(snapped.x, snapped.y);
      this._render();
      return;
    }

    if (this.mode === 'riser') {
      const riser = this._placeRiserAt(snapped.x, snapped.y);
      this._render();
      return;
    }

    if (this.mode === 'underground-conduit') {
      const undergroundConduit = this._placeUndergroundConduitAt(snapped.x, snapped.y);
      this._render();
      return;
    }

    if (this.mode === 'select') {
      const zoom = this.pointerHandler.getZoom();
      const worldPos = this.pointerHandler.clientToWorld(e.clientX, e.clientY, this.viewState, zoom);
      const multiSelect = e.ctrlKey || e.metaKey || e.shiftKey;
      const selectionResult = this.identifyEntity(worldPos.x, worldPos.y, {multiSelect});
      // console.log('[DOWN] identifyEntity result:', en?.id, en?.type, en?.entityType, { multiSelect });
      console.log('[DOWN] identifyEntity result:', selectionResult?.id, selectionResult?.type, selectionResult?.entityType, { multiSelect });

      const clickedConduit = this._findConduitAt(worldPos.x, worldPos.y);
      if (clickedConduit) {
        clickedConduit.saveCurrentPosition();
        this.interaction = { mode: 'move_conduit', conduit: clickedConduit };
        this.selectedEntity = clickedConduit;
        this.selectedEntities = [clickedConduit];
        appState.selection.selectConduit(clickedConduit.id);

        this.routeManager?.clear();
        const links   = appState.network.getAllLinks();
        const devices = appState.network.getAllDevices();
        this.routeManager?.resolveAll(links, devices);

        this.pointerHandler.setPointerDown(true);
        this._render();
        return;
      }

      const clickedRiser = this._findRiserAt(worldPos.x, worldPos.y);
      if (clickedRiser) {
        clickedRiser.saveCurrentPosition();
        this.interaction = { mode: 'move_riser', riser: clickedRiser };
        this.selectedEntity = clickedRiser;
        this.selectedEntities = [clickedRiser];
        appState.selection.selectRiser(clickedRiser.id);

        this.routeManager?.clear();
        const links   = appState.network.getAllLinks();
        const devices = appState.network.getAllDevices();
        this.routeManager?.resolveAll(links, devices);

        this.pointerHandler.setPointerDown(true);
        this._render();
        return;
      }

      const clickedUndergroundConduit = this._findUndergroundConduitAt(worldPos.x, worldPos.y);
      if (clickedUndergroundConduit) {
        clickedUndergroundConduit.saveCurrentPosition();
        this.interaction = { mode: 'move_underground-conduit', undergroundConduit: clickedUndergroundConduit };
        this.selectedEntity = clickedUndergroundConduit;
        this.selectedEntities = [clickedUndergroundConduit];
        appState.selection.selectUndergroundConduit(clickedUndergroundConduit.id);
        this.pointerHandler.setPointerDown(true);
        this._render();
        return;
      }

      if (selectionResult.selectionOnly) {
        return;
      }

      const en = selectionResult.entity;
      if (!en) {
        return;
      }

      // --- NEW: SMART CABLE DETACHMENT ---
      // If the selected entity is a cable (has sourceId and targetId)
      if (en.sourceId && en.targetId) {
        const src = this.findEntityById(en.sourceId);
        const dst = this.findEntityById(en.targetId);

        if (src && dst) {
          const p = this.pointerHandler.clientToWorld(e.clientX, e.clientY, this.viewState, zoom);

          // Calculate which end the user clicked closer to
          const distToSrc = Math.hypot(p.x - src.x, p.y - src.y);
          const distToDst = Math.hypot(p.x - dst.x, p.y - dst.y);

              if (distToSrc < distToDst) {
                  // Detach the Source end
                  this.interaction = { mode: 'update_cable', cable: en, endpointType: 'source', fixedDevice: dst };
              } else {
                  // Detach the Target end
                  this.interaction = { mode: 'update_cable', cable: en, endpointType: 'target', fixedDevice: src };
              }
              
              this.currentPoint = p;
              this.pointerHandler.setPointerDown(true);
              return; // CRITICAL: Return early so it doesn't try to bodily move the cable!
          } 
      }



      const moveEntities = this._prepareMoveSelection(en);

      const p = this.pointerHandler.clientToWorld(e.clientX, e.clientY, this.viewState, zoom);

      const x = en.x;
      const y = en.y;
      const w = en.w || en.width;
      const h = en.h || en.height;
      const bounds = this._getEntityInteractionBounds(en); // ADDED: use the correct drawn bounds for both shapes and devices
      const size = 8;

      if (bounds) {
        const { x, y, w, h } = bounds;
        const handles = {
          nw: [x, y],
          ne: [x + w, y],
          sw: [x, y + h],
          se: [x + w, y + h]
        };

        for (const key in handles) {
          const [hx, hy] = handles[key];
          if (Math.abs(p.x - hx) < size &&
            Math.abs(p.y - hy) < size &&
            this._isResizableEntity(en)) {
            if (en.saveCurrentScale) {
              en.saveCurrentScale(); // ADDED: allow device scaling to be rolled back if needed
            }
            this.interaction = {
              mode: 'resize',
              handle: key,
              start: { x: p.x, y: p.y },
              bounds,
              center: { x: x + w / 2, y: y + h / 2 }, // ADDED: resize devices around their visual center
              baseScale: en.transform?.scale?.factor ?? 1
            };
            this.pointerHandler.setPointerDown(true);
            return;
          }
        }
      }

      if (this.mode === 'delete') {
        const zoomFactor = this.pointerHandler.getZoom();
        const p = this.pointerHandler.clientToWorld(e.clientX, e.clientY, this.viewState, zoomFactor);

        const shouldFilterByFloor = appState.selection.focusedType === 'floor';
        const activeFloorId = shouldFilterByFloor ? (this.activeFloorId || appState.ui.activeFloorId) : null;
        const activeSpaceId = appState.selection.focusedType === 'space' ? appState.selection.focusedId : null;

        for (const cable of this.cables) {
          const src = this.findEntityById(cable.sourceId);
          const dst = this.findEntityById(cable.targetId);
          if (!src || !dst) continue;

          if (activeSpaceId) {
            if (src.spaceId !== activeSpaceId && dst.spaceId !== activeSpaceId) continue;
          } else if (activeFloorId) {
            const srcOnFloor = src.floorId == null || src.floorId === activeFloorId;
            const dstOnFloor = dst.floorId == null || dst.floorId === activeFloorId;
            if (!srcOnFloor || !dstOnFloor) continue;
          }

        // Use the exact same highly-optimized bounding box we built for hovering
        if (this._hitTestCable(p.x, p.y, src, dst, 8)) {
          // Dispatch a custom event telling the UI a link was clicked for deletion
          window.dispatchEvent(new CustomEvent('requestLinkDeletion', { 
            detail: { linkId: cable.id, sourceName: src.label || src.name, targetName: dst.label || dst.name } 
          }));
          
          // Reset the tool back to select automatically
          this.pointerHandler.setPointerDown(false);
          return;
        }
      }
    }
      this.interaction = {
        mode: 'move',
        start: { x: p.x, y: p.y },
        entities: moveEntities
      };

      this.pointerHandler.setPointerDown(true);
      return;
    }



    if (this.mode === 'polygon') {
      if (this.currentPolygon.length === 0) {
        this.currentPolygon.push(snapped);
      } else {
        const first = this.currentPolygon[0];
        const canClose = this.shapeCreator.canClosePolygon(
          first,
          snapped,
          this.grid.getSnapTolerance()
        );

        if (canClose && this.currentPolygon.length >= 3) {
          const activeFloor = appState.ui.activeFloorId; // ADDED: capture the currently focused floor before overlap checking

          const polygon = this.shapeCreator.createPolygon(
            [...this.currentPolygon],
            this.structureType,
            this.system
          );

          if (polygon) {
            polygon.floorId = activeFloor || null; // ADDED: assign the polygon to the active floor for correct hierarchy overlap checks

            if (polygon.body) {
              polygon.body.floorId = activeFloor || null; // ADDED: assign the collision body to the same floor
            }

            if (!this._checkForOverlap(polygon, "creation")) {
              if (this.shapeCreator.onPolygonCreated) {
                this.shapeCreator.onPolygonCreated(polygon);
              }
              this.polygons.push(polygon);
            } else if (polygon.body) {
              this.system.remove(polygon.body); // ADDED: clean up inserted collision body if creation fails
            }
          }

          this.currentPolygon = [];
          this.mode = 'none';
          this.currentPoint = null;
          this._updateCursor();
          this._render();
          return;
        }

        this.currentPolygon.push(snapped);
      }

      this.currentPoint = snapped;
      this._render();
      return;
    }


    if (this.mode === 'freeform') {
      if (this.currentFreeform.length === 0) {
        this.currentFreeform.push(snapped);
      } else {
        const first = this.currentFreeform[0];
        const canClose = this.shapeCreator.canClosePolygon(
          first,
          snapped,
          this.grid.getSnapTolerance()
        );

        if (canClose && this.currentFreeform.length >= 3) {
          const activeFloor = appState.ui.activeFloorId; // ADDED: capture the selected floor before overlap checking

          const freeform = this.shapeCreator.createFreeform(
            [...this.currentFreeform],
            this.structureType,
            this.system
          );

          if (freeform) {
            freeform.floorId = activeFloor || null; // ADDED: assign the freeform entity to the active floor

            if (freeform.bodies) {
              for (const body of freeform.bodies) {
                body.floorId = activeFloor || null; // ADDED: assign every freeform collision body to the same floor
              }
            }

            if (!this._checkForOverlap(freeform, "creation")) {
              if (this.shapeCreator.onFreeformCreated) {
                this.shapeCreator.onFreeformCreated(freeform);
              }
              this.freeforms.push(freeform);
            } else if (freeform.bodies) {
              for (const body of freeform.bodies) {
                this.system.remove(body); // ADDED: clean up inserted bodies if overlap validation fails
              }
            }
          }

          this.currentFreeform = [];
          this.mode = 'none';
          this.currentPoint = null;
          this._updateCursor();
          this._render();
          return;
        }

        this.currentFreeform.push(snapped);
      }

      this.currentPoint = snapped;
      this._render();
      return;
    }


    if (this.mode !== 'select' && this.mode !== 'pan' && this.mode !== 'none') {
      this.pointerHandler.setPointerDown(true);
      this.startPoint = snapped;
      this.currentPoint = snapped;
      this._render();
    }
  }

  _onPointerMove(e) {
    if (!this.canvas) return;

    const zoomFactor = this.pointerHandler.getZoom();
    const p = this.pointerHandler.clientToWorld(e.clientX, e.clientY, this.viewState, zoomFactor);

    if (this.mode === 'select') {
      if (this.selectedEntity) {
        const en = this.selectedEntity;

        const x = en.x;
        const y = en.y;
        const w = en.w || en.width;
        const h = en.h || en.height;

        const bounds = this._getEntityInteractionBounds(en); // ADDED: use correct visual bounds for devices too
        let cursor = 'move';

        if (bounds) {
          const { x, y, w, h } = bounds;
          const size = 8;

          const handles = {
            nw: [x, y],
            ne: [x + w, y],
            sw: [x, y + h],
            se: [x + w, y + h]
          };

          for (const key in handles) {
            const [hx, hy] = handles[key];
            if (
              Math.abs(p.x - hx) < size &&
              Math.abs(p.y - hy) < size &&
              this._isResizableEntity(en)

            ) {
              cursor = (key === 'nw' || key === 'se')
                ? 'nwse-resize'
                : 'nesw-resize';
            }
          }
        }
        this.pointerHandler.setCursor(cursor);
        // --- RESTORED CABLE HOVER DETECTION ---
    if (this.mode === 'select' && !this.pointerHandler.getIsPointerDown()) {
      let newlyHoveredCable = null;
      
      // 1. Determine the active structural hierarchy
      const focusedType = appState.selection.focusedType;
      const focusedId = appState.selection.focusedId;
      
      const activeSpaceId = (focusedType === 'space' || focusedType === 'Space') ? focusedId : null;
      const activeFloorId = focusedType === 'floor' ? focusedId : appState.ui.activeFloorId;

      for (const cable of this.cables) {
        const src = this.findEntityById(cable.sourceId);
        const dst = this.findEntityById(cable.targetId);
        if (!src || !dst) continue;

        // 2. Guardrail: Hierarchy Filtering
        if (activeSpaceId) {
          // STRICT MODE: If viewing a specific Space, ignore cables that don't touch this room
          if (src.spaceId !== activeSpaceId && dst.spaceId !== activeSpaceId) continue;
        } 
        else if (activeFloorId) {
          // BROAD MODE: If viewing a Floor, ignore cables that belong to a completely different floor
          const srcOnFloor = src.floorId == null || src.floorId === activeFloorId;
          const dstOnFloor = dst.floorId == null || dst.floorId === activeFloorId;
          if (!srcOnFloor || !dstOnFloor) continue;
        }

        // 3. Optimized Bounding Box Hit Test (Using the 'p' variable already defined in move)
        if (this._hitTestCable(p.x, p.y, src, dst, 8)) {
          newlyHoveredCable = cable;
          break; 
        }
      }

      // Only trigger a re-render if the hover state actually changed
      if (this.hoveredCable !== newlyHoveredCable) {
        this.hoveredCable = newlyHoveredCable;
        this._render();
      }
    }
    // -------------------------------------
      }
      else {
        this.pointerHandler.setCursor('default');
      }
    }

    if (this.mode === 'polygon' || this.mode === 'freeform') {
      this.currentPoint = this.grid.snapToGrid(p);
      this._render();
      return;
    }

    const snapped = this.grid.snapToGrid(p);
    this.currentPoint = snapped;

    if (this.mode === 'cable') {
      this.hoveredDevice = this._findDeviceAt(snapped.x, snapped.y);
      this._render();
    } else {
      this.hoveredDevice = null;
    }

    if (this.pointerHandler.getIsPointerDown()) {

      if (this.interaction.mode === 'move_conduit') {
        const conduit = this.interaction.conduit;
        const parentShape =
          this.rectangles.find(r => r.id === conduit.parentShapeId) ||
          this.polygons.find(pol => pol.id === conduit.parentShapeId);

        if (parentShape) {
          const projected = this._projectPointOntoShapeEdges(p.x, p.y, parentShape);
          if (projected) conduit.moveTo(projected.x, projected.y);
        }

        // Sync to structural store
        appState.structural.updateConduit(conduit.id, { x: conduit.x, y: conduit.y });

        const links   = appState.network.getAllLinks();
        const devices = appState.network.getAllDevices();
        this.routeManager?.reResolveAll(links, devices);

        this._render();
        return;
      }

      if (this.interaction.mode === 'move_riser') {
        const riser = this.interaction.riser;
        const parentShape =
          this.rectangles.find(r => r.id === riser.parentShapeId) ||
          this.polygons.find(pol => pol.id === riser.parentShapeId);

        if (parentShape) {
          const edges = this._getShapeEdges(parentShape);
          const bounds = {
            minX: Math.min(...edges.map(e => Math.min(e.x1, e.x2))),
            minY: Math.min(...edges.map(e => Math.min(e.y1, e.y2))),
            maxX: Math.max(...edges.map(e => Math.max(e.x1, e.x2))),
            maxY: Math.max(...edges.map(e => Math.max(e.y1, e.y2))),
          };
          const clampedX = Math.max(bounds.minX, Math.min(p.x, bounds.maxX - riser.width));
          const clampedY = Math.max(bounds.minY, Math.min(p.y, bounds.maxY - riser.height));
          riser.moveTo(clampedX, clampedY);
        }

        // Sync to structural store
        appState.structural.updateRiser(riser.id, { x: riser.x, y: riser.y });

        const links   = appState.network.getAllLinks();
        const devices = appState.network.getAllDevices();
        this.routeManager?.reResolveAll(links, devices);
        this._render();
        return;
      }

      if (this.interaction.mode === 'move_underground-conduit') {
        const undergroundConduit = this.interaction.undergroundConduit;
        const parentShape =
          this.rectangles.find(r => r.id === undergroundConduit.parentShapeId) ||
          this.polygons.find(pol => pol.id === undergroundConduit.parentShapeId);

        if (parentShape) {
          const edges = this._getShapeEdges(parentShape);
          const bounds = {
            minX: Math.min(...edges.map(e => Math.min(e.x1, e.x2))),
            minY: Math.min(...edges.map(e => Math.min(e.y1, e.y2))),
            maxX: Math.max(...edges.map(e => Math.max(e.x1, e.x2))),
            maxY: Math.max(...edges.map(e => Math.max(e.y1, e.y2))),
          };
          const clampedX = Math.max(bounds.minX, Math.min(p.x, bounds.maxX - undergroundConduit.width));
          const clampedY = Math.max(bounds.minY, Math.min(p.y, bounds.maxY - undergroundConduit.height));
          undergroundConduit.moveTo(clampedX, clampedY);
        }

        // Sync to structural store
        appState.structural.updateUndergroundConduit(undergroundConduit.id, { x: undergroundConduit.x, y: undergroundConduit.y });

        const links   = appState.network.getAllLinks();
        const devices = appState.network.getAllDevices();
        this.routeManager?.reResolveAll(links, devices);
        this._render();
        return;
      }

      if (this.interaction.mode === 'update_cable') {
        this.currentPoint = p;
        this.hoveredDevice = this._findDeviceAt(snapped.x, snapped.y);
        this._render();
        return;
      }

      if (this.mode === 'pan') {
        this._pan(e.clientX, e.clientY);
        this._render();
        return;
      }

      if (this.mode === 'select' && this.selectedEntity && this.interaction.mode) {
        const en = this.selectedEntity;
        const moveEntities = this.interaction.entities?.length
          ? this.interaction.entities
          : [en];

        const dx = p.x - this.interaction.start.x;
        const dy = p.y - this.interaction.start.y;

        if (this.interaction.mode === "move") {
          const groupDelta = this._resolveGroupMoveDelta(moveEntities, dx, dy);

          for (const entity of moveEntities) {
            if (!entity || typeof entity.move !== 'function') continue;
            entity.move(groupDelta.dx, groupDelta.dy);
          }

          this.interaction.start = {
            x: this.interaction.start.x + groupDelta.dx,
            y: this.interaction.start.y + groupDelta.dy
          };

          const structuralEntities = moveEntities.filter(entity => !!entity?.structureType);
          if (structuralEntities.length > 0 && this.onEntityChanged) {
            structuralEntities.forEach((entity) => {
              this.onEntityChanged(entity, groupDelta.dx, groupDelta.dy);
            });
          }
          this._render();
          return;
        }

        if (this.interaction.mode === "resize" && en.type === 'rectangle') {
          let wKey = en.transform.scale.w;
          let hKey = en.transform.scale.h;
          switch (this.interaction.handle) {
            case "se":
              wKey += dx;
              hKey += dy;
              break;
            case "nw":
              en.move(dx, dy);
              wKey -= dx;
              hKey -= dy;
              break;
            case "ne":
              en.move(0, dy)
              wKey += dx;
              hKey -= dy;
              break;
            case "sw":
              en.move(dx, 0);
              wKey -= dx;
              hKey += dy;
              break;
            default:
              throw new Error();
          }
          en.setWidthAndHeight(wKey, hKey);
        }
        else if (this.interaction.mode === "resize" && this._isDeviceEntity(en)) {
          const baseBounds = this.interaction.bounds;
          const center = this.interaction.center;
          const widthRatio = (Math.abs(p.x - center.x) * 2) / baseBounds.w;
          const heightRatio = (Math.abs(p.y - center.y) * 2) / baseBounds.h;
          const factor = Math.max(
            0.25,
            this.interaction.baseScale * Math.max(widthRatio, heightRatio)
          ); // ADDED: uniformly scale the device based on dragged handle distance

          en.setScale({ factor });

          const resizedBounds = this._getEntityInteractionBounds(en);
          if (resizedBounds) {
            const dxCenter = center.x - (resizedBounds.x + resizedBounds.w / 2);
            const dyCenter = center.y - (resizedBounds.y + resizedBounds.h / 2);
            en.move(dxCenter, dyCenter); // ADDED: keep device scaling centered instead of drifting down-right
          }
        }

        this.interaction.start = { x: p.x, y: p.y };
        const shouldSyncDuringDrag = !!en.structureType; // ADDED: only structural parents need live sync while dragging so children follow immediately

        if (shouldSyncDuringDrag && this.onEntityChanged) {
          this.onEntityChanged(en, dx, dy); // CHANGED: defer device persistence until pointerup for smoother dragging
        }

        this._render();
        return;
      }

      if (
        this.mode === 'rectangle' ||
        this.mode === 'circle' ||
        this.mode === 'door' ||
        this.mode === 'window' ||
        this.mode === 'wall' ||
        this.mode === 'cable'
      ) {
        this._render();
        return;
      }

    }

  }

  _onPointerUp(e) {

  if (this.interaction && this.interaction.mode === 'update_cable') {
        const dropDevice = this._findDeviceAt(this.currentPoint.x, this.currentPoint.y);
        
        if (dropDevice) {
            // Tell the controller we want to re-attach this cable
            window.dispatchEvent(new CustomEvent('requestLinkUpdate', {
                detail: {
                    linkId: this.interaction.cable.id,
                    cableType: this.interaction.cable.type,
                    endpointType: this.interaction.endpointType,
                    newDevice: dropDevice,
                    clientX: e.clientX,
                    clientY: e.clientY
                }
            }));
        }
        
        // Reset interaction state
        this.interaction = { mode: null, handle: null, start: null };
        this.pointerHandler.setPointerDown(false);
        this.hoveredDevice = null;
        this._render(); // Snaps the cable back if dropped on empty space
        return;
    }

    if (this.interaction?.mode === 'move_conduit' ||
        this.interaction?.mode === 'move_riser' ||
        this.interaction?.mode === 'move_underground-conduit') {
      const links   = appState.network.getAllLinks();
      const devices = appState.network.getAllDevices();
      this.routeManager.reResolveAll(links, devices);
      this.interaction = { mode: null, handle: null, start: null };
      this.pointerHandler.setPointerDown(false);
      this._render();
      return;
    }

    console.log('[LogicalLayout] _onPointerUp', {
      mode: this.mode,
      pointerDown: this.pointerHandler.getIsPointerDown(),
      startPoint: this.startPoint,
      currentPoint: this.currentPoint
    });

const isDrawMode = this.mode !== 'select' && this.mode !== 'pan' && this.mode !== 'none';
    const hasValidDrawPoints = this.startPoint && this.currentPoint;

    if (isDrawMode && hasValidDrawPoints) {
      // --- THE PAPERFECT DOOR/WINDOW VALIDATION V5 ---
      let allowCreation = true;

if (this.mode === 'door' || this.mode === 'window') {
        allowCreation = false;
        let failedReason = null;
        
        const p1x = this.startPoint.x;
        const p1y = this.startPoint.y;
        const p2x = this.currentPoint.x;
        const p2y = this.currentPoint.y;
        
        // Tighter threshold (15px) so you HAVE to click exactly on the line
        const threshold = 15; 

        // MATALINONG HELPER: Hahatiin niya KAHIT ANONG shape into "Straight Lines"
        const getEdges = (entity) => {
          const edges = [];
          if (entity.points && entity.points.length > 1) { // Polygons/Freeforms
            for (let i = 0; i < entity.points.length; i++) {
              let pA = entity.points[i];
              let pB = entity.points[(i + 1) % entity.points.length];
              edges.push({ x1: pA.x, y1: pA.y, x2: pB.x, y2: pB.y });
            }
          } else if (entity.startPoint && entity.endPoint) { // Standard Lines
            edges.push({ x1: entity.startPoint.x, y1: entity.startPoint.y, x2: entity.endPoint.x, y2: entity.endPoint.y });
          } else if (entity.startX !== undefined && entity.endX !== undefined) { // Alternate Lines
            edges.push({ x1: entity.startX, y1: entity.startY, x2: entity.endX, y2: entity.endY });
          } else if (entity.x1 !== undefined && entity.x2 !== undefined) { // Alternate Lines 2
            edges.push({ x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2 });
          } else { // Rectangles / Spaces / Thick Walls (Boxes)
            const b = this._getEntityBounds(entity);
            if (b) {
              const minX = Math.min(b.minX, b.maxX);
              const maxX = Math.max(b.minX, b.maxX);
              const minY = Math.min(b.minY, b.maxY);
              const maxY = Math.max(b.minY, b.maxY);
              edges.push({ x1: minX, y1: minY, x2: maxX, y2: minY }); // Top edge
              edges.push({ x1: minX, y1: maxY, x2: maxX, y2: maxY }); // Bottom edge
              edges.push({ x1: minX, y1: minY, x2: minX, y2: maxY }); // Left edge
              edges.push({ x1: maxX, y1: minY, x2: maxX, y2: maxY }); // Right edge
            }
          }
          return edges;
        };

        const isNearEdge = (px, py, edge) => {
          return this._pointToLineDistance(px, py, edge.x1, edge.y1, edge.x2, edge.y2) <= threshold;
        };

        // Pagsamahin lahat ng pwedeng kabitan ng pinto/bintana
        const possibleHosts = [];
        if (this.walls) possibleHosts.push(...this.walls);
        if (this.rectangles) possibleHosts.push(...this.rectangles);
        if (this.polygons) possibleHosts.push(...this.polygons);
        if (this.freeforms) possibleHosts.push(...this.freeforms);
        if (appState?.structural?.spaces) possibleHosts.push(...appState.structural.spaces);

        for (const host of possibleHosts) {
          let target = host;
          // Ayusin ang format kung galing sa appState
          if (host.geometry) {
             target = { 
               x: host.geometry.x || host.geometry.left, 
               y: host.geometry.y || host.geometry.top, 
               w: host.geometry.w || host.geometry.width, 
               h: host.geometry.h || host.geometry.height 
             };
          }

          const edges = getEdges(target);
          for (const edge of edges) {
            // 🛑 RULE 1: Check ONLY if the FIRST click (p1x, p1y) is on the line.
            // This forces the hinge to be locked to the black boundary line, 
            // but the swing can go anywhere.
            if (isNearEdge(p1x, p1y, edge)) {
              allowCreation = true;
              break;
            }
          }
          if (allowCreation) break;
        }

        if (!allowCreation) {
          const itemName = this.mode === 'door' ? "door" : "window";
          failedReason = `Please start drawing the ${itemName} exactly ON a space boundary (black line).`;
        }

        // 🛑 RULE 2: Check if the door swing (p2x, p2y) exceeds the SITE boundaries.
        if (allowCreation) {
          const activeFloorId = this.activeFloorId || appState?.ui?.activeFloorId;
          const currentFloor = appState?.structural?.floors?.find(f => f.id === activeFloorId);
          const site = appState?.structural?.sites?.find(s => s.id === currentFloor?.siteId);
          
          if (site && site.geometry) {
            const b = site.geometry;
            const sx = b.x || b.left || 0;
            const sy = b.y || b.top || 0;
            const sw = b.w || b.width || 0;
            const sh = b.h || b.height || 0;
            
            const margin = 5; // A 5px allowance for snapping perfectly flush to the line
            const isInsideSite = p2x >= sx - margin && p2x <= (sx + sw) + margin &&
                                 p2y >= sy - margin && p2y <= (sy + sh) + margin;
            
            if (!isInsideSite) {
              allowCreation = false;
              failedReason = "The door swing cannot exceed the overall Site boundaries!";
            }
          }
        }

        if (!allowCreation && failedReason) {
          alert(`Invalid Placement: ${failedReason}`);
        }
      }
      // --- END VALIDATION ---

      // Only save the shape if it passed validation!
      if (allowCreation) {
        console.log('[LogicalLayout] finalizing draw mode on pointer up');
        this._createShapeFromMode();
      }
    }

    if (this.selectedEntity && (this.interaction.mode === 'move' || this.interaction.mode === 'resize')) {
      const isMove = this.interaction.mode === 'move';
      const entitiesToCommit = isMove
        ? (this.interaction.entities?.length ? this.interaction.entities : [this.selectedEntity])
        : [this.selectedEntity];

      for (const entity of entitiesToCommit) {
        if (!entity) continue;

        let restoreDx = 0;
        let restoreDy = 0;
        const hasSavedPosition = entity.savedPosition !== undefined;

        if (isMove && this._checkForOverlap(entity, "transformation")) {
          if (hasSavedPosition && typeof entity.restoreToSavedPosition === 'function') {
            restoreDx = entity.savedPosition.x - entity.x;
            restoreDy = entity.savedPosition.y - entity.y;
            entity.restoreToSavedPosition();
          }
        }

        const actualDx = hasSavedPosition
          ? entity.x - entity.savedPosition.x
          : restoreDx;
        const actualDy = hasSavedPosition
          ? entity.y - entity.savedPosition.y
          : restoreDy;

        if (this.onEntityChanged) {
          this.onEntityChanged(entity, actualDx, actualDy);
        }

        if (this._isDeviceEntity(entity) && this.routeManager) {
          const links   = appState.network.getAllLinks();
          const devices = appState.network.getAllDevices();
          this.routeManager.reResolveForDevice(entity.id, links, devices);
        }
      }
    }


    this.interaction = {
      mode: null,
      handle: null,
      start: null
    };
    this.isResizing = false;
    this.resizeStart = null;

    if (this.mode === 'pan') {
      this.pointerHandler.setCursor('grab');
    }

    this.pointerHandler.setPointerDown(false);

    this.startPoint = null;
    this.currentPoint = null;
    this._render();
  }

  _onRightClick() {
    if (this.currentFreeform.length > 1) {
      const activeFloor = appState.ui.activeFloorId; // ADDED: capture the active floor before overlap checking

      const freeform = this.shapeCreator.createFreeform(
        [...this.currentFreeform],
        this.structureType,
        this.system
      );

      if (freeform) {
        freeform.floorId = activeFloor || null; // ADDED: assign the freeform entity to the active floor

        if (freeform.bodies) {
          for (const body of freeform.bodies) {
            body.floorId = activeFloor || null; // ADDED: assign every freeform collision segment to the active floor
          }
        }

        if (!this._checkForOverlap(freeform, "creation")) {
          if (this.shapeCreator.onFreeformCreated) {
            this.shapeCreator.onFreeformCreated(freeform);
          }
          this.freeforms.push(freeform);
        } else if (freeform.bodies) {
          for (const body of freeform.bodies) {
            this.system.remove(body); // ADDED: clean up inserted collision bodies if creation fails
          }
        }
      }

      this.currentFreeform = [];
      this.mode = 'none';
      this.currentPoint = null;
      this._updateCursor();
      this._render();
    }
  }


  _findSpaceEdgeAt(x, y, tolerance = 8) {
    const focusedId   = appState.selection.focusedId;
    const focusedType = appState.selection.focusedType?.toLowerCase();

    if (!focusedId || (focusedType !== 'space' && focusedType !== 'floor')) {
      alert('Please select a Space or Floor first before placing a conduit.');
      return null;
    }

    // Find the focused shape on the canvas
    const shape =
      this.rectangles.find(r => r.id === focusedId) ||
      this.polygons.find(p => p.id === focusedId) ||
      this.circles.find(c => c.id === focusedId);

    if (!shape) {
      alert('Could not find the selected Space or Floor on the canvas.');
      return null;
    }

    const edges = this._getShapeEdges(shape);
    for (const edge of edges) {
      const dist = this._pointToLineDistance(x, y, edge.x1, edge.y1, edge.x2, edge.y2);
      if (dist <= tolerance) {
        return { shape, edge };
      }
    }

    alert('Click closer to the edge of the selected Space or Floor.');
    return null;
  }

  _getShapeEdges(shape) {
    if (shape.type === 'rectangle') {
      const { x, y } = shape;
      const w = shape.w ?? shape.width;
      const h = shape.h ?? shape.height;
      return [
        { x1: x,     y1: y,     x2: x + w, y2: y     }, // top
        { x1: x + w, y1: y,     x2: x + w, y2: y + h }, // right
        { x1: x,     y1: y + h, x2: x + w, y2: y + h }, // bottom
        { x1: x,     y1: y,     x2: x,     y2: y + h }, // left
      ];
    }

    if (shape.type === 'polygon' || shape.type === 'freeform') {
      const pts = shape.points;
      if (!pts || pts.length < 2) return [];
      const edges = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
      return edges;
    }

    return [];
  }

  _findConduitAt(x, y) {
    for (const conduit of this.conduits) {
      const dist = Math.hypot(x - conduit.x, y - conduit.y);
      if (dist <= conduit.radius + 4) return conduit; // +4 for easier clicking
    }
    return null;
  }

  _findRiserAt(x, y) {
    for (const riser of this.risers) {
      if (x >= riser.x && x <= riser.x + riser.width &&
          y >= riser.y && y <= riser.y + riser.height) {
        return riser;
      }
    }
    return null;
  }

  _findUndergroundConduitAt(x, y) {
    for (const undergroundConduit of this.undergroundConduits) {
      if (x >= undergroundConduit.x && x <= undergroundConduit.x + undergroundConduit.width &&
          y >= undergroundConduit.y && y <= undergroundConduit.y + undergroundConduit.height) {
        return undergroundConduit;
      }
    }
    return null;
  }

  _projectPointOntoShapeEdges(x, y, shape) {
    const edges = this._getShapeEdges(shape);
    let bestPoint = null;
    let bestDist = Infinity;

    for (const edge of edges) {
      const dx = edge.x2 - edge.x1;
      const dy = edge.y2 - edge.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      const t = Math.max(0, Math.min(1,
        ((x - edge.x1) * dx + (y - edge.y1) * dy) / lenSq
      ));

      const projX = edge.x1 + t * dx;
      const projY = edge.y1 + t * dy;
      const dist = Math.hypot(x - projX, y - projY);

      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = { x: projX, y: projY };
      }
    }

    return bestPoint;
  }

  _placeConduitAt(clickX, clickY) {
    const hit = this._findSpaceEdgeAt(clickX, clickY);
    if (!hit) {
      alert('Conduits must be placed on the edge of a Space or Floor.');
      return null;
    }

    const { shape, edge } = hit;

    // Snap to the closest point on the edge
    const dx = edge.x2 - edge.x1, dy = edge.y2 - edge.y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0
      ? Math.max(0, Math.min(1, ((clickX - edge.x1) * dx + (clickY - edge.y1) * dy) / lenSq))
      : 0;
    const snappedX = edge.x1 + t * dx;
    const snappedY = edge.y1 + t * dy;

    const conduit = this.shapeCreator.createConduit(snappedX, snappedY);
    if (conduit) {
      conduit.floorId = shape.floorId || null;
      conduit.spaceId = shape.structureType === 'space' ? shape.id : null;
      conduit.parentShapeId = shape.id;
      this.conduits.push(conduit);
    }
    return conduit;
  }

  _placeRiserAt(clickX, clickY) {
    const focusedId   = appState.selection.focusedId;
    const focusedType = appState.selection.focusedType?.toLowerCase();
    
    console.log(focusedType);

    if (!focusedId || (focusedType !== 'space' && focusedType !== 'floor')) {
      alert('Please select a Space or Floor first before placing a Riser.');
      return null;
    }

    const space = appState.structural.spaces.find(space => space.id === focusedId);

    const parentShape =
      this.rectangles.find(r => r.id === focusedId) ||
      this.polygons.find(p => p.id === focusedId);

    if (!parentShape) {
      alert('Could not find the selected Space or Floor on the canvas.');
      return null;
    }

    const edges = this._getShapeEdges(parentShape);
    const bounds = {
      minX: Math.min(...edges.map(e => Math.min(e.x1, e.x2))),
      minY: Math.min(...edges.map(e => Math.min(e.y1, e.y2))),
      maxX: Math.max(...edges.map(e => Math.max(e.x1, e.x2))),
      maxY: Math.max(...edges.map(e => Math.max(e.y1, e.y2))),
    };

    if (clickX < bounds.minX || clickX > bounds.maxX ||
        clickY < bounds.minY || clickY > bounds.maxY) {
      alert('Risers must be placed inside a Space or Floor.');
      return null;
    }

    parentShape.floorId = space.floorId;

    const riser = this.shapeCreator.createRiser(clickX, clickY, 5, 5);
    if (riser) {
      riser.floorId       = parentShape.floorId || null;
      riser.spaceId       = parentShape.structureType === 'space' ? parentShape.id : null;
      riser.parentShapeId = parentShape.id;  // ← this is what was missing
      this.risers.push(riser);
    }
    return riser;
  }

  _placeUndergroundConduitAt(clickX, clickY) {
    const focusedId   = appState.selection.focusedId;
    const focusedType = appState.selection.focusedType?.toLowerCase();

    if (!focusedId || (focusedType !== 'site')) {
      alert('Please select a Site first before placing an Underground Conduit.');
      return null;
    }

    const parentShape =
      this.rectangles.find(r => r.id === focusedId) ||
      this.polygons.find(p => p.id === focusedId);

    if (!parentShape) {
      alert('Could not find the selected Space or Floor on the canvas.');
      return null;
    }

    const edges = this._getShapeEdges(parentShape);
    const bounds = {
      minX: Math.min(...edges.map(e => Math.min(e.x1, e.x2))),
      minY: Math.min(...edges.map(e => Math.min(e.y1, e.y2))),
      maxX: Math.max(...edges.map(e => Math.max(e.x1, e.x2))),
      maxY: Math.max(...edges.map(e => Math.max(e.y1, e.y2))),
    };

    if (clickX < bounds.minX || clickX > bounds.maxX ||
        clickY < bounds.minY || clickY > bounds.maxY) {
      alert('Underground Conduits must be placed inside a Site.');
      return null;
    }

    const undergroundConduit = this.shapeCreator.createUndergroundConduit(clickX, clickY);
    if (undergroundConduit) {
      undergroundConduit.siteId = parentShape.id;
      undergroundConduit.parentShapeId = parentShape.id;
      this.undergroundConduits.push(undergroundConduit);
    }
    return undergroundConduit;
  }

  _createShapeFromMode() {
    const activeFloor =
      appState.selection.focusedType === 'floor'
        ? appState.selection.focusedId
        : appState.ui.activeFloorId;

    const activeSpace =
      (appState.selection.focusedType === 'space' ||
        appState.selection.focusedType === 'Space')
        ? appState.selection.focusedId
        : null;

    console.log('The Active Space is: ', activeSpace);
    const focusedId = appState.selection.focusedId;

    if (this.mode === 'rectangle') {
      const rect = this.shapeCreator.createRectangle(
        this.startPoint,
        this.currentPoint,
        this.structureType,
        focusedId
      );
      if (rect) {
        rect.floorId = activeFloor || null;
        if (rect.body) rect.body.floorId = activeFloor || null;
        console.log(`📦 Created canvas rectangle with ID: ${rect.id}, Type: ${this.structureType}`);
        if (!this._checkForOverlap(rect, "creation")) {
          if (this.shapeCreator.onRectangleCreated) {
            this.shapeCreator.onRectangleCreated(rect);
          }
          this.rectangles.push(rect);
        }
      }
    } else if (this.mode === 'circle') {
      const circle = this.shapeCreator.createCircle(
        this.startPoint,
        this.currentPoint,
        this.structureType,
        focusedId
      );
      if (circle) {
        circle.floorId = activeFloor || null;
        if (circle.body) circle.body.floorId = activeFloor || null;
        if (!this._checkForOverlap(circle, "creation")) {
          if (this.shapeCreator.onCircleCreated) {
            this.shapeCreator.onCircleCreated(circle);
          }
          this.circles.push(circle);
        }
      }
    } else if (this.mode === 'wall') {
      const wall = this.shapeCreator.createWall(this.startPoint, this.currentPoint);
      if (wall) {
        wall.floorId = activeFloor || null;
        if (wall.body) wall.body.floorId = activeFloor || null;
        this.walls.push(wall);
      }
} else if (this.mode === 'door') {
      // 🛑 GHOSTBUSTER HACK: Pigilan si ShapeCreator na mag-snitch agad sa React Hierarchy!
      const uiCallback = this.shapeCreator.onDoorCreated;
      this.shapeCreator.onDoorCreated = null; 

      const door = this.shapeCreator.createDoor(this.startPoint, this.currentPoint);
      
      this.shapeCreator.onDoorCreated = uiCallback; // Ibalik ang callback

      if (door) {
        door.floorId = activeFloor || null;
        door.spaceId = activeSpace || null;
        if (door.body) door.body.floorId = activeFloor || null;

        if (door.spaceId !== null && !this._checkForOverlap(door, "creation")) {
          this.doors.push(door);
          // ✅ PUMASA SA CANVAS! Ngayon lang natin sasabihan ang UI na i-add ito.
          if (this.shapeCreator.onDoorCreated) this.shapeCreator.onDoorCreated(door);
        } else {
          // ❌ FAILED OVERLAP: Burahin ang body, at walang makakarating na ghost sa UI.
          if (door.body) this.system.remove(door.body);
          if (door.spaceId === null) alert('Doors must be placed in a Space.');
        }
      }
      
      // ✅ TANGGAL NA YUNG RESET DITO. STAY SA 'door' MODE FOR UNLI-DRAW!

    } else if (this.mode === 'window') {
      // 🛑 GHOSTBUSTER HACK: Same strategy for windows!
      const uiCallback = this.shapeCreator.onWindowCreated;
      this.shapeCreator.onWindowCreated = null;

      const window = this.shapeCreator.createWindow(this.startPoint, this.currentPoint);
      
      this.shapeCreator.onWindowCreated = uiCallback; // Ibalik ang callback

      if (window) {
        window.floorId = activeFloor || null;
        window.spaceId = activeSpace || null;
        if (window.body) window.body.floorId = activeFloor || null;

        if ((window.spaceId !== null || window.floorId !== null) && !this._checkForOverlap(window, "creation")) {
          this.windows.push(window);
          // ✅ PUMASA SA CANVAS!
          if (this.shapeCreator.onWindowCreated) this.shapeCreator.onWindowCreated(window);
        } else {
          // ❌ FAILED OVERLAP!
          if (window.body) this.system.remove(window.body);
          if (window.spaceId === null && window.floorId === null) alert('Windows must be placed in a Space or Floor.');
        }
      }
      // ✅ TANGGAL NA YUNG RESET DITO. STAY SA 'window' MODE FOR UNLI-DRAW!
    } else if (this.mode === 'polygon') {
      const polygon = this.shapeCreator.createPolygon(this.currentPolygon, this.structureType, focusedId);
      if (polygon) {
        polygon.floorId = activeFloor || null;
        if (polygon.body) polygon.body.floorId = activeFloor || null;
        if (!this._checkForOverlap(polygon, "creation")) {
          this.polygons.push(polygon);
        } else {
          // Remove polygon bodies if overlap check failed
          if (polygon.bodies) {
            for (const body of polygon.bodies) {
              this.system.remove(body);
            }
          } else if (polygon.body) {
            this.system.remove(polygon.body);
          }
        }
      }
    } else if (this.mode === 'conduit') {
      this._placeConduitAt(this.currentPoint.x, this.currentPoint.y);
    } else if (this.mode === 'riser') {
      this._placeRiserAt(this.currentPoint.x, this.currentPoint.y);
    } else if (this.mode === 'underground-conduit') {
      this._placeUndergroundConduitAt(this.currentPoint.x, this.currentPoint.y);
    }
  }

  _pan(clientX, clientY) {
    const delta = this.pointerHandler.getPanDelta(clientX, clientY);
    this.viewState.e += delta.dx;
    this.viewState.f += delta.dy;
    this.pointerHandler.setPanStart(clientX, clientY);
  }

  _renderDeviceCables(ctx, activeFloor) {
    ctx.save();
    ctx.lineWidth = 2;

    for (const cable of this.cables) {
      if (this.interaction && this.interaction.mode === 'update_cable' && this.interaction.cable.id === cable.id) {
        continue;
      }

      const src = this.findEntityById(cable.sourceId);
      const dst = this.findEntityById(cable.targetId);

      if (!src || !dst) continue;

      if (activeFloor) {
        const srcOnFloor = src.floorId == null || src.floorId === activeFloor;
        const dstOnFloor = dst.floorId == null || dst.floorId === activeFloor;
        if (!srcOnFloor || !dstOnFloor) continue;
      }

      const resolvedPath = this.routeManager?.getPath(cable.linkId || cable.id) || this.routeManager?.getPath(cable.id);
      const isPartial = resolvedPath?.isPartial ?? false;
      ctx.beginPath();
      if (resolvedPath && !resolvedPath.isDirect && resolvedPath.canvasPoints.length >= 2) {
        // Draw segmented route through conduits/risers
        const pts = resolvedPath.canvasPoints;
        ctx.moveTo(src.x, src.y); 
        for (let i = 1; i < pts.length - 1; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.lineTo(dst.x, dst.y);
      } else {
        // Fallback: straight line (same space or not yet resolved)
        if (cable.type === 'console') {
          const midX = (src.x + dst.x) / 2;
          const midY = (src.y + dst.y) / 2 - 40;
          ctx.moveTo(src.x, src.y);
          ctx.quadraticCurveTo(midX, midY, dst.x, dst.y);
        } else {
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(dst.x, dst.y);
        }
      }

      if (isPartial) {
        ctx.strokeStyle = '#f97316'; // orange = missing pathway warning
        ctx.setLineDash([6, 3]);
      } else if (cable.type === 'copper-crossover') {
        ctx.strokeStyle = '#000000';
        ctx.setLineDash([6, 4]);
      } else if (cable.type === 'console') {
        ctx.strokeStyle = '#007BFF';
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = '#000000';
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  // Add this inside LogicalLayout class
  _hitTestCable(px, py, src, dst, tolerance) {
    // 1. Broadphase AABB Check (Ultra-fast cull)
    // Prevents expensive math if the mouse isn't even near the general area of the cable
    const minX = Math.min(src.x, dst.x) - tolerance;
    const maxX = Math.max(src.x, dst.x) + tolerance;
    const minY = Math.min(src.y, dst.y) - tolerance;
    const maxY = Math.max(src.y, dst.y) + tolerance;

    if (px < minX || px > maxX || py < minY || py > maxY) {
      return false;
    }

    // 2. Narrowphase (Actual geometric distance)
    const dist = this._pointToLineDistance(px, py, src.x, src.y, dst.x, dst.y);
    return dist <= tolerance;
  }

  _render() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const zoomFactor = this.pointerHandler.getZoom();
    const scale = this.devicePixelRatio * zoomFactor;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      this.viewState.e * this.devicePixelRatio,
      this.viewState.f * this.devicePixelRatio
    )

    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, w, h);

    this.grid.renderMinorGrids(ctx, w, h);
    this.grid.renderMajorGrids(ctx, w, h);

    // Only filter by floor if a floor is explicitly focused. Otherwise, render all floors stacked.
    const shouldFilterByFloor = appState.selection.focusedType === 'floor';
    const activeFloor = shouldFilterByFloor ? (this.activeFloorId || appState.ui.activeFloorId) : null;
    const filterForFloor = (arr) => {
      if (!activeFloor) return arr;
      return arr.filter(o => o.floorId == null || o.floorId === activeFloor);
    };

    this.shapeRenderer.renderRectangles(ctx, filterForFloor(this.rectangles));
    this.shapeRenderer.renderPolygons(ctx, filterForFloor(this.polygons));
    this.shapeRenderer.renderFreeforms(ctx, this.freeforms);
    this.shapeRenderer.renderCircles(ctx, filterForFloor(this.circles));
    this.shapeRenderer.renderWalls(ctx, filterForFloor(this.walls));

    const visibleDoors = filterForFloor(this.doors);
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 2;
    for (const door of visibleDoors) {
      if (door.path) {
        ctx.fill(door.path);
        ctx.stroke(door.path);
      }
    }
    ctx.restore();

    this.shapeRenderer.renderDoors?.(ctx, visibleDoors);

    const visibleWindows = filterForFloor(this.windows);
    ctx.save();
    ctx.strokeStyle = '#c6e0ff';
    ctx.fillStyle = 'rgb(200, 223, 255)';
    ctx.lineWidth = 2;
    for (const window of visibleWindows) {
      if (window.path) {
        ctx.fill(window.path);
        ctx.stroke(window.path);
      }
    }
    ctx.restore();

    this.shapeRenderer.renderDoors?.(ctx, visibleWindows);

    this._renderDeviceCables(ctx, activeFloor);

    ctx.save();
    for (const device of filterForFloor(this.devices)) {
      ctx.fillStyle = '#ffffff00';
      ctx.strokeStyle = '#cbd5e100';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(
        device.tileX,
        device.tileY,
        device.tileWidth,
        device.tileHeight,
        8
      );
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    for (const furniture of this.furnitures) {
      const tileW = furniture.width + 32;
      const tileH = furniture.height + 45;
      const tx = furniture.x - tileW / 2;
      const ty = furniture.y - tileH / 2.5;

      ctx.fillStyle = '#ffffff00';
      ctx.strokeStyle = '#cbd5e100';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(tx, ty, tileW, tileH, 8);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    this.shapeRenderer.renderDevices(ctx, filterForFloor(this.devices));
    this.shapeRenderer.renderFurnitures(ctx, filterForFloor(this.furnitures));

    const entitiesToOutline = this.selectedEntities?.length
      ? this.selectedEntities
      : (this.selectedEntity ? [this.selectedEntity] : []);

    for (const selected of entitiesToOutline) {
      if (!selected?.sourceId) continue;

      const src = this.findEntityById(selected.sourceId);
      const dst = this.findEntityById(selected.targetId);

      if (src && dst) {
        ctx.save();
        ctx.strokeStyle = "#00AEEF";
        ctx.lineWidth = 4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(dst.x, dst.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    if ((this.currentPolygon.length > 0 || this.currentFreeform.length > 0) && this.currentPoint) {
      ctx.save();
      ctx.strokeStyle = '#00ff00';
      ctx.fillStyle = 'rgba(0,255,0,0.08)';
      ctx.lineWidth = 1.5;
      let points;
      if (this.mode === 'polygon') {
        points = this.currentPolygon;
      }
      else if (this.mode === 'freeform') {
        points = this.currentFreeform;
      }
      this.shapeRenderer.outlinePolygonOrFreeformInProgress(
        ctx,
        points,
        this.currentPoint,
        this.grid.getSnapTolerance()
      );
      ctx.restore();
    }
else if (this.startPoint && this.currentPoint) {
      ctx.save();
      
      // --- IBALIK ANG GREEN SA LAHAT NG SPACES/DOMAINS/SITES ---
      ctx.strokeStyle = '#00ff00'; 
      ctx.fillStyle = 'rgba(0,255,0,0.08)';
      ctx.lineWidth = 1.5;

      if (this.mode === 'door') {
        // --- GHOST DOOR OUTLINE ---
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2; // Pakapalin ng konti ang door

        // Door leaf (line)
        ctx.beginPath();
        ctx.moveTo(this.startPoint.x, this.startPoint.y);
        ctx.lineTo(this.currentPoint.x, this.currentPoint.y);
        ctx.stroke();

        // Door swing (arc)
        const dx = this.currentPoint.x - this.startPoint.x;
        const dy = this.currentPoint.y - this.startPoint.y;
        const doorLength = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const arcRadius = doorLength;
        const arcStart = angle;
        const arcEnd = angle + Math.PI / 2; // 90 degree swing

        ctx.beginPath();
        ctx.arc(this.startPoint.x, this.startPoint.y, arcRadius, arcStart, arcEnd, false);
        ctx.stroke();

        ctx.globalAlpha = 1.0;
      } else if (this.mode === 'rectangle') {
        this.shapeRenderer.outlineRectangle(ctx, this.startPoint, this.currentPoint);
      } else if (this.mode === 'circle') {
        this.shapeRenderer.outlineCircle(ctx, this.startPoint, this.currentPoint);
      } else if (this.mode === 'wall') {
        this.shapeRenderer.outlineWall(ctx, this.startPoint, this.currentPoint);
} else if (this.mode === 'window') {
        // --- GHOST WINDOW PREVIEW (GREEN ERA!) ---
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#00ff00'; // GREEN na siya habang dino-drawing!
        ctx.lineWidth = 4; // Medyo makapal para kitang-kita
        
        ctx.beginPath();
        ctx.moveTo(this.startPoint.x, this.startPoint.y);
        ctx.lineTo(this.currentPoint.x, this.currentPoint.y);
        ctx.stroke();

        ctx.globalAlpha = 1.0;
      } else if (this.mode === 'cable') {
        this.shapeRenderer.outlineCable(ctx, this.startPoint, this.currentPoint);
      }

      ctx.restore();
    }

    ctx.save();
    for (const conduit of filterForFloor(this.conduits)) {
      const isSelected = this.selectedEntity?.id === conduit.id ||
        this.selectedEntities?.some(e => e?.id === conduit.id);

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(conduit.x, conduit.y, conduit.radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#00AEEF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(conduit.x, conduit.y, conduit.radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#e2e8f0' : '#000000';
      ctx.strokeStyle = isSelected ? '#00AEEF' : '#000000';
      ctx.lineWidth = isSelected ? 2 : 4;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    for (const riser of filterForFloor(this.risers)) {
      const isSelected = this.selectedEntity?.id === riser.id ||
        this.selectedEntities?.some(e => e?.id === riser.id);

      if (isSelected) {
        ctx.beginPath();
        ctx.rect(riser.x - 3, riser.y - 3, riser.width + 6, riser.height + 6);
        ctx.strokeStyle = '#00AEEF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.strokeStyle = isSelected ? '#00AEEF' : '#000000';
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.stroke(riser.path);
    }
    ctx.restore();

    ctx.save();
    for (const undergroundConduit of this.undergroundConduits) {
      const isSelected = this.selectedEntity?.id === undergroundConduit.id ||
        this.selectedEntities?.some(e => e?.id === undergroundConduit.id);

      ctx.beginPath();
      ctx.arc(undergroundConduit.x, undergroundConduit.y, undergroundConduit.radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#e2e8f0' : '#000000';
      ctx.strokeStyle = isSelected ? '#00AEEF' : '#000000';
      ctx.lineWidth = isSelected ? 2 : 4;
      ctx.fill();
      ctx.stroke(undergroundConduit.path);
    }
    ctx.restore();

    for (const en of entitiesToOutline) {
      if (!en || en.sourceId) continue;

      const bounds = this._getEntityInteractionBounds(en);
      const x = bounds?.x;
      const y = bounds?.y;
      const w = bounds?.w;
      const h = bounds?.h;
      const isCircle = en.type === 'circle' && en.r !== undefined;
      const isFocused = this.selectedEntity?.id === en.id;

      if (isCircle || (x !== undefined && w !== undefined)) {
        ctx.save();
        ctx.strokeStyle = "#00AEEF";
        ctx.lineWidth = isFocused ? 2 : 1.5;

        if (isCircle) {
          ctx.beginPath();
          ctx.arc(en.x, en.y, en.r, 0, Math.PI * 2);
          ctx.stroke();

          if (isFocused) {
            const size = 8;
            const handles = [
              [en.x, en.y - en.r],
              [en.x, en.y + en.r],
              [en.x - en.r, en.y],
              [en.x + en.r, en.y]
            ];

            ctx.fillStyle = "#00AEEF";
            handles.forEach(([hx, hy]) => {
              ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
            });
          }
        } else {
          ctx.strokeRect(x, y, w, h);

          if (isFocused) {
            const size = 8;
            const handles = [
              [x, y], [x + w, y], [x, y + h], [x + w, y + h]
            ];

            ctx.fillStyle = "#00AEEF";
            handles.forEach(([hx, hy]) => {
              ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
            });
          }
        }

        if (isFocused) {
          const isStructural = ['rectangle', 'site', 'domain', 'space', 'polygon', 'freeform', 'circle'].includes(en.type);

          if (isStructural) {
            ctx.fillStyle = "black";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";

            if (en.type === 'circle' && en.r !== undefined) {
              const diameter = en.r * 2;
              const circumference = 2 * Math.PI * en.r;

              const diameterInMeters = UnitSystem.format(GridScale.toMeters(diameter), 'm');
              const circumferenceInMeters = UnitSystem.format(GridScale.toMeters(circumference), 'm');

              ctx.fillText(`Ø ${diameterInMeters}`, en.x, en.y - en.r - 20);
              ctx.fillText(`C ${circumferenceInMeters}`, en.x, en.y + en.r + 35);
            } else if (en.points && en.points.length > 1) {
              for (let i = 0; i < en.points.length; i++) {
                const p1 = en.points[i];
                const p2 = en.points[(i + 1) % en.points.length];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const pixelDistance = Math.sqrt(dx * dx + dy * dy);
                const meters = UnitSystem.format(GridScale.toMeters(pixelDistance), 'm');
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;

                let angle = Math.atan2(dy, dx);
                if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
                  angle += Math.PI;
                }

                ctx.save();
                ctx.translate(midX, midY);
                ctx.rotate(angle);
                ctx.fillText(meters, 0, -8);
                ctx.restore();
              }
            } else {
              if (w !== undefined) {
                const widthInMeters = UnitSystem.format(GridScale.toMeters(w), 'm');
                ctx.fillText(widthInMeters, x + (w / 2), y - 15);
              }

              if (h !== undefined) {
                const heightInMeters = UnitSystem.format(GridScale.toMeters(h), 'm');
                ctx.save();
                ctx.translate(x + w + 20, y + (h / 2));
                ctx.rotate(Math.PI / 2);
                ctx.fillText(heightInMeters, 0, 0);
                ctx.restore();
              }
            }
          }
        }

            ctx.restore();
          }
        }

    if (this.hoveredCable && this.mode === 'select') {
      const cable = this.hoveredCable;
      const src = this.findEntityById(cable.sourceId);
      const dst = this.findEntityById(cable.targetId);

      if (src && dst) {
        ctx.save();
        ctx.strokeStyle = "rgba(0, 174, 239, 0.4)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(dst.x, dst.y);
        ctx.stroke();

        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const drawPortBadge = (x, y, text) => {
          if (!text) return;
          const displayStr = typeof text === 'object' ? (text.name || text.id || "port") : text;
          const textMetrics = ctx.measureText(displayStr);
          const bgW = textMetrics.width + 12;
          const bgH = 20;

          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x - bgW / 2, y - bgH / 2, bgW, bgH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#0f172a";
          ctx.fillText(displayStr, x, y);
        };

        const dx = dst.x - src.x;
        const dy = dst.y - src.y;
        const angle = Math.atan2(dy, dx);
        const offset = 40;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > offset * 2.5) {
          drawPortBadge(src.x + Math.cos(angle) * offset, src.y + Math.sin(angle) * offset, cable.sourcePort);
          drawPortBadge(dst.x - Math.cos(angle) * offset, dst.y - Math.sin(angle) * offset, cable.targetPort);
        }

        ctx.restore();
      }
    }

    if (this.interaction && this.interaction.mode === 'update_cable' && this.currentPoint) {
      const fixed = this.interaction.fixedDevice;
      ctx.save();
      ctx.strokeStyle = "#ff9900"; // Orange dragging line
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(fixed.x, fixed.y);
      ctx.lineTo(this.currentPoint.x, this.currentPoint.y);
      ctx.stroke();
      ctx.restore();
    }

    if (this.pendingCableSource && this.interaction?.mode !== 'update_cable') {
      const en = this.pendingCableSource;
      const w = en.renderWidth + 4;
      const h = en.renderHeight + 4;
      const x = en.x - 2;
      const y = en.y - 2;

      ctx.save();
      ctx.strokeStyle = "#ff9900";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.stroke();
      ctx.restore();
    }

    if (this.interaction?.mode === 'update_cable' && this.hoveredDevice) {
      const en = this.hoveredDevice;
      const w = en.renderWidth + 4;
      const h = en.renderHeight + 4;
      const x = en.x - 2;
      const y = en.y - 2;

      ctx.save();
      ctx.strokeStyle = "#ff9900";  // same orange as "on hold"
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.stroke();
      ctx.restore();
    }

    if (this.hoveredDevice && this.mode === 'cable' && this.interaction?.mode !== 'update_cable') {
      const en = this.hoveredDevice;
      const w = en.renderWidth + 4;
      const h = en.renderHeight + 4;
      const x = en.x - 2;
      const y = en.y - 2;

      ctx.save();
      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 3;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8);
      ctx.stroke();
      ctx.restore();
    }
  }

  getAllSelectableEntities() {
    return [
      this.cables,
      this.devices,
      this.furnitures,
      this.rectangles,
      this.polygons,
      this.circles,
      this.walls,
      this.doors,
      this.windows,
      this.roofs,
      this.freeforms,
      this.furnitures,
      this.conduits,
      this.risers,
      this.undergroundConduits
    ];
  }

  findEntityById(id) {
    const lists = this.getAllSelectableEntities();
    for (const arr of lists) {
      if (!arr) continue;
      for (const en of arr) {
        if (en && (en.id === id || String(en.id) === id)) {
          return en;
        }
      }
    }

    return null;
  }

  removeEntityById(id) {
    if (!id) return false;

    // 1. Deselect if currently selected
    if (this.selectedEntity && this.selectedEntity.id === id) {
      this.selectedEntity = null;
      this.interaction = { mode: null, handle: null, start: null };
      this.pointerHandler.setCursor('default');
    }

    // 2. Cascade: remove all cables connected to this device BEFORE the device
    //    itself is spliced, so sourceDeviceId / targetDeviceId lookups still resolve.
    this._removeCablesForDevice(id);

    // 3. Find and splice the entity from its array
    let entityToRemove = null;
    let removedStructuralEntity = false;
    const targetArrays = ['rectangles', 'circles', 'polygons', 'freeforms',
                          'devices', 'furnitures', 'cables', 'walls', 'conduits', 'risers', 'undergroundConduits'];

    for (const arrName of targetArrays) {
      if (!this[arrName]) continue;
      const index = this[arrName].findIndex(en => en.id === id);
      if (index !== -1) {
        entityToRemove = this[arrName][index];
        this[arrName].splice(index, 1);
        if (['conduits', 'risers', 'undergroundConduits'].includes(arrName)) {
          removedStructuralEntity = true;
        }
        break;
      }
    }

    // 4. Remove from physics system
    if (entityToRemove?.body && this.system) {
      try { this.system.remove(entityToRemove.body); }
      catch (e) { console.warn('Could not remove body from physics system', e); }
    }

    if (removedStructuralEntity && this.routeManager) {
      const links = appState.network.getAllLinks();
      const devices = appState.network.getAllDevices();
      this.routeManager.reResolveAll(links, devices);
    }

    this._render();
    return true;
  }

  /**
   * Remove all canvas cables connected to a given device and dispatch
   * a teardown event so the controller can call link.bringDown() on the
   * logical networking layer without creating a circular dependency here.
   *
   * @param {string} deviceId
   */
  _removeCablesForDevice(deviceId) {
    const connected = this.cables.filter(
      c => c.sourceDeviceId === deviceId || c.targetDeviceId === deviceId
    );

    for (const cable of connected) {
      // Ask the controller to tear down the logical Link
      if (cable.linkId) {
        window.dispatchEvent(new CustomEvent('requestLinkTeardown', {
          detail: { linkId: cable.linkId },
        }));
      }

      // Clear any canvas references to this cable
      if (this.selectedEntity?.id === cable.id) this.selectedEntity = null;
      if (this.hoveredCable?.id === cable.id) this.hoveredCable = null;
    }

    // Remove from canvas cable array
    this.cables = this.cables.filter(
      c => c.sourceDeviceId !== deviceId && c.targetDeviceId !== deviceId
    );
  }

  updateEntityTransform(id, updates = {}, skipOverlapCheck = false) {
    const en = this.findEntityById(id);
    if (!en) return false;

    const overlapValidator = skipOverlapCheck ? () => false : this._checkForOverlap.bind(this);

    if (this.entityTransformer.applyEntityTransform(en, updates, overlapValidator)) {
      this._render();
      return true;
    }
    return false;
  }

  identifyEntity(x, y, options = {}) {
    const multiSelect = !!options.multiSelect;

    for (const cable of this.cables) {
      const src = this.findEntityById(cable.sourceId);
      const dst = this.findEntityById(cable.targetId);
      if (!src || !dst) continue;

      // Re-use our optimized hit test with a generous 8px click radius
      if (this._hitTestCable(x, y, src, dst, 8)) {
        return this._applySelectionForEntity(cable, multiSelect);
      }
    }

    const entities = this.getAllSelectableEntities();
    console.log('[IDENTIFY] checking', entities.flat().length, 'entities, ctx:', !!this.ctx);
    let en = null;

    for (const device of this.devices) {
      const bounds = this._getEntityInteractionBounds(device);
      if (bounds && x >= bounds.x && x <= bounds.x + bounds.w
        && y >= bounds.y && y <= bounds.y + bounds.h) {
        en = device;
        break;
      }
    }

    if (!en) {
      for (const furniture of this.furnitures) {
        const bounds = this._getEntityInteractionBounds(furniture);
        if (bounds && x >= bounds.x && x <= bounds.x + bounds.w
          && y >= bounds.y && y <= bounds.y + bounds.h) {
          en = furniture;
          break;
        }
      }
    }

    // Only fall back to the canvas path-based hit-test for structural shapes
    // (rectangles, polygons, circles etc.) if no device/furniture was hit.
    if (!en) {
      const structuralEntities = [
        this.rectangles, this.polygons, this.circles,
        this.walls, this.doors, this.windows, this.roofs, this.freeforms,
        this.undergroundConduits
      ];
      en = this.selection.identifyEntity(x, y, structuralEntities, this.ctx);
    }
    
    if (!en) {
      this.selectedEntity = null;

      if (!multiSelect) {
        appState.selection.clearSelection?.();
        if (this.onEntitySelected) this.onEntitySelected(null);
        this._render();
      }

      return { entity: null, selectionOnly: multiSelect };
    }

    return this._applySelectionForEntity(en, multiSelect);
  }

  _applySelectionForEntity(en, multiSelect = false) {
    this.selectedEntity = en || null;

    if (!en) {
      if (this.onEntitySelected) this.onEntitySelected(null);
      this._render();
      return { entity: null, selectionOnly: false };
    }

    const selectionCount = appState.selection.getSelectionCount?.() ?? 0;
    const preserveExistingGroup =
      !multiSelect &&
      selectionCount > 1 &&
      (
        (en.sourceId && en.targetId && appState.selection.isLinkSelected?.(en.id)) ||
        (this._isFurnitureEntity(en) && appState.selection.isFurnitureSelected?.(en.id)) ||
        (!en.structureType && !this._isFurnitureEntity(en) && !en.sourceId && appState.selection.isDeviceSelected?.(en.id))
      );

    if (preserveExistingGroup) {
      const focusType = en.sourceId && en.targetId
        ? 'cable'
        : this._isFurnitureEntity(en)
          ? 'furniture'
          : 'device';

      appState.selection.focusSelection?.(en.id, focusType);
      if (this.onEntitySelected) this.onEntitySelected(this.selectedEntity);
      this._render();
      return {
        entity: this.selectedEntity,
        selectionOnly: false
      };
    }

    if (en.structureType) {
      appState.selection.focusedNode(en.id, en.structureType.toLowerCase());
    } else if (en.sourceId && en.targetId) {
      if (multiSelect) {
        const stillSelected = appState.selection.toggleLinkSelection?.(en.id);
        this.selectedEntity = stillSelected ? en : this.findEntityById(appState.selection.getFocusedId?.());
      } else {
        appState.selection.selectLink?.(en.id, false);
      }
    } else if (this._isFurnitureEntity(en)) {
      if (multiSelect) {
        const stillSelected = appState.selection.toggleFurnitureSelection?.(en.id);
        this.selectedEntity = stillSelected ? en : this.findEntityById(appState.selection.getFocusedId?.());
      } else {
        appState.selection.selectFurniture?.(en.id, false);
      }
    } else {
      if (multiSelect) {
        const stillSelected = appState.selection.toggleDeviceSelection?.(en.id);
        this.selectedEntity = stillSelected ? en : this.findEntityById(appState.selection.getFocusedId?.());
      } else {
        appState.selection.selectDevice?.(en.id, false);
      }
    }

    if (this.onEntitySelected) this.onEntitySelected(this.selectedEntity);

    this._render();
    return {
      entity: multiSelect ? null : this.selectedEntity,
      selectionOnly: multiSelect
    };
  }

  setZoom(zoom) {
    this.pointerHandler.setZoom(zoom);
    this._render();
  }

  // _isDeviceEntity(en) {
  //   // Primary check: stable flag set in Device (UI) constructor.
  //   // Fallback duck-type handles canvas entities from older save files
  //   // that pre-date the entityType field.
  //   return !!en && (
  //     en.entityType === 'device' ||
  //     en.catalogId  !== undefined ||
  //     en.interfaces !== undefined
  //   );
  // }

  _isDeviceEntity(en) {
    // Primary check: stable flag set in Device (UI) constructor.
    // Fallback duck-type handles canvas entities from older save files
    // that pre-date the entityType field.
    if (!en || this._isFurnitureEntity(en)) {
      return false;
    }

    return (
      en.entityType === 'device' ||
      en.catalogId !== undefined ||
      en.interfaces !== undefined
    );
  }







  
  // _isFurnitureEntity(en) {
  //   return !!en && (en.type === 'furniture' || en.id?.startsWith('furniture'));
  // }

  // Updated furniture detection with more robust duck-typing to handle legacy entities without entityType
  _isFurnitureEntity(en) {
    if (!en || en.sourceId || en.targetId || en.interfaces !== undefined) return false;

    return (
      en.entityType === 'furniture' ||
      en.type === 'furniture' ||
      ['desk', 'chair', 'rack', 'cabinet', 'table'].includes(en.type) ||
      ['desk', 'chair', 'rack', 'cabinet', 'table'].includes(en.catalogId) ||
      ['desk', 'chair', 'rack', 'cabinet', 'table'].includes(en.modelId) ||
      en.id?.startsWith('furniture')
    );
  }

  _isResizableEntity(en) {
    return !!en && (en.type === 'rectangle' || this._isDeviceEntity(en)); // ADDED: devices can now use resize handles too
  }

  _getEntityBounds(en) {
    if (!en) return null;

    if (this._isDeviceEntity(en)) {
      return {
        minX: en.tileX,
        minY: en.tileY,
        maxX: en.tileX + en.tileWidth,
        maxY: en.tileY + en.tileHeight,
        width: en.tileWidth,
        height: en.tileHeight
      };
    }

    if (this._isFurnitureEntity(en)) {
      const w = (en.width ?? 0) + 32;
      const h = (en.height ?? 0) + 45;
      const x = en.x - w / 2;
      const y = en.y - h / 2.5;
      return {
        minX: x,
        minY: y,
        maxX: x + w,
        maxY: y + h,
        width: w,
        height: h
      };
    }

    const x = Number(en.x ?? 0);
    const y = Number(en.y ?? 0);
    const w = Number(en.w ?? en.width ?? 0);
    const h = Number(en.h ?? en.height ?? 0);
    return {
      minX: x,
      minY: y,
      maxX: x + w,
      maxY: y + h,
      width: w,
      height: h
    };
  }

  _getParentBounds(en) {
    if (!en || !appState.structural) return null;
    const st = appState.structural;
    const getBounds = (shape) => {
      if (!shape) return null;
      const src = shape.geometry || shape;
      const x = Number(src.x ?? src.left ?? 0);
      const y = Number(src.y ?? src.top ?? 0);
      const w = Number(src.w ?? src.width ?? 0);
      const h = Number(src.h ?? src.height ?? 0);
      return {
        minX: Math.min(x, x + w),
        minY: Math.min(y, y + h),
        maxX: Math.max(x, x + w),
        maxY: Math.max(y, y + h),
        width: Math.abs(w),
        height: Math.abs(h)
      };
    };

    if (en.spaceId) {
      const space = st.spaces?.find(s => s.id === en.spaceId);
      if (space) return getBounds(space);
    }

    if (en.floorId) {
      const floor = st.floors?.find(f => f.id === en.floorId);
      if (floor) {
        const floorBounds = getBounds(floor);
        if (floorBounds && floorBounds.width > 0 && floorBounds.height > 0) {
          return floorBounds;
        }
        const parentSite = st.sites?.find(s => s.id === floor.siteId);
        if (parentSite) return getBounds(parentSite);
      }
    }

    return null;
  }

  _clampMovementWithinParent(en, dx, dy) {
    const entityBounds = this._getEntityBounds(en);
    const parentBounds = this._getParentBounds(en);
    if (!entityBounds || !parentBounds) return { dx, dy };

    let clampedDx = dx;
    let clampedDy = dy;

    if (entityBounds.minX + clampedDx < parentBounds.minX) {
      clampedDx = parentBounds.minX - entityBounds.minX;
    }
    if (entityBounds.maxX + clampedDx > parentBounds.maxX) {
      clampedDx = parentBounds.maxX - entityBounds.maxX;
    }
    if (entityBounds.minY + clampedDy < parentBounds.minY) {
      clampedDy = parentBounds.minY - entityBounds.minY;
    }
    if (entityBounds.maxY + clampedDy > parentBounds.maxY) {
      clampedDy = parentBounds.maxY - entityBounds.maxY;
    }

    return { dx: clampedDx, dy: clampedDy };
  }

  _getEntityInteractionBounds(en) {
    if (!en) return null;

    if (en.type === 'conduit') return null;

    if (en.type === 'riser') return null;

    if (en.type === 'undergroundConduit') return null;

    if (this._isDeviceEntity(en)) {
      return {
        x: en.tileX,       // ADDED: devices are drawn/hit-tested using tile bounds, not raw x/y/w/h
        y: en.tileY,
        w: en.tileWidth,
        h: en.tileHeight
      };
    }

    if (this._isFurnitureEntity(en)) {
      const w = (en.width ?? 0) + 32;
      const h = (en.height ?? 0) + 45;

      return {
        x: en.x - w / 2,
        y: en.y - h / 2.5,
        w,
        h
      };
    }

    return {
      x: en.x,
      y: en.y,
      w: en.w ?? en.width,
      h: en.h ?? en.height
    };
  }



  _findDeviceAt(x, y) {
    for (const device of this.devices) {
      const bounds = this._getEntityInteractionBounds(device); // ADDED: use the same tile bounds used for selection/highlighting
      console.log('[FIND_DEVICE] checking', device.id, 'bounds:', bounds, 'click:', x, y);
      if (!bounds) continue;


      if (
        x >= bounds.x &&
        x <= bounds.x + bounds.w &&
        y >= bounds.y &&
        y <= bounds.y + bounds.h
      ) {
        return device;
      }
    }
    return null;
  }

  _pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  _checkForOverlap(currentEntity, action) {
    if (currentEntity === null) {
      return true;
    }
    let ancestorsId = [];
    if (currentEntity.structureType !== undefined && appState.selection.focusedType !== null) {
       ancestorsId = appState.structural.getAncestorsId();
    }

// 🛑 THE FIX: Ignore overlap for Assets AND Fenestrations (Doors/Windows)
    const isAsset = currentEntity.interfaces !== undefined || currentEntity.catalogId !== undefined || currentEntity.type === 'furniture' || currentEntity.id?.startsWith('furniture');
    const isFenestration = currentEntity.type === 'door' || currentEntity.type === 'window';

    if (isAsset || isFenestration) {
      return false; // Skip the overlap alert for these!
    }

    // Only check for overlap on entities that support it (like structures),
    // and ignore others (like devices, furniture, walls, etc.).
    if (typeof currentEntity.checkIfOverlapping !== 'function') {
      return false;
    }

    if (currentEntity.checkIfOverlapping(ancestorsId, currentEntity.floorId)) {
      alert("Overlapping detected");
      if (action === 'creation') {
        if (currentEntity.type === 'freeform') {
          for (const body of currentEntity.bodies) {
            this.system.remove(body);
          }
        }
        else {
          this.system.remove(currentEntity.body);
        }
      }
      return true;
    }
    return false;
  }



}

export default LogicalLayout;
