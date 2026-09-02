/**
 * OSPFEngine.js
 * 
 * Implements OSPF (Open Shortest Path First) v2 routing protocol.
 * Link-state routing using Dijkstra's algorithm.
 * 
 * Features:
 *  - Hello protocol (neighbor discovery & keep-alive)
 *  - Link State Advertisements (LSAs)
 *  - Shortest Path Tree (SPT) computation via Dijkstra
 *  - Single area support (Area 0 / backbone for now)
 *  - Link cost metrics (based on bandwidth or admin configured)
 *  - Dead timer detection (remove stale neighbors)
 *  - Fast convergence on topology changes
 * 
 * OSPF multicast address: 224.0.0.5 (AllSPFRouters)
 * Updates sent via multicast, not unicast like RIP.
 */

import { createIPPacket, createEthernetFrame } from '../Packet.js';
import PacketBuilder from './PacketBuilder.js';

const OSPF_VERSION = 2;
const OSPF_HELLO_INTERVAL = 10000;      // 10 seconds
const OSPF_DEAD_INTERVAL = 40000;       // 4 × hello interval
const OSPF_LSA_MAX_AGE = 3600000;        // 1 hour (3600 seconds)
const OSPF_LSA_REFRESH = 1800000;        // 30 minutes
const OSPF_MIN_METRIC = 1;
const OSPF_MAX_METRIC = 65535;
const OSPF_AREA_BACKBONE = '0.0.0.0';

/**
 * @typedef {object} OSPFNeighbor
 * @property {string} routerId       - Neighbor router ID (IP-like)
 * @property {string} neighborIP     - Neighbor's interface IP
 * @property {string} interface      - Interface name where neighbor is reachable
 * @property {number} lastHello      - Timestamp of last Hello received
 * @property {string} state          - 'init' | 'two-way' | 'full'
 * @property {number} hellosSent     - Count of hellos sent to this neighbor
 * @property {number} drPriority     - DR election priority (default 1)
 */

/**
 * @typedef {object} OSPFLSA
 * @property {string} routerId       - Originating router ID
 * @property {number} sequenceNumber - LSA sequence for ordering
 * @property {number} age            - Age in milliseconds
 * @property {string} type           - 'router' | 'network' (LSA type)
 * @property {Array} links           - Array of { linkId, linkData, metric, type }
 * @property {number} timestamp      - When LSA was created
 */

/**
 * @typedef {object} OSPFRoute
 * @property {string} destination
 * @property {string} mask
 * @property {number} metric         - Cost (sum of link costs)
 * @property {string} nextHop        - IP of next router toward destination
 * @property {string} type           - 'intra-area' | 'inter-area' | 'external'
 * @property {number} learned        - Timestamp when learned
 */

