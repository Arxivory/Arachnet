/**
 * Interface.js
 * 
 * Models a logical network interface (Layer 2 / Layer 3).
 * 
 * An Interface is always bound to a PhysicalPort (its hardware backing).
 * It holds all configurable network properties: IP addressing, VLAN,
 * encapsulation, and duplex/speed as agreed by autonegotiation.
 * 
 * The Interface line-protocol status ("up"/"down") is driven by
 * the physical port state. An interface cannot be "up" if its
 * physical port is "down" — mirroring Cisco IOS behaviour:
 * 
 *   GigabitEthernet0/0 is up, line protocol is up     ← both layers up
 *   GigabitEthernet0/0 is down, line protocol is down  ← no cable / link down
 *   GigabitEthernet0/0 is up, line protocol is down    ← cable present but L2 issue
 * 
 * Subinterfaces (802.1Q dot1Q encapsulation) are stored in this.subInterfaces
 * and inherit their physical status from the parent interface's port.
 */

export const ENCAPSULATION = {
  ETHERNET_II: 'arpa',      // Standard Ethernet II (default for LAN)
  DOT1Q:       'dot1q',     // 802.1Q VLAN tagging (trunk / subinterface)
  HDLC:        'hdlc',      // Cisco HDLC (default on serial WAN links)
  PPP:         'ppp',       // Point-to-Point Protocol
};

export const INTERFACE_STATUS = {
  UP:           'up',
  DOWN:         'down',
  ERR_DISABLED: 'err-disabled',
  ADMIN_DOWN:   'administratively down',
};

export default class Interface {
  /**
   * @param {object} opts
   * @param {string}  opts.id           - Unique identifier
   * @param {string}  opts.name         - Cisco-style name (mirrors PhysicalPort name for standard intfs)
   * @param {string}  opts.macAddress   - Layer 2 hardware address
   * @param {string}  [opts.encapsulation] - Default: ETHERNET_II
   */
  constructor({
    id,
    name,
    macAddress,
    encapsulation = ENCAPSULATION.ETHERNET_II,
  }) {
    this.id   = id;
    this.name = name;

    // Layer 2
    this.macAddress    = macAddress;
    this.encapsulation = encapsulation;
    this.vlan          = null;   // Access VLAN (switchport access vlan <id>)

    // Layer 3
    this.ipv4 = null;   // { address: '192.168.1.1', subnetMask: '255.255.255.0' }
    this.ipv6 = null;   // { address: '2001:db8::1', prefixLength: 64 }

    // Negotiated physical parameters (set by Link after autoneg)
    this.negotiatedSpeedBps  = null;
    this.negotiatedFullDuplex = null;

    // Status — line protocol level
    // Starts admin-down until physical port comes up
    this._lineStatus = INTERFACE_STATUS.ADMIN_DOWN;
    this._adminEnabled = true;

    // Back-references (set by PhysicalPort.bindInterface and Device.addInterface)
    /** @type {import('./PhysicalPort.js').default | null} */
    this.physicalPort = null;

    /** @type {import('./Device.js').default | null} */
    this.device = null;

    // Subinterfaces: Map<vlanId, SubInterface>
    this.subInterfaces = new Map();
  }

  // ---------------------------------------------------------------------------
  // STATUS
  // ---------------------------------------------------------------------------

  get lineStatus() {
    return this._lineStatus;
  }

  /** True only when both physical port and line protocol are up. */
  get isUp() {
    return (
      this._adminEnabled &&
      this._lineStatus === INTERFACE_STATUS.UP &&
      this.physicalPort?.physicalStatus === 'up'
    );
  }

  /**
   * Called by PhysicalPort when its physical link state changes.
   * Maps physical state to Cisco line-protocol semantics.
   * 
   * @param {'up'|'down'|'err-disabled'} newPhysicalStatus
   * @param {'up'|'down'|'err-disabled'} prevPhysicalStatus
   */
  onPhysicalStatusChange(newPhysicalStatus, prevPhysicalStatus) {
    if (!this._adminEnabled) return; // Admin-down overrides physical

    const prev = this._lineStatus;

    if (newPhysicalStatus === 'up') {
      this._lineStatus = INTERFACE_STATUS.UP;
    } else if (newPhysicalStatus === 'err-disabled') {
      this._lineStatus = INTERFACE_STATUS.ERR_DISABLED;
    } else {
      this._lineStatus = INTERFACE_STATUS.DOWN;
      // Clear negotiated params when link drops
      this.negotiatedSpeedBps   = null;
      this.negotiatedFullDuplex = null;
    }

    if (prev !== this._lineStatus) {
      this._onStatusChange(this._lineStatus, prev);
    }
  }

  /**
   * Administratively shut down the interface (Cisco: `shutdown`).
   * Overrides physical state — interface stays down even if cable is present.
   */
  shutdown() {
    this._adminEnabled = false;
    const prev = this._lineStatus;
    this._lineStatus = INTERFACE_STATUS.ADMIN_DOWN;
    if (prev !== this._lineStatus) this._onStatusChange(this._lineStatus, prev);
  }

  /**
   * Re-enable a shut-down interface (Cisco: `no shutdown`).
   * Physical state will drive line status from here.
   */
  noShutdown() {
    this._adminEnabled = true;
    // Re-evaluate based on current physical state
    const physStatus = this.physicalPort?.physicalStatus ?? 'down';
    this.onPhysicalStatusChange(physStatus, null);
  }

