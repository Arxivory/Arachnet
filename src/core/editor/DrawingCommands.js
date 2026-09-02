import { Command } from './Command.js';

/**
 * Base class for drawing tool commands (setup commands that don't change state)
 * These are tool activation commands, not structural entity creation
 */
export class DrawingCommand {
  constructor(controller, appState) {
    this.controller = controller;
    this.appState = appState;
  }

  execute() {
    throw new Error('execute() must be implemented');
  }

  undo() {
    // Most drawing commands don't need undo (tool activation)
  }
}

export class StartDrawRectangleCommand extends DrawingCommand {
  constructor(controller, appState, structureType = '') {
    super(controller, appState);
    this.structureType = structureType;
  }

  execute() {
    this.controller?.startDrawRectangle(this.structureType);
    this.appState.tools.setActiveTool('rectangle');
  }
}

export class StartDrawCircleCommand extends DrawingCommand {
  constructor(controller, appState, structureType = '') {
    super(controller, appState);
    this.structureType = structureType;
  }

  execute() {
    this.controller?.startDrawCircle(this.structureType);
    this.appState.tools.setActiveTool('circle');
  }
}

export class StartDrawWallCommand extends DrawingCommand {
  execute() {
    this.controller?.startDrawWall();
    this.appState.tools.setActiveTool('wall');
  }
}

export class StartDrawDoorCommand extends DrawingCommand {
  execute() {
    this.controller?.startDrawDoor();
    this.appState.tools.setActiveTool('door');
  }
}

export class StartDrawConduitCommand extends DrawingCommand {
  execute() {
    this.controller?.startDrawConduit();
    this.appState.tools.setActiveTool('conduit');
  }
}

export class StartDrawRiserCommand extends DrawingCommand {
  execute() {
    this.controller?.startDrawRiser();
    this.appState.tools.setActiveTool('riser');
  }
}

export class StartDrawUndergroundConduitCommand extends DrawingCommand {
  execute() {
    this.controller?.startDrawUndergroundConduit();
    this.appState.tools.setActiveTool('underground-conduit');
  }
}

export class StartDrawWindowCommand extends DrawingCommand {
  execute() {
    this.controller?.startDrawWindow();
    this.appState.tools.setActiveTool('window');
  }
}

export class StartDrawCableCommand extends DrawingCommand {
  constructor(controller, appState, cableType = "straight") {
    super(controller, appState);
    this.cableType = cableType;
  }

  execute() {
    this.controller?.startDrawCable(this.cableType);
    this.appState.tools.setActiveTool('cable');
  }
}

export class StartDrawPolygonCommand extends DrawingCommand {
  constructor(controller, appState, structureType = '') {
    super(controller, appState);
    this.structureType = structureType;
  }

  execute() {
    this.controller?.startDrawPolygon(this.structureType);
    this.appState.tools.setActiveTool('polygon');
  }
}

export class StartDrawFreeformCommand extends DrawingCommand {
  constructor(controller, appState, structureType = '') {
    super(controller, appState);
    this.structureType = structureType;
  }
  
  execute() {
    this.controller?.startDrawFreeform(this.structureType);
    this.appState.tools.setActiveTool('freeform');
  }
}

export class StartSelectCommand extends DrawingCommand {
  execute() {
    this.controller?.startSelect();
    this.appState.tools.setActiveTool('select');
  }
}

export class StartPanCommand extends DrawingCommand {
  execute() {
    this.controller?.startPan();
    this.appState.tools.setActiveTool('pan');
  }
}

export class StartZoomInCommand extends DrawingCommand {
  execute() {
    this.appState.tools.setActiveTool('zoom');
    this.appState.ui.zoomIn();
    const zoom = this.appState.ui.getZoom();
    this.controller?._handleZoomSelected(zoom);
  }
}

export class StartZoomOutCommand extends DrawingCommand {
  execute() {
    this.appState.tools.setActiveTool('zoom');
    this.appState.ui.zoomOut();
    const zoom = this.appState.ui.getZoom();
    this.controller?._handleZoomSelected(zoom);
  }
}

export class CancelDrawingCommand extends DrawingCommand {
  execute() {
    this.controller?.cancelDrawing();
    this.appState.tools.clearActiveTool();
  }
}

export class AddDeviceCommand extends Command {
  constructor(appState, controller, deviceData, x, y) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.deviceData = deviceData;
    this.x = x;
    this.y = y;
    this.description = `Added Device "${deviceData.label || deviceData.name}"`;
  }

  execute() {
    const cleanData = this.deviceData;
    const id = cleanData.id;

    if (!this.appState.network.getDevice(id)) {
      this.appState.network.addDevice(cleanData);
    }

    // 2. Add to Canvas
    if (this.controller?.restoreCanvasDevice) {
      const existing = this.controller.layout?.findEntityById(id);
      if (!existing) {
        this.controller.restoreCanvasDevice(cleanData, id, this.x, this.y);
      }
    }
  }

  undo() {
    const id = this.deviceData.id;
    this.appState.network.removeDevice(id);
    if (this.controller?.removeEntity) {
      this.controller.removeEntity(id);
    }
  }

  redo() { this.execute(); }
}

export class AddFurnitureCommand extends Command {
  constructor(appState, controller, furnitureData, x, y) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.furnitureData = furnitureData;
    this.x = x;
    this.y = y;
    this.description = `Added Furniture "${furnitureData.label || furnitureData.name}"`;
  }

  execute() {
    const cleanData = JSON.parse(JSON.stringify(this.furnitureData));
    const id = cleanData.id;

    // 1. Add to Data Store
    if (!this.appState.furniture.getFurniture(id)) {
      this.appState.furniture.addFurniture(cleanData);
      
      // Force 3D Mesh generation if available
      if (this.controller?.physicalController?.createFurnitureGLTFMesh) {
          this.controller.physicalController.createFurnitureGLTFMesh(cleanData);
      }
    }

    // 2. Add to Canvas
    if (this.controller?.restoreCanvasFurniture) {
      const existing = this.controller.layout?.findEntityById(id);
      if (!existing) {
        this.controller.restoreCanvasFurniture(cleanData, id, this.x, this.y);
      }
    }
  }

  undo() {
    const id = this.furnitureData.id;
    this.appState.furniture.removeFurniture(id);
    if (this.controller?.removeEntity) {
      this.controller.removeEntity(id);
    }
  }

  redo() { this.execute(); }
}