export default class OSPFEngine {
  /**
   * @param {Device} device - The router device running OSPF
   * @param {SimulationBus} simBus - Discrete event simulation engine
   * @param {object} [config] - Configuration options
   * @param {number} [config.routerId] - Router ID (defaults to first interface IP)
   * @param {string} [config.area] - Area ID (default: 0.0.0.0 / backbone)
   * @param {number} [config.helloInterval] - Hello interval in ms
   * @param {number} [config.deadInterval] - Dead interval in ms
   */
  constructor(device, simBus, config = {}) {
    this.device = device;
    this.simBus = simBus;

    /**
     * Router ID (typically highest IP address, or explicit config)
     * @type {string}
     */
    this.routerId = config.routerId || _getHighestIP(device) || '0.0.0.0';

    /**
     * Area ID (default: backbone)
     * @type {string}
     */
    this.areaId = config.area || OSPF_AREA_BACKBONE;

    /**
     * Timing parameters
     * @type {object}
     */
    this.timers = {
      helloInterval: config.helloInterval || OSPF_HELLO_INTERVAL,
      deadInterval: config.deadInterval || OSPF_DEAD_INTERVAL,
    };

    /**
     * Active neighbors (Map: routerId → OSPFNeighbor)
     * @type {Map<string, OSPFNeighbor>}
     */
    this._neighbors = new Map();

    /**
     * Link State Database (Map: routerId → OSPFLSA)
     * @type {Map<string, OSPFLSA>}
     */
    this._lsdb = new Map();

    /**
     * Computed routes from latest SPF (Map: destination/mask → OSPFRoute)
     * @type {Map<string, OSPFRoute>}
     */
    this._routes = new Map();

    /**
     * Whether OSPF is enabled.
     * @type {boolean}
     */
    this._enabled = false;

    /**
     * Event IDs for scheduled tasks.
     * @type {object}
     */
    this._scheduledEvents = {
      sendHello: null,
      checkDeadNeighbors: null,
      spfComputation: null,
      lsaRefresh: null,
    };

    /**
     * LSA sequence number counter (for generating new LSAs).
     * @type {number}
     */
    this._lsaSequence = 1;

    /**
     * Statistics
     * @type {object}
     */
    this.stats = {
      hellosReceived: 0,
      hellosSent: 0,
      lsasReceived: 0,
      lsasSent: 0,
      spfComputations: 0,
      neighborsUp: 0,
      neighborsDown: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // ENABLE / DISABLE
  // ---------------------------------------------------------------------------

  /**
   * Enable OSPF on this router.
   * Starts Hello protocol and SPF computation.
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;

    // Add own router LSA to LSDB
    this._createRouterLSA();

    // Schedule Hello protocol
    this._scheduledEvents.sendHello = this.simBus.schedule(
      this.timers.helloInterval,
      'ospf-hello',
      () => this._sendHello(),
      {},
      { recurring: true, interval: this.timers.helloInterval }
    );

    // Schedule dead neighbor detection
    this._scheduledEvents.checkDeadNeighbors = this.simBus.schedule(
      this.timers.deadInterval,
      'ospf-dead-check',
      () => this._checkDeadNeighbors(),
      {},
      { recurring: true, interval: this.timers.deadInterval }
    );

    // Initial SPF computation
    this._computeSPF();

    // Schedule periodic LSA refresh
    this._scheduledEvents.lsaRefresh = this.simBus.schedule(
      OSPF_LSA_REFRESH,
      'ospf-lsa-refresh',
      () => this._refreshLSA(),
      {},
      { recurring: true, interval: OSPF_LSA_REFRESH }
    );

    console.log(`[${this.device.hostname}] OSPF enabled (Router ID: ${this.routerId})`);
  }

  /**
   * Disable OSPF on this router.
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;

    // Cancel scheduled tasks
    Object.values(this._scheduledEvents).forEach(eventId => {
      if (eventId !== null) this.simBus.cancel(eventId);
    });

    // Clear state
    this._neighbors.clear();
    this._lsdb.clear();
    this._routes.clear();

    console.log(`[${this.device.hostname}] OSPF disabled`);
  }

  // ---------------------------------------------------------------------------
  // HELLO PROTOCOL (Neighbor Discovery)
  // ---------------------------------------------------------------------------

  /**
   * Send Hello packets out all interfaces.
   * Used for neighbor discovery and keep-alive.
   * @private
   */
  _sendHello() {
    if (!this._enabled) return;

    this.device.interfaces.forEach(iface => {
      if (!iface.isUp || !iface.ipv4) return;

      // Build Hello packet
      const helloPacket = {
        type: 'hello',
        routerId: this.routerId,
        areaId: this.areaId,
        helloInterval: this.timers.helloInterval,
        deadInterval: this.timers.deadInterval,
        neighbors: Array.from(this._neighbors.values())
          .filter(n => n.interface === iface.name)
          .map(n => n.routerId),
      };

      // Wrap in IP packet
      const ipPacket = createIPPacket({
        srcIP: iface.ipv4.address,
        dstIP: '224.0.0.5',  // OSPF multicast
        ttl: 1,
        protocol: 'ospf',
        payload: helloPacket,
      });

      // Wrap in Ethernet frame (multicast)
      const frame = createEthernetFrame({
        srcMAC: iface.macAddress,
        dstMAC: '01:00:5E:00:00:05',  // OSPF multicast MAC
        etherType: 0x0800,
        payload: ipPacket,
      });

      // Transmit
      if (iface.physicalPort?.link) {
        iface.physicalPort.link.transmitPacket(frame, iface.physicalPort);
      }
    });

    this.stats.hellosSent++;
  }

  /**
   * Handle incoming OSPF Hello packet.
   * Establishes or maintains neighbor adjacency.
   * 
   * @param {object} helloPacket - The Hello packet
   * @param {object} ipPacket - The IP packet
   * @param {string} ingressInterface - Interface name
   */
  onHelloReceived(helloPacket, ipPacket, ingressInterface) {
    if (!this._enabled) return;

    const neighborId = helloPacket.routerId;
    const senderIP = ipPacket.srcIP;
    const now = Date.now();

    this.stats.hellosReceived++;

    // Check if we're in the neighbor's hello list (two-way communication)
    const isTwoWay = (helloPacket.neighbors || []).includes(this.routerId);

    if (this._neighbors.has(neighborId)) {
      // Existing neighbor — update last hello time
      const neighbor = this._neighbors.get(neighborId);
      neighbor.lastHello = now;
      neighbor.state = isTwoWay ? 'two-way' : 'init';
    } else {
      // New neighbor — add to list
      const neighbor = {
        routerId: neighborId,
        neighborIP: senderIP,
        interface: ingressInterface,
        lastHello: now,
        state: isTwoWay ? 'two-way' : 'init',
        hellosSent: 0,
        drPriority: 1,  // TODO: extract from Hello packet if present
      };

      this._neighbors.set(neighborId, neighbor);
      this.stats.neighborsUp++;

      console.log(
        `[${this.device.hostname}] OSPF neighbor discovered: ${neighborId} ` +
        `(${senderIP} on ${ingressInterface})`
      );

      // Trigger SPF computation for new topology
      this._scheduleSPF();
    }

    // Update state based on two-way status
    if (isTwoWay) {
      const neighbor = this._neighbors.get(neighborId);
      if (neighbor.state === 'init') {
        neighbor.state = 'two-way';
        this._scheduleSPF();
      }
    }
  }

  /**
   * Check for dead neighbors (timeout).
   * @private
   */
  _checkDeadNeighbors() {
    const now = Date.now();
    const deadNeighbors = [];

    this._neighbors.forEach((neighbor, routerId) => {
      const age = now - neighbor.lastHello;
      if (age > this.timers.deadInterval) {
        deadNeighbors.push(routerId);
      }
    });

    deadNeighbors.forEach(routerId => {
      this._neighbors.delete(routerId);
      this.stats.neighborsDown++;
      console.log(`[${this.device.hostname}] OSPF neighbor down: ${routerId}`);
      this._scheduleSPF();  // Topology changed
    });
  }

  // ---------------------------------------------------------------------------
  // LINK STATE DATABASE (LSDB) & LSA FLOODING
  // ---------------------------------------------------------------------------

  /**
   * Create a Router LSA for this router and add to LSDB.
   * @private
   */
  _createRouterLSA() {
    const links = [];

    // Add links for each up interface
    this.device.interfaces.forEach(iface => {
      if (!iface.isUp || !iface.ipv4) return;

      const metric = iface.negotiatedSpeedBps 
        ? Math.max(1, Math.floor(100000000 / iface.negotiatedSpeedBps))  // 100Mbps / actual speed
        : OSPF_MIN_METRIC;

      links.push({
        linkId: iface.ipv4.address,  // Link to this IP
        linkData: iface.macAddress,
        metric,
        type: 'transit',
      });
    });

    const lsa = {
      routerId: this.routerId,
      sequenceNumber: this._lsaSequence++,
      age: 0,
      type: 'router',
      links,
      timestamp: Date.now(),
    };

    this._lsdb.set(this.routerId, lsa);
  }

  /**
   * Handle incoming LSA (Link State Advertisement).
   * Flood it to other neighbors and update LSDB.
   * 
   * @param {object} lsa - The Link State Advertisement
   * @param {string} ingressInterface - Interface where received
   */
  onLSAReceived(lsa, ingressInterface) {
    if (!this._enabled) return;

    const { routerId, sequenceNumber } = lsa;
    const existing = this._lsdb.get(routerId);

    // Check if this is newer
    if (existing && existing.sequenceNumber >= sequenceNumber) {
      // Old or duplicate LSA — ignore
      return;
    }

    // Update LSDB
    lsa.age = 0;
    lsa.timestamp = Date.now();
    this._lsdb.set(routerId, lsa);

    this.stats.lsasReceived++;

    console.log(`[${this.device.hostname}] OSPF LSA received from ${routerId}`);

    // Flood LSA to all other interfaces (except ingress)
    this._floodLSA(lsa, ingressInterface);

    // Trigger SPF computation
    this._scheduleSPF();
  }

  /**
   * Flood an LSA to all neighboring routers.
   * @private
   */
  _floodLSA(lsa, ingressInterface) {
    const lsaPacket = {
      type: 'lsa',
      lsa,
    };

    this.device.interfaces.forEach(iface => {
      if (!iface.isUp || iface.name === ingressInterface) return;
      if (!iface.ipv4) return;

      // Wrap in IP packet
      const ipPacket = createIPPacket({
        srcIP: iface.ipv4.address,
        dstIP: '224.0.0.5',
        ttl: 1,
        protocol: 'ospf',
        payload: lsaPacket,
      });

      // Wrap in Ethernet frame
      const frame = createEthernetFrame({
        srcMAC: iface.macAddress,
        dstMAC: '01:00:5E:00:00:05',
        etherType: 0x0800,
        payload: ipPacket,
      });

      // Transmit
      if (iface.physicalPort?.link) {
        iface.physicalPort.link.transmitPacket(frame, iface.physicalPort);
      }
    });

    this.stats.lsasSent++;
  }

  /**
   * Refresh own Router LSA.
   * @private
   */
  _refreshLSA() {
    if (!this._enabled) return;
    this._createRouterLSA();
    console.log(`[${this.device.hostname}] OSPF LSA refreshed`);
  }

  // ---------------------------------------------------------------------------
  // SHORTEST PATH FIRST (SPF) COMPUTATION
  // ---------------------------------------------------------------------------

  /**
   * Schedule SPF computation (with delay to batch multiple topology changes).
   * @private
   */
  _scheduleSPF() {
    // Cancel previous SPF computation if pending
    if (this._scheduledEvents.spfComputation !== null) {
      this.simBus.cancel(this._scheduledEvents.spfComputation);
    }

    // Schedule SPF in 1 second (delay for batching)
    this._scheduledEvents.spfComputation = this.simBus.schedule(
      1000,
      'ospf-spf',
      () => this._computeSPF(),
      {}
    );
  }

  /**
   * Compute shortest path tree (SPT) using Dijkstra's algorithm.
   * Updates routing table with results.
   * @private
   */
  _computeSPF() {
    if (!this._enabled) return;

    this.stats.spfComputations++;

    const distances = new Map();  // routerId → distance
    const previous = new Map();   // routerId → previous router
    const unvisited = new Set();  // Unvisited routers

    // Initialize
    distances.set(this.routerId, 0);
    this._lsdb.forEach((lsa, routerId) => {
      if (routerId !== this.routerId) {
        distances.set(routerId, Infinity);
      }
      unvisited.add(routerId);
    });

    // Dijkstra's algorithm
    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let current = null;
      let minDist = Infinity;

      unvisited.forEach(routerId => {
        const dist = distances.get(routerId) || Infinity;
        if (dist < minDist) {
          minDist = dist;
          current = routerId;
        }
      });

      if (current === null || minDist === Infinity) break;

      unvisited.delete(current);

      // Relax edges to neighbors
      const lsa = this._lsdb.get(current);
      if (!lsa || !lsa.links) continue;

      lsa.links.forEach(link => {
        const neighbor = _findNeighborByIP(this._lsdb, link.linkId);
        if (!neighbor || !unvisited.has(neighbor)) return;

        const newDist = (distances.get(current) || Infinity) + (link.metric || 1);
        if (newDist < (distances.get(neighbor) || Infinity)) {
          distances.set(neighbor, newDist);
          previous.set(neighbor, current);
        }
      });
    }

    // Extract routes from SPT
    this._routes.clear();
    distances.forEach((distance, routerId) => {
      if (routerId === this.routerId) return;  // Skip self

      const route = {
        destination: routerId,
        mask: '255.255.255.255',  // Host route
        metric: distance,
        nextHop: _traceNextHop(routerId, previous, this.routerId),
        type: 'intra-area',
        learned: Date.now(),
      };

      this._routes.set(routerId, route);

      // Update router's routing table
      this.device.routingTable.addRoute({
        destination: routerId,
        mask: '255.255.255.255',
        nextHop: route.nextHop,
        egressInterface: this._findEgressInterface(route.nextHop),
        metric: distance,
        protocol: 'ospf',
        active: true,
      });
    });

    console.log(
      `[${this.device.hostname}] OSPF SPF computed: ` +
      `${this._routes.size} routes, ${this._neighbors.size} neighbors`
    );
  }

  /**
   * Find the egress interface for a next-hop IP.
   * @private
   */
  _findEgressInterface(nextHopIP) {
    for (const iface of this.device.interfaces) {
      if (!iface.ipv4) continue;

      // Check if next hop is directly connected via this interface
      if (_isSameSubnet(nextHopIP, iface.ipv4.address, iface.ipv4.subnetMask)) {
        return iface.name;
      }
    }

    return this.device.interfaces[0]?.name || 'unknown';
  }

  // ---------------------------------------------------------------------------
  // STATISTICS & DISPLAY
  // ---------------------------------------------------------------------------

  /**
   * Display OSPF neighbors (similar to Cisco `show ip ospf neighbor`).
   * @returns {string}
   */
  showNeighbors() {
    let output = 'OSPF Neighbors:\n';
    output += 'Neighbor ID     Pri   State          Dead Time   Address         Interface\n';
    output += ''.padEnd(90, '-') + '\n';

    const now = Date.now();
    this._neighbors.forEach(neighbor => {
      const id = neighbor.routerId.padEnd(15);
      const pri = neighbor.drPriority.toString().padEnd(5);
      const state = neighbor.state.padEnd(14);
      const deadTime = Math.floor((this.timers.deadInterval - (now - neighbor.lastHello)) / 1000);
      const deadStr = deadTime.toString().padEnd(11);
      const addr = neighbor.neighborIP.padEnd(15);
      output += `${id} ${pri} ${state} ${deadStr}s ${addr} ${neighbor.interface}\n`;
    });

    return output;
  }

  /**
   * Display OSPF Link State Database (similar to Cisco `show ip ospf database`).
   * @returns {string}
   */
  showDatabase() {
    let output = 'OSPF Link State Database:\n';
    output += 'Router ID       Type       Seq#        Age     Links\n';
    output += ''.padEnd(70, '-') + '\n';

    const now = Date.now();
    this._lsdb.forEach((lsa, routerId) => {
      const id = routerId.padEnd(15);
      const type = lsa.type.padEnd(10);
      const seq = `0x${lsa.sequenceNumber.toString(16).toUpperCase()}`.padEnd(11);
      const age = Math.floor((now - lsa.timestamp) / 1000).toString().padEnd(7);
      const linkCount = (lsa.links || []).length;
      output += `${id} ${type} ${seq} ${age}s   ${linkCount}\n`;
    });

    return output;
  }

  /**
   * Display OSPF routes (similar to Cisco `show ip route ospf`).
   * @returns {string}
   */
  showRoutes() {
    let output = 'OSPF Routes:\n';
    output += 'Destination     Metric  Next Hop        Interface           Type\n';
    output += ''.padEnd(80, '-') + '\n';

    this._routes.forEach(route => {
      const dest = route.destination.padEnd(15);
      const metric = route.metric.toString().padEnd(7);
      const nextHop = route.nextHop.padEnd(15);
      const iface = this._findEgressInterface(route.nextHop).padEnd(19);
      const type = route.type;
      output += `${dest} ${metric} ${nextHop} ${iface} ${type}\n`;
    });

    return output;
  }

  /**
   * Display OSPF statistics.
   * @returns {string}
   */
  showStats() {
    let output = 'OSPF Statistics:\n';
    output += `Router ID:            ${this.routerId}\n`;
    output += `Area ID:              ${this.areaId}\n`;
    output += `Neighbors Up:         ${this.stats.neighborsUp}\n`;
    output += `Neighbors Down:       ${this.stats.neighborsDown}\n`;
    output += `Hellos Sent:          ${this.stats.hellosSent}\n`;
    output += `Hellos Received:      ${this.stats.hellosReceived}\n`;
    output += `LSAs Sent:            ${this.stats.lsasSent}\n`;
    output += `LSAs Received:        ${this.stats.lsasReceived}\n`;
    output += `SPF Computations:     ${this.stats.spfComputations}\n`;
    return output;
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      hellosReceived: 0,
      hellosSent: 0,
      lsasReceived: 0,
      lsasSent: 0,
      spfComputations: 0,
      neighborsUp: 0,
      neighborsDown: 0,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the highest IP address from a device's interfaces.
 * @private
 */
function _getHighestIP(device) {
  let highest = null;
  let highestNum = 0;

  device.interfaces.forEach(iface => {
    if (!iface.ipv4) return;
    const parts = iface.ipv4.address.split('.').map(Number);
    const num = (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    if (num > highestNum) {
      highest = iface.ipv4.address;
      highestNum = num;
    }
  });

  return highest;
}

/**
 * Find the router ID (owner) of a Link State Advertisement by IP.
 * @private
 */
function _findNeighborByIP(lsdb, ip) {
  for (const [routerId, lsa] of lsdb.entries()) {
    if (lsa.links) {
      for (const link of lsa.links) {
        if (link.linkId === ip) {
          return routerId;
        }
      }
    }
  }
  return null;
}

/**
 * Trace back through previous[] to find next hop toward destination.
 * @private
 */
function _traceNextHop(destination, previous, start) {
  let current = destination;
  let parent = previous.get(current);

  while (parent && parent !== start) {
    current = parent;
    parent = previous.get(current);
  }

  return current;
}

/**
 * Check if two IPs are in the same subnet.
 * @private
 */
function _isSameSubnet(ip1, ip2, mask) {
  const parts1 = ip1.split('.').map(Number);
  const parts2 = ip2.split('.').map(Number);
  const maskParts = mask.split('.').map(Number);

  for (let i = 0; i < 4; i++) {
    if ((parts1[i] & maskParts[i]) !== (parts2[i] & maskParts[i])) {
      return false;
    }
  }

  return true;
}
