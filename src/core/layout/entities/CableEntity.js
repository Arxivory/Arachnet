/**
 * CableEntity.js
 *
 * The canvas-side representation of a network cable on the 2D Logical canvas.
 *
 * Previously, cables were plain JS objects like:
 *   { id, x1, y1, x2, y2, type, path, hitTestMode }
 * with no connection to the logical networking layer.
 *
 * A CableEntity now carries:
 *  - `linkId`          → id of the logical Link instance (networking layer)
 *  - `sourceDeviceId`  → canvas device id at the source end
 *  - `targetDeviceId`  → canvas device id at the target end
 *  - `sourcePort`      → port name string shown in hover badges
 *  - `targetPort`      → port name string shown in hover badges
 *  - `cableType`       → catalog key ('copper-straight', 'copper-crossover', 'console', 'USB')
 *  - `validationWarnings` → non-blocking notices from validateConnection()
 *
 * The canvas rendering code (LogicalLayout._renderDeviceCables) uses
 * `sourceId` / `targetId` (device IDs) to look up device positions for drawing —
 * those aliases are kept for full backward compatibility.
 */
export class CableEntity {
  /**
   * @param {object} opts
   * @param {string}  opts.id
   * @param {string}  opts.cableType       - Catalog cable key
   * @param {string}  opts.sourceDeviceId  - Canvas device id (source)
   * @param {string}  opts.targetDeviceId  - Canvas device id (target)
   * @param {string}  opts.sourcePort      - Port name for hover badge
   * @param {string}  opts.targetPort      - Port name for hover badge
   * @param {string}  [opts.linkId]        - Logical Link.id (set after Link is created)
   * @param {string[]} [opts.validationWarnings]
   * @param {string}  [opts.floorId]
   * @param {string}  [opts.spaceId]
   */
  constructor({
    id,
    cableType      = 'copper-straight',
    sourceDeviceId,
    targetDeviceId,
    sourcePort     = null,
    targetPort     = null,
    linkId         = null,
    validationWarnings = [],
    floorId        = null,
    spaceId        = null,
  }) {
    this.id        = id;
    this.entityType = 'cable';
    this.cableType = cableType;

    // Primary references
    this.linkId          = linkId;
    this.sourceDeviceId  = sourceDeviceId;
    this.targetDeviceId  = targetDeviceId;
    this.sourcePort      = sourcePort;
    this.targetPort      = targetPort;

    // Backward-compat aliases used by _renderDeviceCables / _hitTestCable /
    // identifyEntity / hoveredCable rendering
    this.sourceId = sourceDeviceId;
    this.targetId = targetDeviceId;

    // The cable `type` field is read by _renderDeviceCables for styling
    this.type = cableType;

    this.validationWarnings = validationWarnings;

    // Hierarchy context (used for floor/space filtering during render)
    this.floorId = floorId;
    this.spaceId = spaceId;

    // Hit-test mode — stroke so you can click the line itself
    this.hitTestMode = 'stroke';
  }

  /**
   * Assign the logical Link id after the Link has been constructed.
   * Called by ShapeCreator.createCable() once the Link is live.
   * @param {string} linkId
   */
  setLinkId(linkId) {
    this.linkId = linkId;
  }

  /**
   * Human-readable summary for debugging.
   */
  toString() {
    return (
      `CableEntity(${this.id} [${this.cableType}] ` +
      `${this.sourceDeviceId}:${this.sourcePort} ↔ ` +
      `${this.targetDeviceId}:${this.targetPort})`
    );
  }
}

export default CableEntity;