export class UpdateEntityTransformCommand extends DrawingCommand {
  constructor(controller, appState, entityId, updates) {
    super(controller, appState);
    this.entityId = entityId;
    this.updates = updates;
  }

  execute() {
    const success = this.controller?.updateEntityTransform(this.entityId, this.updates);
    return success;
  }
}

export class SetGridSizeCommand extends DrawingCommand {
  constructor(controller, appState, size) {
    super(controller, appState);
    this.size = size;
  }

  execute() {
    this.controller?.setGridSize(this.size);
  }
}

export class SetSnapCommand extends DrawingCommand {
  constructor(controller, appState, enabled) {
    super(controller, appState);
    this.enabled = enabled;
  }

  execute() {
    this.controller?.enableSnap(this.enabled);
  }
}

// =========================================================
// COMMAND IMPLEMENTATIONS FOR UNDO/REDO
// =========================================================
// These commands use the Command base class and implement both
// execute() and undo() for logical mode 2D operations

/**
 * CreateDomainCommand - Creates a new Domain
 * Undo: removes the domain and its children
 */
export class CreateDomainCommand extends Command {
  constructor(appState, controller, domainData, canvasId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.domainData = { ...domainData };
    this.canvasId = canvasId;
    this.description = `Created Domain "${this.domainData.label}"`;
    this.createdDomain = null;
  }

  execute() {
      const cleanData = JSON.parse(JSON.stringify(this.domainData)); // The Shield
      if (this.createdDomain) {
        if (!this.appState.structural.domains.some(d => d.id === this.createdDomain.id)) {
          this.appState.structural.addDomain(cleanData);
        }
        if (this.controller?.restoreCanvasShape) {
          this.controller.restoreCanvasShape(cleanData, this.canvasId);
          this.controller.layout?._render(); 
        }
        if (this.createdDomain && this.canvasId) {
          this.controller?.structuralToCanvasMap?.set(this.createdDomain.id, this.canvasId);
          this.controller?.entityIdMap?.set(this.canvasId, this.createdDomain.id);
        }
      } else {
        this.createdDomain = this.appState.structural.addDomain(cleanData);
        if (this.createdDomain && this.canvasId) {
          this.controller?.structuralToCanvasMap?.set(this.createdDomain.id, this.canvasId);
          this.controller?.entityIdMap?.set(this.canvasId, this.createdDomain.id);
        }
      }
    }

  undo() {
    if (this.createdDomain) {
      const deletedIds = this.appState.structural.removeDomain(this.createdDomain.id);
      if (deletedIds && Array.isArray(deletedIds)) {
        deletedIds.forEach(id => {
          this.controller?.removeEntity(id);
        });
      }
      if (this.canvasId) {
        this.controller?.structuralToCanvasMap?.delete(this.createdDomain.id);
        this.controller?.entityIdMap?.delete(this.canvasId);
        this.controller?.removeEntity(this.canvasId); // Ensure canvas cleanup
      }
    }
  }

  getDescription() {
    return this.description;
  }
}

/**
 * CreateSiteCommand - Creates a new Site within a Domain
 * Undo: removes the site and its children
 */
export class CreateSiteCommand extends Command {
  constructor(appState, controller, siteData, domainId, canvasId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.siteData = { ...siteData, domainId };
    this.canvasId = canvasId;
    this.description = `Created Site "${this.siteData.label}"`;
    this.createdSite = null;
  }

  execute() {
    const cleanData = JSON.parse(JSON.stringify(this.siteData)); // The Shield
    if (this.createdSite) {
      if (!this.appState.structural.sites.some(s => s.id === this.createdSite.id)) {
        this.appState.structural.addSite(cleanData);
      }
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(cleanData, this.canvasId);
        this.controller.layout?._render(); 
      }
      if (this.createdSite && this.canvasId) {
        this.controller?.structuralToCanvasMap?.set(this.createdSite.id, this.canvasId);
        this.controller?.entityIdMap?.set(this.canvasId, this.createdSite.id);
      }
    } else {
      this.createdSite = this.appState.structural.addSite(cleanData);
      if (this.createdSite && this.canvasId) {
        this.controller?.structuralToCanvasMap?.set(this.createdSite.id, this.canvasId);
        this.controller?.entityIdMap?.set(this.canvasId, this.createdSite.id);
      }
    }
  }

  undo() {
    if (this.createdSite) {
      const deletedIds = this.appState.structural.removeSite(this.createdSite.id);
      if (deletedIds && Array.isArray(deletedIds)) {
        deletedIds.forEach(id => {
          this.controller?.removeEntity(id);
        });
      }
      if (this.canvasId) {
        this.controller?.structuralToCanvasMap?.delete(this.createdSite.id);
        this.controller?.entityIdMap?.delete(this.canvasId);
        this.controller?.removeEntity(this.canvasId); // Ensure canvas cleanup
      }
    }
  }

  getDescription() {
    return this.description;
  }
}

/**
 * CreateFloorCommand - Creates a new Floor within a Site
 * Undo: removes the floor and its children
 */
export class CreateFloorCommand extends Command {
  constructor(appState, controller, floorData, siteId, canvasId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.floorData = { ...floorData, siteId };
    this.canvasId = canvasId;
    this.description = `Created Floor "${this.floorData.label}"`;
    this.createdFloor = null;
  }

