/**
 * NetworkIntegrationEngine.js
 * 
 * The central coordinator for the entire network simulation.
 * 
 * Responsibilities:
 *  - Manage packet flow through the network (L2 switching + L3 routing)
 *  - Coordinate transmission on physical links
 *  - Track in-flight packets with latency simulation
 *  - Manage network-wide state and statistics
 * 
 * Architecture:
 *  - Uses LinkSimulator for physical link transmission with latency/loss
 *  - Uses PacketRouter for finding forwarding decisions
 *  - Subscribes to device packet events and link completions
 * 
 * Usage:
 *   const engine = new NetworkIntegrationEngine(allDevices, allLinks);
 *   engine.start();  // Begin simulation
 *   // Packets flow automatically between devices
 */

import LinkSimulator from './LinkSimulator.js';
import PacketRouter from './PacketRouter.js';
import NetworkSimulationClock from './NetworkSimulationClock.js';

export default class NetworkIntegrationEngine {
  /**
   * @param {Device[]} devices - All network devices
   * @param {Link[]} links     - All physical links
   */
  constructor(devices = [], links = []) {
    this.devices = new Map(devices.map(d => [d.id, d]));
    this.links = new Map(links.map(l => [l.id, l]));

    // Simulation components
    this.clock = new NetworkSimulationClock();
    this.linkSimulator = new LinkSimulator(this);
    this.packetRouter = new PacketRouter(this.devices, this.links);

    this.eventListeners = {
      packetTransmissionScheduled: [],
      packetDelivered: [],
      packetDropped: [],
      networkStatusChanged: [],
    };

    // Packet tracking
    /** @type {Map<string, object>} In-flight packets: packetId → {packet, path, link, arrivalTime} */
    this.inFlightPackets = new Map();

    // Statistics
    this.stats = {
      packetsSent: 0,
      packetsReceived: 0,
      packetsDropped: 0,
      totalLatency: 0,
      averageLatency: 0,
    };

    this._isRunning = false;
    this._packetIdCounter = 0;
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Start the network simulation.
   * Wires up packet reception hooks on all devices.
   */
  start() {
    if (this._isRunning) {
      console.warn('[NetworkIntegrationEngine] Already running');
      return;
    }

    console.log('[NetworkIntegrationEngine] Starting simulation with', this.devices.size, 'devices');

    // Wire up original packet handlers to our forwarder
    for (const device of this.devices.values()) {
      this._wireDevice(device);
    }

    this._isRunning = true;
    this.clock.start();
  }

  /**
   * Stop the network simulation.
   */
  stop() {
    if (!this._isRunning) {
      console.warn('[NetworkIntegrationEngine] Not running');
      return;
    }

    console.log('[NetworkIntegrationEngine] Stopping simulation');
    this.clock.stop();
    this._isRunning = false;
  }

  addEventListener(eventType, callback) {
    if (!this.eventListeners[eventType]) return;
    this.eventListeners[eventType].push(callback);
  }

  removeEventListener(eventType, callback) {
    if (!this.eventListeners[eventType]) return;
    this.eventListeners[eventType] = this.eventListeners[eventType].filter(cb => cb !== callback);
  }

  _emit(eventType, data) {
    const listeners = this.eventListeners[eventType] || [];
    for (const callback of listeners) {
      try {
        callback(data);
      } catch (error) {
        console.error('[NetworkIntegrationEngine] Event callback failed:', error);
      }
    }
  }

  /**
   * Add a device to the running network.
   */
  addDevice(device) {
    this.devices.set(device.id, device);
    if (this._isRunning) {
      this._wireDevice(device);
    }
    this.packetRouter.updateDevices(this.devices);
  }

  /**
   * Remove a device from the running network.
   */
  removeDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (device) delete device._engineWired;
    this.devices.delete(deviceId);
    this.packetRouter.updateDevices(this.devices);
  }

  /**
   * Add a link to the running network.
   */
  addLink(link) {
    this.links.set(link.id, link);
    this.packetRouter.updateLinks(this.links);
  }

  /**
   * Remove a link from the running network.
   */
  removeLink(linkId) {
    this.links.delete(linkId);
    this.packetRouter.updateLinks(this.links);
  }

  // ===========================================================================
  // PACKET TRANSMISSION
  // ===========================================================================

