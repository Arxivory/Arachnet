import { cables } from '../../data/deviceCatalog.js';

/**
 * Link.js
 * 
 * Models a physical cable connecting two PhysicalPorts (Layer 1).
 * 
 * Responsibilities:
 *   - Attach to and detach from PhysicalPorts (enforcing single-occupancy)
 *   - Run autonegotiation between the two ports (IEEE 802.3)
 *   - Apply negotiated parameters to both logical Interfaces
 *   - Propagate link-up / link-down state to both PhysicalPorts
 *   - Transmit packets between interfaces with configurable latency and loss
 * 
 * Link connects PhysicalPorts at Layer 1.
 * The Interfaces (Layer 2/3) are driven indirectly via PhysicalPort → Interface.
 * 
 * A Link is only created after validateConnection() passes — see validateConnection.js.
 */
export default class Link {
  /**
   * @param {object} opts
   * @param {string}  [opts.id]
   * @param {string}  [opts.label]
   * @param {import('./PhysicalPort.js').default} opts.sourcePort
   * @param {import('./PhysicalPort.js').default} opts.targetPort
   * @param {string}  [opts.cableType]   - Key from cables{} in deviceCatalog
   * @param {number}  [opts.latencyMs]   - Simulated propagation delay in milliseconds
   * @param {number}  [opts.packetLoss]  - Packet loss percentage (0–100)
   * @param {object}  [opts.geometry]    - { points: [{x,y,z}, ...] } for 3D rendering
   */
  constructor({
    id,
    label,
    sourcePort,
    targetPort,
    cableType  = 'copper-straight',
    latencyMs  = 1,
    packetLoss = 0,
    geometry   = {},
  }) {
    this.id    = id    || `link_${Math.random().toString(36).substr(2, 9)}`;
    this.label = label || 'Network Cable';

    /** @type {import('./PhysicalPort.js').default} */
    this.sourcePort = sourcePort;
    /** @type {import('./PhysicalPort.js').default} */
    this.targetPort = targetPort;

    // Cable specification from catalog
    this.cableType = cableType;
    this.specs     = cables[cableType] ?? null;
    if (!this.specs) {
      console.warn(`Link ${this.id}: unknown cable type "${cableType}". Defaulting to copper-straight.`);
      this.specs = cables['copper-straight'];
    }

    this.latencyMs  = latencyMs;
    this.packetLoss = packetLoss;

    this.status = 'down';

    // 3D geometry for canvas rendering
    this.geometry = {
      points: geometry.points || [],
      length: _calculateLength(geometry.points),
    };

    // Autonegotiation result — populated in _initConnection
    this.negotiation = null;

    this._initConnection();
  }

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Attach to both ports, run autonegotiation, and bring the link up.
   * Called once during construction.
   */
  _initConnection() {
    if (!this.sourcePort || !this.targetPort) {
      console.warn(`Link ${this.id}: missing source or target port.`);
      return;
    }

    // Enforce max cable distance
    const maxDist = this.specs?.maxDistance ?? 100;
    if (this.geometry.length > maxDist) {
      console.warn(
        `Link ${this.id}: cable length ${this.geometry.length.toFixed(1)}m ` +
        `exceeds max distance of ${maxDist}m for "${this.specs?.label}". ` +
        `Signal degradation or connection failure may occur.`
      );
    }

    // Attach to both PhysicalPorts
    const srcResult = this.sourcePort.attachLink(this);
    if (!srcResult.success) {
      throw new Error(`Link ${this.id}: Cannot attach to source port. ${srcResult.error}`);
    }

    const tgtResult = this.targetPort.attachLink(this);
    if (!tgtResult.success) {
      // Roll back source attachment before throwing
      this.sourcePort.detachLink();
      throw new Error(`Link ${this.id}: Cannot attach to target port. ${tgtResult.error}`);
    }

    // Autonegotiation (IEEE 802.3)
    this.negotiation = this.sourcePort.negotiate(this.targetPort);

    if (this.negotiation.warnings.length > 0) {
      this.negotiation.warnings.forEach(w => console.warn(`[Link ${this.id}] ${w}`));
    }

    // Apply negotiated parameters to logical interfaces
    const srcIntf = this.sourcePort.interface;
    const tgtIntf = this.targetPort.interface;

    if (srcIntf) srcIntf.applyNegotiation(this.negotiation.speedBps, this.negotiation.fullDuplex);
    if (tgtIntf) tgtIntf.applyNegotiation(this.negotiation.speedBps, this.negotiation.fullDuplex);

    this.bringUp();
  }