  execute() {
    const cleanData = JSON.parse(JSON.stringify(this.floorData)); // The Shield
    if (this.createdFloor) {
      if (!this.appState.structural.floors.some(f => f.id === this.createdFloor.id)) {
        this.appState.structural.addFloor(cleanData);
      }
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(cleanData, this.canvasId);
        this.controller.layout?._render();
      }
      if (this.createdFloor) {
        this.appState.ui.setActiveFloor(this.createdFloor.id);
        this.controller?.setActiveFloor(this.createdFloor.id); 
      }
      if (this.createdFloor && this.canvasId) {
        this.controller?.structuralToCanvasMap?.set(this.createdFloor.id, this.canvasId);
        this.controller?.entityIdMap?.set(this.canvasId, this.createdFloor.id);
      }
    } else {
      this.createdFloor = this.appState.structural.addFloor(cleanData);
      if (this.createdFloor) {
        this.appState.ui.setActiveFloor(this.createdFloor.id);
        this.controller?.setActiveFloor(this.createdFloor.id); 
      }
      if (this.createdFloor && this.canvasId) {
        this.controller?.structuralToCanvasMap?.set(this.createdFloor.id, this.canvasId);
        this.controller?.entityIdMap?.set(this.canvasId, this.createdFloor.id);
      }
    }
  }

  undo() {
    if (this.createdFloor) {
      // 1. Clear the UI filter BEFORE deleting so the Site remains visible
      if (this.appState.ui.activeFloorId === this.createdFloor.id) {
          this.appState.ui.setActiveFloor(null);
          this.controller?.setActiveFloor(null);
      }

      // 2. Perform deletion
      const deletedIds = this.appState.structural.removeFloor(this.createdFloor.id);
      if (deletedIds && Array.isArray(deletedIds)) {
        deletedIds.forEach(id => {
          this.controller?.removeEntity(id);
        });
      }
      if (this.canvasId) {
        this.controller?.structuralToCanvasMap?.delete(this.createdFloor.id);
        this.controller?.entityIdMap?.delete(this.canvasId);
      }
    }
  }

  getDescription() {
    return this.description;
  }
}

/**
 * CreateSpaceCommand - Creates a new Space within a Floor
 * Undo: removes the space
 */
export class CreateSpaceCommand extends Command {
  constructor(appState, controller, spaceData, floorId, canvasId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.spaceData = { ...spaceData, floorId };
    this.canvasId = canvasId;
    this.description = `Created Space "${this.spaceData.label}"`;
    this.createdSpace = null;
  }

  execute() {
    const cleanData = JSON.parse(JSON.stringify(this.spaceData)); // The Shield
    if (this.createdSpace) {
      if (!this.appState.structural.spaces.some(s => s.id === this.createdSpace.id)) {
        this.appState.structural.addSpace(cleanData);
      }
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(cleanData, this.canvasId);
        this.controller.layout?._render();
      }
      if (this.createdSpace && this.canvasId) {
        this.controller?.structuralToCanvasMap?.set(this.createdSpace.id, this.canvasId);
        this.controller?.entityIdMap?.set(this.canvasId, this.createdSpace.id);
      }
    } else {
      this.createdSpace = this.appState.structural.addSpace(cleanData);
      if (this.createdSpace && this.canvasId) {
        this.controller?.structuralToCanvasMap?.set(this.createdSpace.id, this.canvasId);
        this.controller?.entityIdMap?.set(this.canvasId, this.createdSpace.id);
      }
    }
  }

  undo() {
    if (this.createdSpace) {
      const deletedIds = this.appState.structural.removeSpace(this.createdSpace.id);
      if (deletedIds && Array.isArray(deletedIds)) {
        deletedIds.forEach(id => {
          this.controller?.removeEntity(id);
        });
      }
      if (this.canvasId) {
        this.controller?.structuralToCanvasMap?.delete(this.createdSpace.id);
        this.controller?.entityIdMap?.delete(this.canvasId);
        this.controller?.removeEntity(this.canvasId); // Ensure canvas cleanup
      }
    }
  }

  getDescription() {
    return this.description;
  }
}

/**
 * MoveCommand - Moves a structural entity (Domain, Site, Floor, Space)
 * Handles cascading movement of children
 */
export class RemoveDeviceCommand extends Command {
  constructor(appState, controller, deviceId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.deviceId = deviceId;
    this.description = `Removed Device ${deviceId}`;
    this.deviceBackup = null;
  }

  execute() {
    const device = this.appState.getDevice(this.deviceId);
    if (!device) {
      return;
    }

    this.deviceBackup = JSON.parse(JSON.stringify(device));
    this.appState.removeDevice(this.deviceId);
    this.controller?.removeEntity(this.deviceId);
  }

  undo() {
    if (!this.deviceBackup) {
      return;
    }

    if (!this.appState.getDevice(this.deviceId)) {
      this.appState.network.addDevice(this.deviceBackup);
    }

    if (this.controller?.restoreCanvasDevice) {
      this.controller.restoreCanvasDevice(this.deviceBackup, this.deviceId, this.deviceBackup.position?.x, this.deviceBackup.position?.y);
    }
  }

  redo() {
    this.execute();
  }
}

export class MoveCommand extends Command {
  constructor(appState, controller, entityId, kind, structureType, dx, dy) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.entityId = entityId;
    this.kind = kind; // 'structure' or 'device'
    this.structureType = structureType; // 'domain', 'site', 'floor', 'space' or null for devices
    this.dx = dx;
    this.dy = dy;
    this.description = kind === 'device' ? `Moved Device` : `Moved ${structureType}`;
  }

  execute() {
    // Move is already applied on the canvas and state during user drag.
    // This method is intentionally left blank for the initial execution.
  }

  undo() {
    if (this.kind === 'device') {
      this.controller?.applyDeviceMove(this.entityId, -this.dx, -this.dy);
      return;
    }

    this.controller?.applyStructuralMove(this.entityId, this.structureType, -this.dx, -this.dy, { skipBounds: true });
  }

  redo() {
    if (this.kind === 'device') {
      this.controller?.applyDeviceMove(this.entityId, this.dx, this.dy);
      return;
    }

    this.controller?.applyStructuralMove(this.entityId, this.structureType, this.dx, this.dy, { skipBounds: true });
  }

  getDescription() {
    return this.description;
  }
}

/**
 * RemoveDomainCommand - Removes a Domain and its children
 * Undo: restores the domain and its children
 */
