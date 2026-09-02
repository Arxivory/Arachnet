/**
 * Device.js
 * 
 * Represents a network device (switch, router, end-device).
 * 
 * A Device owns:
 *  - A registry of PhysicalPorts (hardware, Layer 1)
 *  - A registry of Interfaces (logical, Layer 2/3)
 * 
 * Ports and Interfaces are always 1:1 for standard ports.
 * The Device itself does not know about Links — that's the Link's job.
 * 
 * Packet handling is delegated to subclasses (Switch, Router, etc.)
 * via the onPacketReceived hook.
 */
export default class Device {
  /**
   * @param {object} opts
   * @param {string}  opts.id
   * @param {string}  opts.type       - 'switch' | 'router' | 'end-device'
   * @param {string}  opts.hostname
   * @param {string}  [opts.catalogId]
   * @param {string}  [opts.siteId]
   * @param {string}  [opts.floorId]
   * @param {string}  [opts.spaceId]
   * @param {string}  [opts.domainId]
   * @param {object}  [opts.transform]
   */
  constructor({
    id,
    type,
    hostname,
    catalogId  = null,
    siteId     = null,
    floorId    = null,
    spaceId    = null,
    domainId   = null,
    transform  = {},
  }) {
    this.id        = id;
    this.type      = type;
    this.hostname  = hostname;
    this.catalogId = catalogId;

    this.siteId   = siteId;
    this.floorId  = floorId;
    this.spaceId  = spaceId;
    this.domainId = domainId;

    this.transform = {
      position: transform.position || { x: 0, y: 0, z: 0 },
      rotation: transform.rotation || { x: 0, y: 0, z: 1 },
      scale:    transform.scale    || { x: 1, y: 1, z: 1 },
    };

    /**
     * Physical port registry — keyed by port name.
     * @type {Map<string, import('./PhysicalPort.js').default>}
     */
    this._ports = new Map();

    /**
     * Logical interface registry — keyed by interface name.
     * @type {Map<string, import('./Interface.js').default>}
     */
    this._interfaces = new Map();
  }

  // ---------------------------------------------------------------------------
  // PORT MANAGEMENT (Layer 1)
  // ---------------------------------------------------------------------------

  /**
   * Register a PhysicalPort on this device.
   * Called by DeviceFactory during construction.
   * @param {import('./PhysicalPort.js').default} port
   */
  addPort(port) {
    if (this._ports.has(port.name)) {
      throw new Error(`Device ${this.hostname}: duplicate port name "${port.name}".`);
    }
    this._ports.set(port.name, port);
  }

  /**
   * Look up a physical port by Cisco-style name.
   * Supports short abbreviations: 'Gi0/1' → 'GigabitEthernet0/1'
   * @param {string} name
   * @returns {import('./PhysicalPort.js').default | undefined}
   */
  getPortByName(name) {
    return this._ports.get(name) ?? this._ports.get(_expandShortName(name));
  }

  /** @returns {import('./PhysicalPort.js').default[]} */
  get ports() {
    return [...this._ports.values()];
  }

  /**
   * All ports that currently have a cable plugged in.
   * @returns {import('./PhysicalPort.js').default[]}
   */
  get occupiedPorts() {
    return this.ports.filter(p => p.isOccupied);
  }

  /**
   * All ports available for a new connection.
   * @returns {import('./PhysicalPort.js').default[]}
   */
  get availablePorts() {
    return this.ports.filter(p => !p.isOccupied);
  }

  // ---------------------------------------------------------------------------
  // INTERFACE MANAGEMENT (Layer 2/3)
  // ---------------------------------------------------------------------------

  /**
   * Register a logical Interface on this device.
   * Called by DeviceFactory after binding to a PhysicalPort.
   * @param {import('./Interface.js').default} networkInterface
   */
  addInterface(networkInterface) {
    if (this._interfaces.has(networkInterface.name)) {
      throw new Error(`Device ${this.hostname}: duplicate interface name "${networkInterface.name}".`);
    }
    networkInterface.device = this;
    this._interfaces.set(networkInterface.name, networkInterface);
  }

  /**
   * Look up a logical interface by name. Supports short abbreviations.
   * @param {string} name
   * @returns {import('./Interface.js').default | undefined}
   */
  getInterfaceByName(name) {
    return this._interfaces.get(name) ?? this._interfaces.get(_expandShortName(name));
  }

