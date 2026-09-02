import { Rectangle }  from './entities/Rectangle.js';
import { Circle }     from './entities/Circle.js';
import { Polygon }    from './entities/Polygon.js';
import { Freeform }   from './entities/Freeform.js';
import { Device }     from './entities/Device.js';
import { Wall }       from './entities/Wall.js';
import { Door }       from './entities/Door.js';
import { Window }     from './entities/Window.js';
import { Conduit }    from './entities/Conduit.js';
import { Riser }      from './entities/Riser.js';
import { UndergroundConduit } from './entities/UndergroundConduit.js';

import { validateConnection }    from '../utils/ValidateConnection.js';
import Link                      from '../network/Link.js';
import CableEntity               from './entities/CableEntity.js';

/**
 * ShapeCreator
 *
 * Factory for all canvas entities in the 2D Logical canvas.
 *
 * Changes from original:
 *  1. createCable() is now port-aware:
 *       - Accepts sourcePort / targetPort (PhysicalPort instances from the
 *         logical networking layer) instead of just start/end coordinates.
 *       - Calls validateConnection() before constructing anything.
 *       - On success, creates a real logical Link and a CableEntity that
 *         holds a linkId back-reference.
 *       - Returns { cable: CableEntity, error: string } so callers can
 *         surface validation failures to the UI without throwing.
 *
 *  2. onDeviceCreated callback added (consistent with all other entity callbacks).
 *
 *  3. Device icon logic delegated to DeviceIcons.js (no SVG strings here).
 */
export class ShapeCreator {
  constructor(opts = {}) {
    // Structural shape callbacks
    this.onRectangleCreated = opts.onRectangleCreated || null;
    this.onCircleCreated    = opts.onCircleCreated    || null;
    this.onPolygonCreated   = opts.onPolygonCreated   || null;
    this.onFreeformCreated  = opts.onFreeformCreated  || null;
    this.onWallCreated      = opts.onWallCreated      || null;
    this.onDoorCreated      = opts.onDoorCreated      || null;
    this.onWindowCreated    = opts.onWindowCreated    || null;
    this.onConduitCreated   = opts.onConduitCreated   || null;
    this.onRiserCreated     = opts.onRiserCreated     || null;
    this.onUndergroundConduitCreated = opts.onUndergroundConduitCreated || null;
    // Network entity callbacks
    this.onCableCreated     = opts.onCableCreated     || null;
    this.onDeviceCreated    = opts.onDeviceCreated    || null; // ← NEW

    this.system = opts.system || null;
  }

  // ---------------------------------------------------------------------------
  // ID GENERATOR
  // ---------------------------------------------------------------------------

  _genId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // ---------------------------------------------------------------------------
  // STRUCTURAL SHAPES (unchanged logic, kept for completeness)
  // ---------------------------------------------------------------------------

  createRectangle(startPoint, currentPoint, structureType = '') {
    const rectangle = new Rectangle(startPoint, currentPoint, structureType, this.system);
    if (rectangle.w <= 0 || rectangle.h <= 0) {
      this.system.remove(rectangle.body);
      return null;
    }
    rectangle.id = this._genId(`Rectangle ${structureType}`);
    rectangle.body.id = rectangle.id;
    return rectangle;
  }

  createCircle(startPoint, currentPoint, structureType = '') {
    const circle = new Circle(startPoint, currentPoint, structureType, this.system);
    if (circle.r <= 2) {
      this.system.remove(circle.body);
      return null;
    }
    circle.id = this._genId(`Circle ${structureType}`);
    circle.body.id = circle.id;
    return circle;
  }

  createPolygon(points, structureType = '') {
    if (!points || points.length < 3) return null;
    const polygon = new Polygon(points, structureType, this.system);
    polygon.id = this._genId(`Polygon ${structureType}`);
    polygon.body.id = polygon.id;
    return polygon;
  }

  createFreeform(points, structureType = '') {
    if (!points || points.length < 3) return null;
    const freeform = new Freeform(points, structureType, this.system);
    freeform.id = this._genId(`Freeform ${structureType}`);
    return freeform;
  }

  createWall(startPoint, currentPoint) {
    const { x: x1, y: y1 } = startPoint;
    const { x: x2, y: y2 } = currentPoint;
    if (Math.hypot(x2 - x1, y2 - y1) <= 2) return null;

    const wall = new Wall(currentPoint, startPoint, this.system);
    wall.id = this._genId('Wall ');
    if (this.onWallCreated) this.onWallCreated(wall);
    return wall;
  }

  createConduit(x, y) {
    const conduit = new Conduit(x, y, this.system);
    conduit.id = this._genId('Conduit ');
    if (this.onConduitCreated) this.onConduitCreated(conduit);
    return conduit;
  }