export class RemoveDomainCommand extends Command {
  constructor(appState, controller, domainId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.domainId = domainId;
    this.description = `Removed Domain`;
    this.backup = null;
  }

  execute() {
    const domain = this.appState.structural.getDomain(this.domainId);
    if (!domain) return;

    // Backup all related data
    this.backup = {
      domain: JSON.parse(JSON.stringify(domain)),
      sites: this.appState.structural.sites.filter(s => s.domainId === this.domainId).map(s => JSON.parse(JSON.stringify(s))),
      floors: this.appState.structural.floors.filter(f => this.appState.structural.sites.some(s => s.id === f.siteId && s.domainId === this.domainId)).map(f => JSON.parse(JSON.stringify(f))),
      spaces: this.appState.structural.spaces.filter(sp => this.appState.structural.floors.some(f => f.id === sp.floorId && this.appState.structural.sites.some(s => s.id === f.siteId && s.domainId === this.domainId))).map(sp => JSON.parse(JSON.stringify(sp)))
    };

    // Remove from state and canvas
    const deletedIds = this.appState.structural.removeDomain(this.domainId);
    if (deletedIds && Array.isArray(deletedIds)) {
      deletedIds.forEach(id => {
        this.controller?.removeEntity(id);
      });
    }
  }

  undo() {
    if (!this.backup) return;

    // Restore in order: domain, sites, floors, spaces
    this.appState.structural.addDomain(this.backup.domain);
    this.backup.sites.forEach(site => this.appState.structural.addSite(site));
    this.backup.floors.forEach(floor => this.appState.structural.addFloor(floor));
    this.backup.spaces.forEach(space => this.appState.structural.addSpace(space));

    // Restore to canvas
    if (this.controller?.restoreCanvasShape) {
      this.controller.restoreCanvasShape(this.backup.domain, this.controller.structuralToCanvasMap.get(this.domainId));
    }
    this.backup.sites.forEach(site => {
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(site, this.controller.structuralToCanvasMap.get(site.id));
      }
    });
    this.backup.floors.forEach(floor => {
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(floor, this.controller.structuralToCanvasMap.get(floor.id));
      }
    });
    this.backup.spaces.forEach(space => {
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(space, this.controller.structuralToCanvasMap.get(space.id));
      }
    });
  }

  redo() {
    this.execute();
  }

  getDescription() {
    return this.description;
  }
}

/**
 * RemoveSiteCommand - Removes a Site and its children
 * Undo: restores the site and its children
 */
export class RemoveSiteCommand extends Command {
  constructor(appState, controller, siteId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.siteId = siteId;
    this.description = `Removed Site`;
    this.backup = null;
  }

  execute() {
    const site = this.appState.structural.sites.find(s => s.id === this.siteId);
    if (!site) return;

    // Backup all related data
    this.backup = {
      site: JSON.parse(JSON.stringify(site)),
      floors: this.appState.structural.floors.filter(f => f.siteId === this.siteId).map(f => JSON.parse(JSON.stringify(f))),
      spaces: this.appState.structural.spaces.filter(sp => this.appState.structural.floors.some(f => f.id === sp.floorId && f.siteId === this.siteId)).map(sp => JSON.parse(JSON.stringify(sp)))
    };

    // Remove from state and canvas
    const deletedIds = this.appState.structural.removeSite(this.siteId);
    if (deletedIds && Array.isArray(deletedIds)) {
      deletedIds.forEach(id => {
        this.controller?.removeEntity(id);
      });
    }
  }

  undo() {
    if (!this.backup) return;

    // Restore in order: site, floors, spaces
    this.appState.structural.addSite(this.backup.site);
    this.backup.floors.forEach(floor => this.appState.structural.addFloor(floor));
    this.backup.spaces.forEach(space => this.appState.structural.addSpace(space));

    // Restore to canvas
    if (this.controller?.restoreCanvasShape) {
      this.controller.restoreCanvasShape(this.backup.site, this.controller.structuralToCanvasMap.get(this.siteId));
    }
    this.backup.floors.forEach(floor => {
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(floor, this.controller.structuralToCanvasMap.get(floor.id));
      }
    });
    this.backup.spaces.forEach(space => {
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(space, this.controller.structuralToCanvasMap.get(space.id));
      }
    });
  }

  redo() {
    this.execute();
  }

  getDescription() {
    return this.description;
  }
}

/**
 * RemoveFloorCommand - Removes a Floor and its children
 * Undo: restores the floor and its children
 */
/**
 * RemoveFloorCommand - Removes a Floor and its children
 * Upgraded: Deep Snapshots Devices, Furniture, and Links
 */
export class RemoveFloorCommand extends Command {
  constructor(appState, controller, floorId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.floorId = floorId;
    this.description = `Removed Floor`;
    this.backup = null;
  }

  execute() {
    const floor = this.appState.structural.floors.find(f => f.id === this.floorId);
    if (!floor) return;

    if (!this.backup) {
        const spaces = this.appState.structural.spaces.filter(sp => sp.floorId === this.floorId);
        const spaceIds = spaces.map(s => s.id);
        const net = this.appState.network;
        const furn = this.appState.furniture;

        // 1. Back up all the hardware and furniture inside this floor AND its spaces
        const devices = net ? net.getAllDevices().filter(d => d.floorId === this.floorId || spaceIds.includes(d.spaceId)) : [];
        const furnitures = furn ? (furn.furnitures || []).filter(f => f.floorId === this.floorId || spaceIds.includes(f.spaceId)) : [];
        const deviceIds = devices.map(d => d.id);
        const links = net ? net.getAllLinks().filter(l => deviceIds.includes(l.sourceId) || deviceIds.includes(l.targetId)) : [];

        this.backup = {
          floor: JSON.parse(JSON.stringify(floor)),
          spaces: spaces.map(sp => JSON.parse(JSON.stringify(sp))),
          devices: devices.map(d => JSON.parse(JSON.stringify(d))),
          furnitures: furnitures.map(f => JSON.parse(JSON.stringify(f))),
          links: links.map(l => JSON.parse(JSON.stringify(l)))
        };
    }

    // 2. Cascade delete objects so they wipe perfectly from the visual canvas
    this.backup.links.forEach(l => this.appState.network?.removeLink(l.id));
    this.backup.devices.forEach(d => this.appState.network?.removeDevice(d.id));
    this.backup.furnitures.forEach(f => this.appState.furniture?.removeFurniture(f.id));

    // 3. Remove structural state and visual footprint
    const deletedIds = this.appState.structural.removeFloor(this.floorId);
    if (deletedIds && Array.isArray(deletedIds)) {
      deletedIds.forEach(id => {
        this.controller?.removeEntity(id);
      });
    }
  }

