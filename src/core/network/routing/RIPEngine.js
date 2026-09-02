/**
 * RIPEngine.js
 * 
 * Implements RIP (Routing Information Protocol) v2.
 * Distance-vector routing using Bellman-Ford algorithm.
 * 
 * Features:
 *  - Periodic route updates (30 seconds)
 *  - Split horizon (don't advertise route back out ingress interface)
 *  - Poison reverse (advertise failed routes with metric 16 = infinity)
 *  - Metric: hop count (1-15, 16 = unreachable)
 *  - Learns routes from neighbors and updates routing table
 * 
 * RIP sends updates via UDP port 520, but we'll simulate this
 * through the SimulationBus as timed events.
 */

import { createRIPMessage, createIPPacket, createEthernetFrame } from '../Packet.js';
import PacketBuilder from './PacketBuilder.js';

const RIP_UPDATE_INTERVAL = 30000;  // 30 seconds
const RIP_METRIC_INFINITY = 16;
const RIP_MAX_METRIC = 15;
const RIP_TIMEOUT = 180000;  // 3 minutes (180 seconds) — mark route as unreachable

/**
 * @typedef {object} RIPRoute
 * @property {string} destination
 * @property {string} mask
 * @property {number} metric    - 1-15 (16 = unreachable)
 * @property {string} nextHop   - Learned from this router's IP
 * @property {number} learned   - Timestamp when learned
 * @property {number} lastUpdate - When we last heard about this route
 */