  // ---------------------------------------------------------------------------
  // LINK STATE MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Bring the link up — sets both ports and the link itself to 'up'.
   * PhysicalPort propagates the state change to the logical Interface automatically.
   */
  bringUp() {
    // PhysicalPort.attachLink() already set physical status to 'up'.
    // We just need to mark the link-level status.
    this.status = 'up';
    console.log(
      `Link ${this.id} UP: ` +
      `${this.sourcePort.name} (${this.sourcePort.id.split('::')[0]}) ↔ ` +
      `${this.targetPort.name} (${this.targetPort.id.split('::')[0]}) | ` +
      `${(this.negotiation?.speedBps / 1_000_000).toFixed(0)} Mbps ` +
      `${this.negotiation?.fullDuplex ? 'full' : 'half'}-duplex`
    );
  }

  /**
   * Bring the link down (cable unplugged or administrative shutdown).
   * Detaches from both ports; Interfaces go down automatically via port propagation.
   */
  bringDown() {
    this.status = 'down';
    this.sourcePort.detachLink();
    this.targetPort.detachLink();
    this.negotiation = null;
    console.log(`Link ${this.id} DOWN.`);
  }

  // ---------------------------------------------------------------------------
  // PACKET TRANSMISSION
  // ---------------------------------------------------------------------------

  /**
   * Transmit a packet from one interface to the other.
   * Models propagation delay and packet loss.
   * 
   * @param {object} packet
   * @param {import('./PhysicalPort.js').default} fromPort
   * @returns {boolean} Whether the packet was accepted for transmission
   */
  transmitPacket(packet, fromPort) {
    if (this.status !== 'up') {
      return false;
    }

    const targetPort = this.getOtherPort(fromPort);
    if (!targetPort) return false;

    // Simulate packet loss (configurable, e.g. for noisy links)
    if (this.packetLoss > 0 && Math.random() * 100 < this.packetLoss) {
      console.debug(`[Link ${this.id}] Packet dropped (simulated loss ${this.packetLoss}%).`);
      return false;
    }

    // Simulate propagation delay
    const targetIntf = targetPort.interface;
    if (targetIntf) {
      setTimeout(() => {
        targetIntf.receivePacket(packet);
      }, this.latencyMs);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Given one port on this link, return the other.
   * @param {import('./PhysicalPort.js').default} port
   * @returns {import('./PhysicalPort.js').default | null}
   */
  getOtherPort(port) {
    if (port === this.sourcePort) return this.targetPort;
    if (port === this.targetPort) return this.sourcePort;
    return null;
  }

  /**
   * Convenience: given one interface, return the interface on the other end.
   * @param {import('./Interface.js').default} intf
   * @returns {import('./Interface.js').default | null}
   */
  getOtherInterface(intf) {
    const srcIntf = this.sourcePort.interface;
    const tgtIntf = this.targetPort.interface;
    if (intf === srcIntf) return tgtIntf;
    if (intf === tgtIntf) return srcIntf;
    return null;
  }

  // ---------------------------------------------------------------------------
  // SERIALIZATION
  // ---------------------------------------------------------------------------

  toJSON() {
    return {
      id:          this.id,
      label:       this.label,
      cableType:   this.cableType,
      status:      this.status,
      latencyMs:   this.latencyMs,
      packetLoss:  this.packetLoss,
      sourcePort:  this.sourcePort.id,
      targetPort:  this.targetPort.id,
      negotiation: this.negotiation,
      geometry:    this.geometry,
    };
  }

  toString() {
    return (
      `Link(${this.id} [${this.cableType}] ` +
      `${this.sourcePort.name} ↔ ${this.targetPort.name} [${this.status}])`
    );
  }
}

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

function _calculateLength(points) {
  if (!points || points.length < 2) return 0;
  const [p1, p2] = points;
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  );
}