  undo() {
    if (!this.backup) return;

    // 1. Restore structural hierarchy
    this.appState.structural.addFloor(this.backup.floor);
    this.backup.spaces.forEach(space => this.appState.structural.addSpace(space));

    // 2. Restore structural visual shapes
    if (this.controller?.restoreCanvasShape) {
      this.controller.restoreCanvasShape(this.backup.floor, this.controller.structuralToCanvasMap.get(this.floorId) || this.floorId);
    }
    this.backup.spaces.forEach(space => {
      if (this.controller?.restoreCanvasShape) {
        this.controller.restoreCanvasShape(space, this.controller.structuralToCanvasMap.get(space.id) || space.id);
      }
    });

    // 3. Restore hardware and objects back into the data stores
    const net = this.appState.network;
    const furn = this.appState.furniture;

    this.backup.devices.forEach(d => net?.addDevice(d));
    this.backup.furnitures.forEach(f => furn?.addFurniture(f));
    this.backup.links.forEach(l => net?.addLink(l));

    // 4. Force visual restoration of the hardware onto the canvas
    if (this.controller?.restoreCanvasDevice) {
        this.backup.devices.forEach(d => {
            let tx = d.x ?? d.position?.x ?? d.transform?.position?.x ?? 0;
            let ty = d.y ?? d.position?.y ?? d.transform?.position?.y ?? 0;
            this.controller.restoreCanvasDevice(d, d.id, tx, ty);
        });
    }
    if (this.controller?.restoreCanvasFurniture) {
        this.backup.furnitures.forEach(f => {
            let tx = f.x ?? f.position?.x ?? f.transform?.position?.x ?? 0;
            let ty = f.y ?? f.position?.y ?? f.transform?.position?.y ?? 0;
            this.controller.restoreCanvasFurniture(f, f.id, tx, ty);
        });
    }

    if (this.controller?.layout?._render) this.controller.layout._render();
  }

  redo() {
    this.execute();
  }

  getDescription() {
    return this.description;
  }
}

/**
 * RemoveSpaceCommand - Removes a Space
 * Upgraded: Deep Snapshots Devices, Furniture, and Links
 */
export class RemoveSpaceCommand extends Command {
  constructor(appState, controller, spaceId) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.spaceId = spaceId;
    this.description = `Removed Space`;
    this.backup = null;
  }

  execute() {
    const space = this.appState.structural.spaces.find(s => s.id === this.spaceId);
    if (!space) return;

    if (!this.backup) {
        const net = this.appState.network;
        const furn = this.appState.furniture;

        // 1. Back up objects specific to this Space
        const devices = net ? net.getAllDevices().filter(d => d.spaceId === this.spaceId) : [];
        const furnitures = furn ? (furn.furnitures || []).filter(f => f.spaceId === this.spaceId) : [];
        const deviceIds = devices.map(d => d.id);
        const links = net ? net.getAllLinks().filter(l => deviceIds.includes(l.sourceId) || deviceIds.includes(l.targetId)) : [];

        this.backup = {
          space: JSON.parse(JSON.stringify(space)),
          devices: devices.map(d => JSON.parse(JSON.stringify(d))),
          furnitures: furnitures.map(f => JSON.parse(JSON.stringify(f))),
          links: links.map(l => JSON.parse(JSON.stringify(l)))
        };
    }

    // 2. Cascade delete objects so they wipe perfectly from the visual canvas
    this.backup.links.forEach(l => this.appState.network?.removeLink(l.id));
    this.backup.devices.forEach(d => this.appState.network?.removeDevice(d.id));
    this.backup.furnitures.forEach(f => this.appState.furniture?.removeFurniture(f.id));

    // 3. Remove structural state and visual footprint
    const deletedIds = this.appState.structural.removeSpace(this.spaceId);
    if (deletedIds && Array.isArray(deletedIds)) {
      deletedIds.forEach(id => {
        this.controller?.removeEntity(id);
      });
    }
  }

  undo() {
    if (!this.backup) return;

    // 1. Restore structural state and visuals
    this.appState.structural.addSpace(this.backup.space);

    if (this.controller?.restoreCanvasShape) {
      this.controller.restoreCanvasShape(this.backup.space, this.controller.structuralToCanvasMap.get(this.spaceId) || this.spaceId);
    }

    // 2. Restore objects to data store
    const net = this.appState.network;
    const furn = this.appState.furniture;

    this.backup.devices.forEach(d => net?.addDevice(d));
    this.backup.furnitures.forEach(f => furn?.addFurniture(f));
    this.backup.links.forEach(l => net?.addLink(l));

    // 3. Force visual restoration to the canvas
    if (this.controller?.restoreCanvasDevice) {
        this.backup.devices.forEach(d => {
            let tx = d.x ?? d.position?.x ?? d.transform?.position?.x ?? 0;
            let ty = d.y ?? d.position?.y ?? d.transform?.position?.y ?? 0;
            this.controller.restoreCanvasDevice(d, d.id, tx, ty);
        });
    }
    if (this.controller?.restoreCanvasFurniture) {
        this.backup.furnitures.forEach(f => {
            let tx = f.x ?? f.position?.x ?? f.transform?.position?.x ?? 0;
            let ty = f.y ?? f.position?.y ?? f.transform?.position?.y ?? 0;
            this.controller.restoreCanvasFurniture(f, f.id, tx, ty);
        });
    }

    if (this.controller?.layout?._render) this.controller.layout._render();
  }

  redo() {
    this.execute();
  }

  getDescription() {
    return this.description;
  }
}