  /** @returns {import('./Interface.js').default[]} */
  get interfaces() {
    return [...this._interfaces.values()];
  }

  /**
   * All interfaces that are operationally up.
   * @returns {import('./Interface.js').default[]}
   */
  get upInterfaces() {
    return this.interfaces.filter(i => i.isUp);
  }

  // ---------------------------------------------------------------------------
  // STATUS SUMMARY (mirrors Cisco `show interfaces` / `show ip interface brief`)
  // ---------------------------------------------------------------------------

  /**
   * Returns a summary of all interface statuses, similar to
   * Cisco IOS `show ip interface brief`.
   * 
   * @returns {object[]}
   */
  showInterfaceBrief() {
    return this.interfaces.map(intf => ({
      interface:    intf.name,
      ipAddress:    intf.ipv4?.address ?? 'unassigned',
      status:       intf.physicalPort?.physicalStatus ?? 'down',
      lineProtocol: intf.lineStatus,
    }));
  }

  // ---------------------------------------------------------------------------
  // EVENT HOOKS (override in subclasses)
  // ---------------------------------------------------------------------------

  /**
   * Called by an Interface when it receives a packet.
   * Override in Switch, Router, etc. to implement forwarding logic.
   * 
   * @param {object} packet
   * @param {import('./Interface.js').default} ingressInterface
   */
  onPacketReceived(packet, ingressInterface) {
    // Default: no-op. Subclasses implement specific forwarding behaviour.
  }

  /**
   * Called by an Interface when its line status changes.
   * Override to react to link up/down events (e.g. trigger STP, update routing table).
   * 
   * @param {import('./Interface.js').default} iface
   * @param {string} newStatus
   * @param {string} prevStatus
   */
  onInterfaceStatusChange(iface, newStatus, prevStatus) {
    // Default: no-op. Subclasses implement specific reactions.
    console.log(
      `[${this.hostname}] ${iface.name}: ${prevStatus} → ${newStatus}`
    );
  }

  // ---------------------------------------------------------------------------
  // SERIALIZATION
  // ---------------------------------------------------------------------------

  toJSON() {
    return {
      id:        this.id,
      type:      this.type,
      hostname:  this.hostname,
      catalogId: this.catalogId,
      siteId:    this.siteId,
      floorId:   this.floorId,
      spaceId:   this.spaceId,
      domainId:  this.domainId,
      transform: this.transform,
      ports:     this.ports.map(p => p.toJSON()),
      interfaces: this.interfaces.map(i => i.toJSON()),
    };
  }

  toString() {
    return `Device(${this.hostname} [${this.type}] ports=${this._ports.size} intfs=${this._interfaces.size})`;
  }
}

// ---------------------------------------------------------------------------
// PRIVATE HELPERS
// ---------------------------------------------------------------------------

/**
 * Expand Cisco interface abbreviations to full names.
 * Covers the most common abbreviations used in IOS CLI.
 * 
 * Examples:
 *   'Gi0/0'   → 'GigabitEthernet0/0'
 *   'Fa0/1'   → 'FastEthernet0/1'
 *   'Te1/0/1' → 'TenGigabitEthernet1/0/1'
 *   'Se0/0/0' → 'Serial0/0/0'
 *   'Lo0'     → 'Loopback0'
 */
function _expandShortName(name) {
  if (!name) return name;

  const abbreviations = [
    [/^Gi(\d)/i,   'GigabitEthernet$1'],
    [/^Fa(\d)/i,   'FastEthernet$1'],
    [/^Te(\d)/i,   'TenGigabitEthernet$1'],
    [/^Se(\d)/i,   'Serial$1'],
    [/^Lo(\d)/i,   'Loopback$1'],
    [/^Tu(\d)/i,   'Tunnel$1'],
    [/^Po(\d)/i,   'Port-channel$1'],
    [/^Vl(\d)/i,   'Vlan$1'],
    [/^Eth(\d)/i,  'Ethernet$1'],
  ];

  for (const [pattern, replacement] of abbreviations) {
    if (pattern.test(name)) {
      return name.replace(pattern, replacement);
    }
  }

  return name;
}