  /**
   * Internal hook — called on any status transition.
   * Device subclasses can override or the device can hook in via onPacketReceived pattern.
   */
  _onStatusChange(newStatus, prevStatus) {
    if (this.device && typeof this.device.onInterfaceStatusChange === 'function') {
      this.device.onInterfaceStatusChange(this, newStatus, prevStatus);
    }
  }

  // ---------------------------------------------------------------------------
  // NEGOTIATION (called by Link after both ports are attached)
  // ---------------------------------------------------------------------------

  /**
   * Apply negotiated speed and duplex from the Link's autonegotiation result.
   * @param {number}  speedBps
   * @param {boolean} fullDuplex
   */
  applyNegotiation(speedBps, fullDuplex) {
    this.negotiatedSpeedBps   = speedBps;
    this.negotiatedFullDuplex = fullDuplex;
  }

  // ---------------------------------------------------------------------------
  // LAYER 3 CONFIGURATION
  // ---------------------------------------------------------------------------

  /**
   * Assign an IPv4 address to this interface.
   * @param {string} address     - e.g. '192.168.1.1'
   * @param {string} subnetMask  - e.g. '255.255.255.0'
   */
  configureIPv4(address, subnetMask) {
    this.ipv4 = { address, subnetMask };
  }

  /**
   * Assign an IPv6 address to this interface.
   * @param {string} address       - e.g. '2001:db8::1'
   * @param {number} prefixLength  - e.g. 64
   */
  configureIPv6(address, prefixLength) {
    this.ipv6 = { address, prefixLength };
  }

  /** Remove all IP configuration from this interface. */
  clearIPConfig() {
    this.ipv4 = null;
    this.ipv6 = null;
  }

  // ---------------------------------------------------------------------------
  // LAYER 2 CONFIGURATION
  // ---------------------------------------------------------------------------

  /**
   * Configure 802.1Q encapsulation and assign a VLAN ID.
   * Typically used on router subinterfaces (Router-on-a-Stick).
   * @param {number} vlanId
   */
  configureDot1Q(vlanId) {
    this.encapsulation = ENCAPSULATION.DOT1Q;
    this.vlan = vlanId;
  }

  /**
   * Set the access VLAN for a switchport (Layer 2 mode).
   * @param {number} vlanId
   */
  setAccessVlan(vlanId) {
    this.vlan = vlanId;
  }

  // ---------------------------------------------------------------------------
  // SUBINTERFACES (802.1Q)
  // ---------------------------------------------------------------------------

  /**
   * Create a subinterface for a given VLAN. Used for Router-on-a-Stick.
   * Example: GigabitEthernet0/0.10 for VLAN 10.
   * 
   * @param {number} vlanId
   * @returns {Interface} The new subinterface
   */
  createSubInterface(vlanId) {
    if (this.subInterfaces.has(vlanId)) {
      return this.subInterfaces.get(vlanId);
    }

    const sub = new Interface({
      id:           `${this.id}.${vlanId}`,
      name:         `${this.name}.${vlanId}`,
      macAddress:   this.macAddress,   // Shares parent MAC
      encapsulation: ENCAPSULATION.DOT1Q,
    });
    sub.vlan = vlanId;
    sub.device = this.device;
    sub.physicalPort = this.physicalPort; // Shares physical port

    // Sub inherits current line status
    sub._lineStatus = this._lineStatus;
    sub._adminEnabled = true;

    this.subInterfaces.set(vlanId, sub);
    return sub;
  }

  /**
   * Remove a subinterface.
   * @param {number} vlanId
   */
  removeSubInterface(vlanId) {
    this.subInterfaces.delete(vlanId);
  }

  // ---------------------------------------------------------------------------
  // PACKET HANDLING
  // ---------------------------------------------------------------------------

  /**
   * Receive a packet on this interface.
   * Validates interface is up, then forwards to the device's handler.
   * @param {object} packet
   * @returns {boolean} Whether the packet was accepted
   */
  receivePacket(packet) {
    if (!this.isUp) return false;
    if (!this.device) return false;

    if (typeof this.device.onPacketReceived === 'function') {
      this.device.onPacketReceived(packet, this);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // DISPLAY HELPERS (mirrors Cisco IOS `show interfaces` output)
  // ---------------------------------------------------------------------------

  /**
   * Returns a summary string similar to Cisco `show interfaces` output.
   * e.g.: "GigabitEthernet0/0 is up, line protocol is up"
   */
  showStatus() {
    const physStatus = this.physicalPort?.physicalStatus ?? 'down';
    const lineProto  = this._lineStatus;
    return `${this.name} is ${physStatus}, line protocol is ${lineProto}`;
  }

  // ---------------------------------------------------------------------------
  // SERIALIZATION
  // ---------------------------------------------------------------------------

  toJSON() {
    return {
      id:                   this.id,
      name:                 this.name,
      macAddress:           this.macAddress,
      encapsulation:        this.encapsulation,
      vlan:                 this.vlan,
      ipv4:                 this.ipv4,
      ipv6:                 this.ipv6,
      lineStatus:           this._lineStatus,
      adminEnabled:         this._adminEnabled,
      negotiatedSpeedBps:   this.negotiatedSpeedBps,
      negotiatedFullDuplex: this.negotiatedFullDuplex,
      subInterfaces:        [...this.subInterfaces.values()].map(s => s.toJSON()),
    };
  }

  toString() {
    return `Interface(${this.showStatus()})`;
  }
}