/**
 * AddVirtualFloorCommand - For UI buttons that create virtual floors
 * No canvas drawing required.
 */
/**
 * AddVirtualFloorCommand - For UI buttons that create virtual floors
 * No canvas drawing required.
 */
export class AddVirtualFloorCommand extends Command {
  constructor(appState, floorData) {
    super();
    this.appState = appState;
    this.floorData = floorData; 
    this.description = `Added Virtual Floor`;
    this.createdFloor = null;
  }

  execute() {
    const cleanData = JSON.parse(JSON.stringify(this.floorData));
    
    if (this.createdFloor) {
      // --- REDO ---
      // CRITICAL FIX: Force the payload to use the exact same ID from the first run!
      cleanData.id = this.createdFloor.id; 
      
      if (!this.appState.structural.floors.some(f => f.id === this.createdFloor.id)) {
        this.createdFloor = this.appState.structural.addFloor(cleanData);
      }
    } else {
      // --- FIRST EXECUTION ---
      this.createdFloor = this.appState.structural.addFloor(cleanData);
      
      // CRITICAL FIX: Lock the dynamically generated ID into the command's backup data forever
      if (this.createdFloor && this.createdFloor.id) {
          this.floorData.id = this.createdFloor.id;
      }
    }

    // Force UI to focus the new floor
    if (this.createdFloor) {
      this.appState.ui.setActiveFloor(this.createdFloor.id);
      
      if (window.__layoutRef) {
          window.__layoutRef.setActiveFloor(this.createdFloor.id);
      }
    }
  }

  undo() {
    if (this.createdFloor) {
      // 1. Clear the UI filter
      if (this.appState.ui.activeFloorId === this.createdFloor.id) {
          this.appState.ui.setActiveFloor(null);
          if (window.__layoutRef) window.__layoutRef.setActiveFloor(null);
      }

      // 2. Perform deletion
      this.appState.structural.removeFloor(this.createdFloor.id);
    }
  }

  getDescription() {
    return this.description;
  }
}

/**
 * RemoveVirtualFloorCommand - For UI buttons that delete virtual floors
 * Safely cascades the deletion and logs it for undo.
 */
export class RemoveVirtualFloorCommand extends Command {
  constructor(appState, floorId) {
    super();
    this.appState = appState;
    this.floorId = floorId;
    this.description = `Removed Virtual Floor`;
    this.backup = null;
  }

  execute() {
    const floor = this.appState.structural.floors.find(f => f.id === this.floorId);
    if (!floor) return;

    if (!this.backup) {
        // Deep Snapshot Dependencies
        const spaces = this.appState.structural.spaces.filter(sp => sp.floorId === this.floorId);
        const spaceIds = spaces.map(s => s.id);
        
        const devices = this.appState.network.getAllDevices().filter(d => d.floorId === this.floorId || spaceIds.includes(d.spaceId));
        const deviceIds = devices.map(d => d.id);
        
        const furnitures = (this.appState.furniture?.furnitures || []).filter(f => f.floorId === this.floorId || spaceIds.includes(f.spaceId));
        const links = this.appState.network.getAllLinks().filter(l => deviceIds.includes(l.sourceId) || deviceIds.includes(l.targetId));

        this.backup = {
          floor: JSON.parse(JSON.stringify(floor)),
          spaces: spaces.map(sp => JSON.parse(JSON.stringify(sp))),
          devices: devices.map(d => JSON.parse(JSON.stringify(d))),
          furnitures: furnitures.map(f => JSON.parse(JSON.stringify(f))),
          links: links.map(l => JSON.parse(JSON.stringify(l)))
        };
    }

    // Wipe cascading data manually to avoid orphan data bugs
    this.backup.links.forEach(l => this.appState.removeLink(l.id));
    this.backup.devices.forEach(d => {
        this.appState.removeDevice(d.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: d.id } }));
    });
    this.backup.furnitures.forEach(f => {
        this.appState.furniture?.removeFurniture(f.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: f.id } }));
    });

    // Remove Floor and clear UI Focus
    this.appState.structural.removeFloor(this.floorId);
    
    if (this.appState.ui.activeFloorId === this.floorId) {
        this.appState.ui.setActiveFloor(null);
        if (window.__layoutRef) window.__layoutRef.setActiveFloor(null);
    }
  }

  undo() {
    if (!this.backup) return;

    // 1. Restore Virtual Structure
    this.appState.structural.addFloor(this.backup.floor);
    this.backup.spaces.forEach(space => this.appState.structural.addSpace(space));

    // 2. Restore Assets
    this.backup.devices.forEach(d => this.appState.network.addDevice(d));
    this.backup.furnitures.forEach(f => this.appState.furniture?.addFurniture(f));
    this.backup.links.forEach(l => this.appState.addLink(l));

    // 3. Force Canvas to re-fetch and render restored assets
    if (window.__layoutRef && typeof window.__layoutRef._render === 'function') {
        // You may need to trigger a full re-mount of canvas assets here depending on your React sync
        window.__layoutRef._render();
    }
  }

  redo() { this.execute(); }
  getDescription() { return this.description; }
}

export class ChangePropertyCommand extends Command {
  constructor(appState, entityId, entityType, propertyName, oldValue, newValue) {
    super();
    this.appState = appState;
    this.entityId = entityId;
    this.entityType = entityType; // 'domain', 'site', 'device', 'furniture', etc.
    this.propertyName = propertyName;
    this.oldValue = oldValue;
    this.newValue = newValue;
    
    const displayValue = typeof newValue === 'object' ? 'Configuration' : newValue;
    this.description = `Changed ${propertyName} to "${displayValue}"`;
  }