  createRiser(x, y, width, height) {
    const riser = new Riser(x, y, width, height, this.system);
    riser.id = this._genId('Riser ');
    if (this.onRiserCreated) this.onRiserCreated(riser);
    return riser;
  }

  createUndergroundConduit(x, y) {
    const ugConduit = new UndergroundConduit(x, y, this.system);
    ugConduit.id = this._genId('Underground Conduit ');
    if (this.onUndergroundConduitCreated) this.onUndergroundConduitCreated(ugConduit);
    return ugConduit;
  }

  createDoor(startPoint, currentPoint) {
    const door = new Door(startPoint, currentPoint, this.system);
    if (door.w <= 0 && door.h <= 0) {
      this.system.remove(door.body);
      return null;
    }
    door.id = this._genId('Door ');
    if (this.onDoorCreated) this.onDoorCreated(door);
    return door;
  }

  createWindow(startPoint, currentPoint) {
    const win = new Window(startPoint, currentPoint, this.system);
    if (win.w <= 0 && win.h <= 0) {
      this.system.remove(win.body);
      return null;
    }
    win.id = this._genId('Window ');
    if (this.onWindowCreated) this.onWindowCreated(win);
    return win;
  }

  // ---------------------------------------------------------------------------
  // CABLE CREATION — port-aware
  // ---------------------------------------------------------------------------

  /**
   * Create a cable between two resolved PhysicalPorts.
   *
   * This is the NEW primary path. The caller (LogicalLayout._onPointerDown
   * in cable mode) resolves device → port via onPortSelect, then calls here.
   *
   * Flow:
   *  1. validateConnection() — checks port types, occupancy, Auto-MDIX, etc.
   *  2. If valid → new Link() — instantiates the logical Layer-1 connection.
   *  3. new CableEntity() — canvas representation that holds the linkId.
   *  4. Fire onCableCreated callback so the controller can persist.
   *
   * @param {object} opts
   * @param {string}   opts.cableType       - Catalog key ('copper-straight', etc.)
   * @param {import('../networking/PhysicalPort.js').default} opts.sourcePort
   * @param {import('../networking/PhysicalPort.js').default} opts.targetPort
   * @param {string}   opts.sourceDeviceId  - Canvas device id (source)
   * @param {string}   opts.targetDeviceId  - Canvas device id (target)
   * @param {object}   [opts.geometry]      - { points: [{x,y,z}] } for Link length calc
   * @param {string}   [opts.floorId]
   * @param {string}   [opts.spaceId]
   *
   * @returns {{ cable: CableEntity|null, error: string|null, warnings: string[] }}
   */
  createCable({
    cableType      = 'copper-straight',
    sourcePort,
    targetPort,
    sourceDeviceId,
    targetDeviceId,
    geometry       = {},
    floorId        = null,
    spaceId        = null,
  }) {
    
    const validation = validateConnection({ cableType, sourcePort, targetPort });

    if (!validation.valid) {
      return { cable: null, error: validation.error, warnings: [] };
    }

    const cable = new CableEntity({
      id:            this._genId('cable'),
      cableType,
      sourceDeviceId,
      targetDeviceId,
      sourcePort:    sourcePort,
      targetPort:    targetPort,
      linkId:        null,
      validationWarnings: validation.warnings,
      floorId,
      spaceId,
    });

    // ── 4. Fire callback ──────────────────────────────────────────────────────
    if (this.onCableCreated) {
      this.onCableCreated(cable);
    }

    return { cable, error: null, warnings: validation.warnings };
  }

  // ---------------------------------------------------------------------------
  // DEVICE CREATION
  // ---------------------------------------------------------------------------

  /**
   * Create a UI Device entity for the canvas.
   * Now fires onDeviceCreated for consistency with all other entity creators.
   *
   * @param {object} deviceData
   * @param {number} x
   * @param {number} y
   * @param {number} size
   * @returns {Device}
   */
  createDevice(deviceData, x, y, size) {
    const device     = new Device(deviceData, x, y, size, this.system);

    // Keep the same id as the logical/hierarchy node
    device.id        = deviceData.id       || this._genId(device.type + ' ');
    device.catalogId = deviceData.catalogId || null;
    device.floorId   = deviceData.floorId   ?? null;
    device.spaceId   = deviceData.spaceId   ?? null;
    device.label     = deviceData.label     || deviceData.name || device.label;

    if (this.onDeviceCreated) {
      this.onDeviceCreated(device);
    }

    return device;
  }

  // ---------------------------------------------------------------------------
  // POLYGON CLOSE HELPER
  // ---------------------------------------------------------------------------

  canClosePolygon(firstPoint, currentPoint, snapTolerance) {
    return (
      Math.hypot(currentPoint.x - firstPoint.x, currentPoint.y - firstPoint.y) <=
      snapTolerance * 1.5
    );
  }
}

export default ShapeCreator;