  /**
   * Transmit a packet from an interface.
   * Entry point for any device sending a packet.
   * 
   * @param {object} packet       - Ethernet frame or IP packet
   * @param {Interface} outInterface - The interface sending the packet
   */
  transmitPacket(packet, outInterface) {
    if (!this._isRunning) return;

    const device = outInterface.device;
    if (!device) return;

    const packetId = `pkt_${this._packetIdCounter++}_${Date.now()}`;

    // Find next hop via routing/switching
    const nextHop = this.packetRouter.findNextHop(packet, outInterface, device);
    if (!nextHop) {
      this.stats.packetsDropped++;
      console.log(`[NetworkIntegrationEngine] Packet ${packetId} dropped - no route`);
      return;
    }

    const { nextDevice, nextInterface, viaLink } = nextHop;

    // Schedule transmission on the link
    this.linkSimulator.scheduleTransmission(packetId, packet, viaLink, outInterface, nextInterface);
    this._emit('packetTransmissionScheduled', {
      packetId,
      packet,
      srcDevice: device,
      srcInterface: outInterface,
      nextDevice,
      nextInterface,
      viaLink,
    });

    this.stats.packetsSent++;
    return packetId;
  }

  /**
   * Called by LinkSimulator when a packet arrives at its destination link endpoint.
   * Delivers the packet to the receiving device's interface.
   * 
   * @internal
   */
  deliverPacket(packet, receivingInterface) {
    if (!this._isRunning) return;

    const device = receivingInterface.device;
    if (!device || receivingInterface.lineStatus !== 'up') {
      this.stats.packetsDropped++;
      this._emit('packetDropped', { packet, receivingInterface, reason: 'interface-down' });
      return;
    }

    this.stats.packetsReceived++;
    this._emit('packetDelivered', { packet, receivingInterface, device });

    // Call the device's onPacketReceived hook
    // This will route through L2 switching logic or L3 routing logic
    if (device.onPacketReceived) {
      device.onPacketReceived(packet, receivingInterface);
    }
  }

  // ===========================================================================
  // DEVICE WIRING
  // ===========================================================================

  /**
   * Wire a device into the network integration.
   * Intercepts onPacketReceived calls and integrates them with forwarding.
   * 
   * @private
   */
  _wireDevice(device) {
    // Prevent double-wiring: start() iterates all devices, addDevice() also calls
    // _wireDevice — without this guard the handler gets wrapped multiple times,
    // creating an exponential call chain and stale closure captures.
    if (device._engineWired) return;
    device._engineWired = true;

    // Save the original onPacketReceived
    const originalOnPacketReceived = device.onPacketReceived || (() => {});

    // Replace with our integrated version
    device.onPacketReceived = (packet, ingressInterface) => {
      // First, let the device handle the packet (L2 switching, L3 routing)
      originalOnPacketReceived.call(device, packet, ingressInterface);

      // Then check if the device wants to forward it
      // This is set by the device's onPacketForwarding callback
      if (device.onPacketForwarding) {
        const forwardingPacket = device.onPacketForwarding(packet, ingressInterface);
        if (forwardingPacket) {
          const { outPacket, outInterface } = forwardingPacket;
          // Transmit the forwarded packet
          this.transmitPacket(outPacket, outInterface);
        }
      }
    };

    // Also wire the interface transmission hooks
    if (device._interfaces instanceof Map) {
      for (const intf of device._interfaces.values()) {
        intf._engine = this;
      }
    } else if (Array.isArray(device.interfaces)) {
      for (const intf of device.interfaces) {
        if (intf) intf._engine = this;
      }
    }
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get network statistics.
   */
  getStats() {
    return {
      ...this.stats,
      inFlightPackets: this.inFlightPackets.size,
      simulationTime: this.clock.elapsedMs,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      packetsSent: 0,
      packetsReceived: 0,
      packetsDropped: 0,
      totalLatency: 0,
      averageLatency: 0,
    };
  }

  /**
   * Log current network state.
   */
  logNetworkState() {
    console.log(`
[NetworkIntegrationEngine] Network State:
  Devices: ${this.devices.size}
  Links: ${this.links.size}
  In-flight Packets: ${this.inFlightPackets.size}
  Stats:
    - Sent: ${this.stats.packetsSent}
    - Received: ${this.stats.packetsReceived}
    - Dropped: ${this.stats.packetsDropped}
  Simulation Time: ${this.clock.elapsedMs}ms
    `);
  }
}