  _applyChange(value) {
    // Synchronize name and label
    const updates = { [this.propertyName]: value };
    if (this.propertyName === 'name') updates.label = value;
    if (this.propertyName === 'label') updates.name = value;

    // 1. Route to Network Store
    if (this.entityType === 'device') {
      this.appState.network.updateDevice(this.entityId, updates);
    } 
    // 2. Route to Furniture Store
    else if (this.entityType === 'furniture') {
      this.appState.furniture.updateFurniture(this.entityId, updates);
      
      // 🚀 THE FIX: Use the global event bus instead of the unreliable window.__layoutRef
      window.dispatchEvent(new CustomEvent('forceCanvasUpdate', { 
          detail: { id: this.entityId, updates } 
      }));
    } 
    // 3. Route to Structural Store
    else {
      if (this.propertyName === 'label' || this.propertyName === 'name') {
        this.appState.structural.renameStructure(this.entityId, value, this.entityType);
        
        // Update structural canvas visuals via event bus too!
        window.dispatchEvent(new CustomEvent('forceCanvasUpdate', { 
            detail: { id: this.entityId, updates } 
        }));
      }
    }
  }

  execute() {
    this._applyChange(this.newValue);
  }

  undo() {
    this._applyChange(this.oldValue);
  }

  getDescription() {
    return this.description;
  }
}

/**
 * Universal Delete Command
 * Takes a deep snapshot of structures, devices, furniture, and connected cables
 * before executing a cascade deletion. Guarantees perfect restoration on Undo.
 */
/**
 * Universal Delete Command
 * Takes a deep snapshot of structures, devices, furniture, and connected cables
 * before executing a cascade deletion. Guarantees perfect restoration on Undo.
 */
/**
 * Universal Delete Command
 * Takes a deep snapshot of structures, devices, furniture, and connected cables
 * before executing a cascade deletion. Guarantees perfect restoration on Undo.
 */
export class DeleteEntityCommand extends Command {
  constructor(appState, controller, idToDelete) {
    super();
    this.appState = appState;
    this.controller = controller;
    this.idToDelete = idToDelete;
    this.description = `Deleted Entity`;
    this.backup = null;
  }

  _takeDeepSnapshot() {
    const st = this.appState.structural;
    const net = this.appState.network;
    const furn = this.appState.furniture;
    const id = this.idToDelete;

    let snap = { domain: null, 
      sites: [], floors: [], spaces: 
      [], walls: [], devices: [], furnitures: [], 
      links: [], conduits: [], risers: [], undergroundConduits: [] };

    let childSiteIds = [], childFloorIds = [], childSpaceIds = [];

    if (st.domains?.some(d => d.id === id)) {
        snap.domain = JSON.parse(JSON.stringify(st.domains.find(d => d.id === id)));
        childSiteIds = st.sites.filter(s => s.domainId === id).map(s => s.id);
    } else if (st.sites?.some(s => s.id === id)) { childSiteIds = [id]; } 
    else if (st.floors?.some(f => f.id === id)) { childFloorIds = [id]; } 
    else if (st.spaces?.some(sp => sp.id === id)) { childSpaceIds = [id]; }

    snap.sites = st.sites.filter(s => childSiteIds.includes(s.id)).map(s => JSON.parse(JSON.stringify(s)));
    
    const nextFloors = st.floors.filter(f => childSiteIds.includes(f.siteId));
    childFloorIds.push(...nextFloors.map(f => f.id));
    snap.floors = st.floors.filter(f => childFloorIds.includes(f.id)).map(f => JSON.parse(JSON.stringify(f)));

    const nextSpaces = st.spaces.filter(sp => childFloorIds.includes(sp.floorId));
    childSpaceIds.push(...nextSpaces.map(sp => sp.id));
    snap.spaces = st.spaces.filter(sp => childSpaceIds.includes(sp.id)).map(sp => JSON.parse(JSON.stringify(sp)));

    let deviceIds = [];
    if (net) {
        let affectedDevices = net.getAllDevices().filter(d => 
            d.id === id || childSiteIds.includes(d.siteId) || childFloorIds.includes(d.floorId) || childSpaceIds.includes(d.spaceId)
        );
        snap.devices = affectedDevices.map(d => ({...d})); // Shallow clone preserves methods
        deviceIds = affectedDevices.map(d => d.id);
    }

    if (furn) {
        let affectedFurn = (furn.furnitures || []).filter(f => 
            f.id === id || childSiteIds.includes(f.siteId) || childFloorIds.includes(f.floorId) || childSpaceIds.includes(f.spaceId)
        );
        snap.furnitures = affectedFurn.map(f => ({...f}));
    }

    if (net) {
        let affectedLinks = net.getAllLinks().filter(l => l.id === id || deviceIds.includes(l.sourceId) || deviceIds.includes(l.targetId));
        snap.links = affectedLinks.map(l => ({...l}));
    }

    if (net && net.getLink(id)) snap.links = [{...net.getLink(id)}];
    if (furn && furn.furnitures?.some(f => f.id === id)) snap.furnitures = [{...furn.furnitures.find(f => f.id === id)}];
    if (st.walls?.some(w => w.id === id)) snap.walls = [JSON.parse(JSON.stringify(st.walls.find(w => w.id === id)))];
    if (st.conduits?.some(c => c.id === id)) snap.conduits = [JSON.parse(JSON.stringify(st.conduits.find(c => c.id === id)))];
    if (st.risers?.some(r => r.id === id)) snap.risers = [JSON.parse(JSON.stringify(st.risers.find(r => r.id === id)))];
    if (st.undergroundConduits?.some(uc => uc.id === id)) 
      snap.undergroundConduits = [JSON.parse(JSON.stringify(st.undergroundConduits.find(uc => uc.id === id)))];

    return snap;
  }

