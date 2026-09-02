import { Box } from 'check2d';
import { buildDeviceIconImages, resolveDeviceIconKey } from './DeviceIcons.js';

/**
 * Device (UI / Canvas entity)
 *
 * Represents a network device on the 2D Logical canvas.
 * This is the *visual* counterpart to the logical Device model.
 * They are linked by sharing the same `id`.
 *
 * Changes from original:
 *  - Device icon map and resolution logic extracted to DeviceIcons.js (no duplication)
 *  - `entityType = 'device'` added as a stable, primary type discriminator so
 *    _isDeviceEntity() no longer needs to duck-type on `interfaces` or `catalogId`
 */
export class Device {
  constructor(deviceData, cx, cy, size, system) {
    this.id         = deviceData.id   || null;
    this.entityType = 'device';                        // ← stable discriminator
    this.type       = deviceData.type || 'device';

    this.x = cx - size / 2;
    this.y = cy - size / 2;
    this.w = size;
    this.h = size;

    this.label     = deviceData.name  || deviceData.label || 'Device';
    this.catalogId = deviceData.catalogId || null;
    this.floorId   = deviceData.floorId   || null;
    this.spaceId   = deviceData.spaceId   || null;
    this.siteId    = deviceData.siteId    || null;
    this.domainId  = deviceData.domainId  || null;

    // Keep a reference to port data for badge rendering (populated by the
    // logical model; the canvas entity does not own this data).
    this.interfaces = deviceData.interfaces || [];

    this.system      = system;
    this.hitTestMode = 'path';

    // Build icon images from the shared registry (one map per instance is fine;
    // browsers cache the same data-URI, so no extra network requests).
    this.deviceIcons = buildDeviceIconImages();
    this.icon        = this.deviceIcons[resolveDeviceIconKey(deviceData)]
                       ?? this.deviceIcons.imported;

    this.initTransform();
    this.initPath(size);
    this.initBody();
  }

  // ---------------------------------------------------------------------------
  // INITIALISATION
  // ---------------------------------------------------------------------------

  initPath() {
    this.path = new Path2D();
    this.path.rect(this.tileX, this.tileY, this.tileWidth, this.tileHeight);
  }

  initBody() {
    const margin = 0.0001;
    const w = this.tileWidth;
    const h = this.tileHeight;
    this.body = new Box(
      { x: this.tileX + margin, y: this.tileY + margin },
      w - 2 * margin,
      h - 2 * margin
    );
    this.system.insert(this.body);
  }

  initTransform() {
    this.transform = {
      position: { x: this.x - 17, y: this.y - 20, z: 0 },
      scale:    { factor: 1 },
      rotation: { x: 0, y: 0, z: 0 },
    };
  }

  // ---------------------------------------------------------------------------
  // COMPUTED DIMENSIONS
  // ---------------------------------------------------------------------------

  get renderWidth()  { return this.w * this.transform.scale.factor; }
  get renderHeight() { return this.h * this.transform.scale.factor; }
  get tileWidth()    { return this.renderWidth  + 34; }
  get tileHeight()   { return this.renderHeight + 41; }
  get tileX()        { return this.transform.position.x; }
  get tileY()        { return this.transform.position.y; }

  // ---------------------------------------------------------------------------
  // TRANSFORM OPERATIONS
  // ---------------------------------------------------------------------------

  updatePath() {
    this.path = new Path2D();
    this.path.rect(this.tileX, this.tileY, this.tileWidth, this.tileHeight);
  }

  setScale(newScale) {
    this.transform.scale.factor = newScale.factor;
    this.body.setScale(newScale.factor, newScale.factor);
    this.body.width  = this.tileWidth;
    this.body.height = this.tileHeight;
  }

  saveCurrentScale() {
    this.savedScale = JSON.parse(JSON.stringify(this.transform.scale));
  }

  restoreToSavedScale() {
    this.setScale(this.savedScale);
  }

  saveCurrentPosition() {
    this.savedPosition = {
      x:  this.x,
      y:  this.y,
      tx: this.transform.position.x,
      ty: this.transform.position.y,
    };
  }

  restoreToSavedPosition() {
    this.x = this.savedPosition.x;
    this.y = this.savedPosition.y;
    this.transform.position.x = this.savedPosition.tx;
    this.transform.position.y = this.savedPosition.ty;
    this.body.setPosition(this.transform.position.x, this.transform.position.y);
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
    this.transform.position.x += dx;
    this.transform.position.y += dy;
    this.body.setPosition(this.x, this.y, true);
  }

  // ---------------------------------------------------------------------------
  // COLLISION
  // ---------------------------------------------------------------------------

  checkIfOverlapping(floorId) {
    let overlapping = false;
    this.system.checkOne(this.body, (other) => {
      if (other !== this.body) {
        const otherFloorId   = other.b?.floorId   ?? null;
        const currentFloorId = floorId             ?? null;
        if (other.b && otherFloorId === currentFloorId) {
          overlapping = true;
        }
      }
    });
    return overlapping;
  }
}

export default Device;