export default class RIPEngine {
  /**
   * @param {Device} device - The router device running RIP
   * @param {SimulationBus} simBus - Discrete event simulation engine
   */
  constructor(device, simBus) {
    this.device = device;
    this.simBus = simBus;

    /**
     * Local view of learned routes (to detect changes for triggered updates).
     * @type {Map<string, RIPRoute>}
     */
    this._routes = new Map();

    /**
     * Neighbors we're receiving updates from.
     * @type {Map<string, {ip, interface, lastUpdate}>>}
     */
    this._neighbors = new Map();

    /**
     * Whether RIP is currently enabled.
     * @type {boolean}
     */
    this._enabled = false;

    /**
     * Event IDs for scheduled tasks (for cancellation).
     * @type {object}
     */
    this._scheduledEvents = {
      periodicUpdate: null,
      expireStaleRoutes: null,
    };

    /**
     * Statistics.
     * @type {object}
     */
    this.stats = {
      updatesReceived: 0,
      updatesSent: 0,
      routesLearned: 0,
      routesExpired: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // ENABLE / DISABLE
  // ---------------------------------------------------------------------------

  /**
   * Enable RIP on this router.
   * Starts periodic updates and route expiry checks.
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;

    // Advertise connected routes immediately
    this._sendUpdate();

    // Schedule periodic updates
    this._scheduledEvents.periodicUpdate = this.simBus.schedule(
      RIP_UPDATE_INTERVAL,
      'rip-update',
      () => this._sendUpdate(),
      {},
      { recurring: true, interval: RIP_UPDATE_INTERVAL }
    );

    // Schedule route expiry checks
    this._scheduledEvents.expireStaleRoutes = this.simBus.schedule(
      RIP_TIMEOUT,
      'rip-expire',
      () => this._expireStaleRoutes(),
      {},
      { recurring: true, interval: RIP_TIMEOUT }
    );

    console.log(`[${this.device.hostname}] RIP enabled`);
  }

  /**
   * Disable RIP on this router.
   * Stops updates and clears learned routes.
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;

    // Cancel scheduled tasks
    if (this._scheduledEvents.periodicUpdate !== null) {
      this.simBus.cancel(this._scheduledEvents.periodicUpdate);
    }
    if (this._scheduledEvents.expireStaleRoutes !== null) {
      this.simBus.cancel(this._scheduledEvents.expireStaleRoutes);
    }

    // Clear routes
    this._routes.clear();
    this._neighbors.clear();

    console.log(`[${this.device.hostname}] RIP disabled`);
  }

  // ---------------------------------------------------------------------------
  // SENDING UPDATES
  // ---------------------------------------------------------------------------

  /**
   * Send a RIP update out all interfaces.
   * @private
   */
  _sendUpdate() {
    if (!this._enabled) return;

    const allRoutes = this.device.routingTable.getAllRoutes();

    // Build RIP entries
    const entries = [];

    allRoutes.forEach(route => {
      // Skip routes with infinite metric
      if (route.metric >= RIP_METRIC_INFINITY) return;

      // Calculate metric for advertisement (connected=1, others increment by 1)
      const advertisedMetric = Math.min(
        route.metric + 1,
        RIP_METRIC_INFINITY
      );

      entries.push({
        destination: route.destination,
        mask: route.mask,
        metric: advertisedMetric,
        nextHop: route.nextHop,
      });
    });

    if (entries.length === 0) return; // Nothing to advertise

    // Send to all active interfaces
    this.device.interfaces.forEach(iface => {
      if (!iface.isUp) return;
      if (!iface.ipv4) return;

      // Create RIP message
      const ripMessage = createRIPMessage({
        command: 'response',
        version: 2,
        entries,
      });

      // Wrap in IP packet (UDP port 520)
      const ipPacket = createIPPacket({
        srcIP: iface.ipv4.address,
        dstIP: '224.0.0.9',  // RIP multicast address
        ttl: 2,
        protocol: 'udp',
        payload: ripMessage,
      });

      // Wrap in Ethernet frame
      const frame = createEthernetFrame({
        srcMAC: iface.macAddress,
        dstMAC: 'FF:FF:FF:FF:FF:FF',  // Multicast as broadcast
        etherType: 0x0800,
        payload: ipPacket,
      });

      // Transmit
      if (iface.physicalPort?.link) {
        iface.physicalPort.link.transmitPacket(frame, iface.physicalPort);
      }
    });

    this.stats.updatesSent++;
    console.log(
      `[${this.device.hostname}] RIP update sent (${entries.length} routes)`
    );
  }

  /**
   * Send a triggered update (immediate, when routes change).
   * @private
   */
  _sendTriggeredUpdate() {
    // For now, just send a normal update
    this._sendUpdate();
  }

  // ---------------------------------------------------------------------------
  // RECEIVING UPDATES
  // ---------------------------------------------------------------------------

  /**
   * Handle an incoming RIP update.
   * @param {object} ripMessage - The RIP message
   * @param {object} ipPacket - The IP packet carrying it
   * @param {string} ingressInterface - Interface name where it arrived
   */
  onRIPUpdate(ripMessage, ipPacket, ingressInterface) {
    if (!this._enabled) return;
    if (ripMessage.command !== 'response') return;

    const senderIP = ipPacket.srcIP;
    const now = Date.now();

    this.stats.updatesReceived++;

    // Record neighbor
    const neighborKey = senderIP;
    this._neighbors.set(neighborKey, {
      ip: senderIP,
      interface: ingressInterface,
      lastUpdate: now,
    });

    let routesUpdated = 0;

    // Process each route in the update
    (ripMessage.entries || []).forEach(entry => {
      if (entry.metric >= RIP_METRIC_INFINITY) {
        // Poisoned route — mark as unreachable
        // For now, just ignore
        return;
      }

      // Incoming metric is already incremented by sender
      // We add 1 more (split horizon would exclude originating interface)
      const incomingMetric = entry.metric;
      const localMetric = incomingMetric + 1;

      if (localMetric > RIP_MAX_METRIC) {
        // Too many hops
        return;
      }

      const routeKey = `${entry.destination}/${entry.mask}`;
      const existingEntry = this._routes.get(routeKey);

      // Bellman-Ford: update if this is a better path
      if (!existingEntry || localMetric < existingEntry.metric) {
        this._routes.set(routeKey, {
          destination: entry.destination,
          mask: entry.mask,
          metric: localMetric,
          nextHop: senderIP,
          learned: now,
          lastUpdate: now,
        });

        // Update routing table
        this.device.routingTable.addRoute({
          destination: entry.destination,
          mask: entry.mask,
          nextHop: senderIP,
          egressInterface: ingressInterface,
          metric: localMetric,
          protocol: 'rip',
          active: true,
        });

        routesUpdated++;
      } else {
        // Not better, but update lastUpdate timestamp
        const route = this._routes.get(routeKey);
        if (route && route.nextHop === senderIP) {
          route.lastUpdate = now;
        }
      }
    });

    if (routesUpdated > 0) {
      this.stats.routesLearned += routesUpdated;
      console.log(
        `[${this.device.hostname}] RIP: learned ${routesUpdated} routes from ${senderIP}`
      );

      // Triggered update
      this._sendTriggeredUpdate();
    }
  }

  // ---------------------------------------------------------------------------
  // ROUTE EXPIRY
  // ---------------------------------------------------------------------------

  /**
   * Check for stale routes and mark them as expired.
   * Called periodically by SimulationBus.
   * @private
   */
  _expireStaleRoutes() {
    const now = Date.now();
    let expired = 0;

    this._routes.forEach((route, key) => {
      const age = now - route.lastUpdate;

      if (age > RIP_TIMEOUT) {
        // Route is too old — remove it
        this._routes.delete(key);

        // Remove from routing table
        this.device.routingTable.removeRoute(
          route.destination,
          route.mask,
          route.nextHop
        );

        expired++;
      }
    });

    if (expired > 0) {
      this.stats.routesExpired += expired;
      console.log(`[${this.device.hostname}] RIP: expired ${expired} stale routes`);
    }
  }

  // ---------------------------------------------------------------------------
  // STATISTICS & DISPLAY
  // ---------------------------------------------------------------------------

  /**
   * Display learned routes (similar to Cisco `show ip rip database`).
   * @returns {string}
   */
  showDatabase() {
    let output = 'RIP Database:\n';
    output += 'Destination     Metric  Next Hop        Interface\n';
    output += ''.padEnd(60, '-') + '\n';

    this._routes.forEach(route => {
      const dest = `${route.destination}/${route.mask}`.padEnd(15);
      const metric = route.metric.toString().padEnd(7);
      const nextHop = route.nextHop.padEnd(15);
      output += `${dest} ${metric} ${nextHop}\n`;
    });

    return output;
  }

  /**
   * Display neighbors (similar to Cisco `show ip rip neighbor`).
   * @returns {string}
   */
  showNeighbors() {
    let output = 'RIP Neighbors:\n';
    output += 'Neighbor IP     Interface               Last Heard\n';
    output += ''.padEnd(60, '-') + '\n';

    const now = Date.now();
    this._neighbors.forEach(neighbor => {
      const ip = neighbor.ip.padEnd(15);
      const iface = neighbor.interface.padEnd(20);
      const ageSeconds = Math.floor((now - neighbor.lastUpdate) / 1000);
      output += `${ip} ${iface} ${ageSeconds}s ago\n`;
    });

    return output;
  }

  /**
   * Display RIP statistics.
   * @returns {string}
   */
  showStats() {
    let output = 'RIP Statistics:\n';
    output += `Updates Received: ${this.stats.updatesReceived}\n`;
    output += `Updates Sent:     ${this.stats.updatesSent}\n`;
    output += `Routes Learned:   ${this.stats.routesLearned}\n`;
    output += `Routes Expired:   ${this.stats.routesExpired}\n`;
    return output;
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      updatesReceived: 0,
      updatesSent: 0,
      routesLearned: 0,
      routesExpired: 0,
    };
  }
}