  execute() {
    if (!this.backup) {
      this.backup = this._takeDeepSnapshot();
      const targetObj = this.backup.domain || this.backup.sites[0] || this.backup.floors[0] || this.backup.spaces[0] || this.backup.devices[0] || this.backup.furnitures[0] || this.backup.links[0] || { label: 'Entity' };
      this.description = `Deleted ${targetObj.label || targetObj.name || targetObj.hostname || 'Entity'}`;
    }

    // 🧹 CRITICAL FIX: Explicitly destroy all child hardware from the Stores AND the 3D Canvas!
    // Without this, the 3D meshes become "ghosts" and stack when undone.
    this.backup.links.forEach(l => {
        this.appState.network?.removeLink(l.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: l.id } }));
    });
    this.backup.devices.forEach(d => {
        this.appState.network?.removeDevice(d.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: d.id } }));
    });
    this.backup.furnitures.forEach(f => {
        this.appState.furniture?.removeFurniture(f.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: f.id } }));
    });
    this.backup.walls.forEach(w => {
        this.appState.structural.removeWall(w.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: w.id } }));
    });
    this.backup.conduits.forEach(c => {
        this.appState.structural.removeConduit(c.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: c.id } }));
    });
    this.backup.risers.forEach(r => {
        this.appState.structural.removeRiser(r.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: r.id } }));
    });
    this.backup.undergroundConduits.forEach(uc => {
        this.appState.structural.removeUndergroundConduit(uc.id);
        window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: uc.id } }));
    });

    let deletedIds = [];
    const st = this.appState.structural;
    const id = this.idToDelete;
    
    // Destroy Structural state
    if (st.domains?.some(d => d.id === id)) deletedIds = st.removeDomain(id) || [id];
    else if (st.sites?.some(s => s.id === id)) deletedIds = st.removeSite(id) || [id];
    else if (st.floors?.some(f => f.id === id)) deletedIds = st.removeFloor(id) || [id];
    else if (st.spaces?.some(s => s.id === id)) deletedIds = st.removeSpace(id) || [id];
    else if (st.walls?.some(w => w.id === id)) deletedIds = st.removeWall?.(id) || [id];
    else if (st.conduits?.some(c => c.id === id)) deletedIds = st.removeConduit?.(id) || [id];
    else if (st.risers?.some(r => r.id === id)) deletedIds = st.removeRiser?.(id) || [id];
    else if (st.undergroundConduits?.some(uc => uc.id === id)) deletedIds = st.removeUndergroundConduit?.(id) || [id];

    // Wipe visually from 2D Layout
    const allIdsToWipeVisually = new Set([
        ...deletedIds, id,
        ...this.backup.sites.map(s => s.id), ...this.backup.floors.map(f => f.id),
        ...this.backup.spaces.map(sp => sp.id)
    ]);

    allIdsToWipeVisually.forEach(wipeId => {
        if (typeof this.controller?.removeEntity === 'function') {
            this.controller.removeEntity(wipeId);
        }
    });
    
    if (this.controller?.layout?._render) this.controller.layout._render();
    if (this.appState.selection && this.appState.selection.clearSelection) {
        this.appState.selection.clearSelection();
        if (typeof this.appState.selection.notify === 'function') this.appState.selection.notify();
    }
  }

  undo() {
    if (!this.backup) return;

    const st = this.appState.structural;
    const net = this.appState.network;
    const furn = this.appState.furniture;

    const rehydrate = (item) => {
        const w = item.geometry?.width ?? item.geometry?.w ?? item.width ?? item.w ?? 0;
        const h = item.geometry?.height ?? item.geometry?.h ?? item.height ?? item.h ?? 0;
        const x = item.geometry?.x ?? item.x ?? 0;
        const y = item.geometry?.y ?? item.y ?? 0;
        const r = item.geometry?.radius ?? item.geometry?.r ?? item.radius ?? item.r ?? 0;
        const points = item.geometry?.points ?? item.points ?? [];
        
        return {
            ...item,
            x, y, w, h, width: w, height: h, r, points,
            geometry: { ...(item.geometry || {}), x, y, width: w, height: h, radius: r, points },
            structureType: item.type || item.structureType, 
            type: item.shapeType || item.type || 'rectangle'
        };
    };

    // 1. Rebuild the physical structures Top-Down
    if (this.backup.domain) {
        const rd = rehydrate(this.backup.domain);
        st.addDomain(rd);
        if (this.controller?.restoreCanvasShape) this.controller.restoreCanvasShape(rd, rd.id);
    }
    
    this.backup.sites.forEach(s => {
        const rs = rehydrate(s);
        st.addSite(rs);
        if (this.controller?.restoreCanvasShape) this.controller.restoreCanvasShape(rs, rs.id);
    });

    this.backup.floors.forEach(f => {
        const rf = rehydrate(f);
        st.addFloor(rf);
        if (this.controller?.restoreCanvasShape) this.controller.restoreCanvasShape(rf, rf.id);
    });

    this.backup.spaces.forEach(sp => {
        const rsp = rehydrate(sp);
        st.addSpace(rsp);
        if (this.controller?.restoreCanvasShape) this.controller.restoreCanvasShape(rsp, rsp.id);
    });

    if (this.backup.walls) {
        this.backup.walls.forEach(w => st.addWall(w));
    }

    // 2. Synchronous Restoration of Assets (Spawning precisely one mesh!)
    this.backup.devices.forEach(d => {
        net?.addDevice(d);
        if (this.controller?.physicalController?.createDeviceGLTFMesh) {
            this.controller.physicalController.createDeviceGLTFMesh(d);
        }
        if (this.controller?.restoreCanvasDevice) {
            this.controller.restoreCanvasDevice(d, d.id, d.x || d.position?.x || 0, d.y || d.position?.y || 0);
        }
    });

    this.backup.furnitures.forEach(f => {
        furn?.addFurniture(f);
        if (this.controller?.physicalController?.createFurnitureGLTFMesh) {
            this.controller.physicalController.createFurnitureGLTFMesh(f);
        }
        if (this.controller?.restoreCanvasFurniture) {
            this.controller.restoreCanvasFurniture(f, f.id, f.x || f.position?.x || 0, f.y || f.position?.y || 0);
        }
    });

    this.backup.links.forEach(l => net?.addLink(l));

    // 3. Force Canvas Engine to paint everything at once
    if (this.controller?.layout && typeof this.controller.layout._render === 'function') {
        this.controller.layout._render();
    }
  }

  redo() { this.execute(); }
}

export default DrawingCommand;
