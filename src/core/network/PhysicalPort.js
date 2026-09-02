import { PORT_TYPES, CONNECTOR_TYPES } from '../../data/deviceCatalog.js';

/**
 * PhysicalPort
 * 
 * Models a single physical socket on a device chassis (Layer 1).
 * 
 * Responsibilities:
 *  - Track connector type, port type, and hardware speed capability
 *  - Enforce single-occupancy (one link per physical port)
 *  - Hold a reference to its logical Interface
 *  - Propagate link state changes up to the Interface
 * 
 * One PhysicalPort : One Interface (1:1 for standard ports)
 * Subinterfaces (802.1Q) are managed at the Interface level, not here.
 */
export default class PhysicalPort {
  /**
   * @param {object} opts
   * @param {string}  opts.id             - Unique identifier (e.g. "dev_abc::Gi0/1")
   * @param {string}  opts.name           - Cisco-style name (e.g. "GigabitEthernet0/1")
   * @param {string}  opts.portType       - One of PORT_TYPES
   * @param {string}  opts.connectorType  - One of CONNECTOR_TYPES
   * @param {number}  opts.speedBps       - Hardware max speed in bps
   * @param {boolean} opts.fullDuplex     - Whether port supports full duplex
   * @param {boolean} opts.autoMdix       - Whether port supports Auto-MDIX (IEEE 802.3ab)
   */
  constructor({
    id,
    name,
    portType      = PORT_TYPES.UNKNOWN,
    connectorType = CONNECTOR_TYPES.RJ45,
    speedBps      = 1_000_000_000,
    fullDuplex    = true,
    autoMdix      = false,
  }) {
    this.id            = id;
    this.name          = name;
    this.portType      = portType;
    this.connectorType = connectorType;
    this.speedBps      = speedBps;
    this.fullDuplex    = fullDuplex;
    this.autoMdix      = autoMdix;

    /** @type {import('./Interface.js').default | null} */
    this.interface = null;   // Logical interface bound to this port

    /** @type {import('./Link.js').default | null} */
    this.link = null;        // Active link plugged into this port

    // Layer 1 physical state
    this._physicalStatus = 'down'; // 'up' | 'down' | 'err-disabled'
  }

  // ---------------------------------------------------------------------------
  // INTERFACE BINDING
  // ---------------------------------------------------------------------------

  /**
   * Bind a logical Interface to this port. Called by DeviceFactory at build time.
   * @param {import('./Interface.js').default} networkInterface
   */
  bindInterface(networkInterface) {
    this.interface = networkInterface;
    networkInterface.physicalPort = this;
  }

  // ---------------------------------------------------------------------------
  // LINK / OCCUPANCY
  // ---------------------------------------------------------------------------

  /** True if a cable is currently plugged in. */
  get isOccupied() {
    return this.link !== null;
  }

  /**
   * Plug a link into this port. Enforces single-occupancy.
   * Called by Link during connection setup.
   * @param {import('./Link.js').default} link
   * @returns {{ success: boolean, error?: string }}
   */
  attachLink(link) {
    if (this.isOccupied) {
      return {
        success: false,
        error:   `Port ${this.name} is already occupied by link ${this.link.id}.`,
      };
    }
    this.link = link;
    this._setPhysicalStatus('up');
    return { success: true };
  }

  /**
   * Unplug the link from this port.
   * Called by Link.bringDown() or when a cable is removed.
   */
  detachLink() {
    this.link = null;
    this._setPhysicalStatus('down');
  }

  // ---------------------------------------------------------------------------
  // PHYSICAL STATUS
  // ---------------------------------------------------------------------------

  get physicalStatus() {
    return this._physicalStatus;
  }

  /**
   * Internal setter — propagates the new state up to the logical Interface.
   * @param {'up'|'down'|'err-disabled'} newStatus
   */
  _setPhysicalStatus(newStatus) {
    const prev = this._physicalStatus;
    this._physicalStatus = newStatus;

    if (prev !== newStatus && this.interface) {
      this.interface.onPhysicalStatusChange(newStatus, prev);
    }
  }

  // ---------------------------------------------------------------------------
  // DUPLEX / SPEED NEGOTIATION (IEEE 802.3)
  // ---------------------------------------------------------------------------

  /**
   * Negotiate operational speed and duplex with a remote port.
   * Models IEEE 802.3 autonegotiation — both sides advertise capabilities
   * and settle on the highest common value.
   * 
   * Returns a NegotiationResult describing the agreed parameters and any
   * warnings (e.g. duplex mismatch when one side has autoneg disabled).
   * 
   * @param {PhysicalPort} remotePort
   * @returns {{ speedBps: number, fullDuplex: boolean, warnings: string[] }}
   */
  negotiate(remotePort) {
    const warnings = [];

    // Agree on speed: lower of the two hardware maxima
    const agreedSpeedBps = Math.min(this.speedBps, remotePort.speedBps);

    // Duplex negotiation:
    // Full duplex only if BOTH sides support it.
    // If one side is half-duplex, the other must match — this is the classic
    // "duplex mismatch" scenario that causes late collisions and poor throughput.
    let agreedFullDuplex = this.fullDuplex && remotePort.fullDuplex;

    if (this.fullDuplex !== remotePort.fullDuplex) {
      warnings.push(
        `Duplex mismatch: ${this.name} is ${this.fullDuplex ? 'full' : 'half'}-duplex` +
        ` but ${remotePort.name} is ${remotePort.fullDuplex ? 'full' : 'half'}-duplex.` +
        ` Operating at half-duplex. Expect degraded throughput and possible late collisions.`
      );
    }

    // Speed mismatch warning (rare in modern hardware but possible with legacy gear)
    if (this.speedBps !== remotePort.speedBps) {
      const toMbps = bps => `${(bps / 1_000_000).toFixed(0)} Mbps`;
      warnings.push(
        `Speed mismatch: ${this.name} is ${toMbps(this.speedBps)}` +
        ` but ${remotePort.name} is ${toMbps(remotePort.speedBps)}.` +
        ` Negotiated to ${toMbps(agreedSpeedBps)}.`
      );
    }

    return { speedBps: agreedSpeedBps, fullDuplex: agreedFullDuplex, warnings };
  }

  // ---------------------------------------------------------------------------
  // COMPATIBILITY CHECK
  // ---------------------------------------------------------------------------

  /**
   * Check whether a given cable type is compatible with this port's physical type.
   * Used by validateConnection before a link is created.
   * 
   * @param {object} cableSpec  - Entry from cables{} in deviceCatalog
   * @returns {{ compatible: boolean, reason?: string }}
   */
  checkCableCompatibility(cableSpec) {
    if (!cableSpec.allowedPortTypes.includes(this.portType)) {
      return {
        compatible: false,
        reason: `Cable "${cableSpec.label}" cannot connect to a ${this.portType} port (${this.name}).` +
                ` Allowed port types: ${cableSpec.allowedPortTypes.join(', ')}.`,
      };
    }
    return { compatible: true };
  }

  // ---------------------------------------------------------------------------
  // SERIALIZATION
  // ---------------------------------------------------------------------------

  toJSON() {
    return {
      id:             this.id,
      name:           this.name,
      portType:       this.portType,
      connectorType:  this.connectorType,
      speedBps:       this.speedBps,
      fullDuplex:     this.fullDuplex,
      autoMdix:       this.autoMdix,
      physicalStatus: this._physicalStatus,
      isOccupied:     this.isOccupied,
      linkId:         this.link?.id ?? null,
    };
  }

  toString() {
    return `PhysicalPort(${this.name} [${this.portType}] ${this._physicalStatus})`;
  }
}