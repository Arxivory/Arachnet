/**
 * NetworkManager.js
 * 
 * High-level manager for the entire network simulation.
 * Serves as the main API for the application to interact with the network.
 * 
 * Responsibilities:
 *  - Initialize and manage the integration engine
 *  - Coordinate with NetworkStore (application state)
 *  - Provide packet generation and network analysis APIs
 *  - Handle network events and statistics
 * 
 * Usage:
 *   const manager = new NetworkManager(appState.network);
 *   manager.start();
 *   
 *   // Send a ping
 *   manager.sendPing('192.168.1.1', '192.168.1.2');
 *   
 *   // Get stats
 *   const stats = manager.getNetworkStats();
 */

import NetworkIntegrationEngine from './NetworkIntegrationEngine.js';
import { createEthernetFrame, createIPPacket, createICMPPacket } from '../Packet.js';

export default class NetworkManager {
  /**
   * @param {NetworkStore} networkStore - Reference to app state network store
   */
  constructor(networkStore) {
    this.networkStore = networkStore;
    this.engine = null;
    this._isInitialized = false;
    this._storeUnsubscribe = null;

    // Event listeners
    this.eventListeners = {
      packetSent: [],
      packetReceived: [],
      packetDropped: [],
      packetTransmissionScheduled: [],
      packetDelivered: [],
      networkStatusChanged: [],
    };
  }

  /**
   * Initialize the network manager.
   * Must be called before starting simulation.
   * 
   * @returns {boolean} Success status
   */
  initialize() {
    if (this._isInitialized) {
      console.warn('[NetworkManager] Already initialized');
      return true;
    }

    try {
      const devices = typeof this.networkStore.getAllDevices === 'function'
        ? this.networkStore.getAllDevices()
        : this.networkStore.devices || [];
      const links = typeof this.networkStore.getAllLinks === 'function'
        ? this.networkStore.getAllLinks()
        : this.networkStore.links || [];

      this.engine = new NetworkIntegrationEngine(devices, links);
      this._bindEngineEvents();
      this._storeUnsubscribe = typeof this.networkStore.subscribe === 'function'
        ? this.networkStore.subscribe(() => this._syncWithStore())
        : null;

      console.log(`[NetworkManager] Initialized with ${devices.length} devices and ${links.length} links`);
      this._isInitialized = true;
      return true;
    } catch (error) {
      console.error('[NetworkManager] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Start the network simulation.
   */
  start() {
    if (!this._isInitialized) {
      this.initialize();
    }
    if (this.engine) {
      this.engine.start();
      this._emit('networkStatusChanged', { status: 'running' });
    }
  }

  /**
   * Stop the network simulation.
   */
  stop() {
    if (this.engine) {
      this.engine.stop();
      this._emit('networkStatusChanged', { status: 'stopped' });
    }
  }

  /**
   * Reset the network simulation.
   */
  reset() {
    this.stop();
    this.engine = null;
    this._isInitialized = false;
    this.initialize();
    console.log('[NetworkManager] Network reset');
  }

  /**
   * Send a ping (ICMP Echo Request).
   * 
   * @param {string} srcIP - Source IP address
   * @param {string} dstIP - Destination IP address
   * @param {string} [srcMac] - Source MAC (if not provided, will be looked up)
   * @returns {string} Packet ID
   */
  sendPing(srcIP, dstIP, srcMac = null) {
    if (!this.engine) {
      console.error('[NetworkManager] Engine not initialized');
      return null;
    }

    if (!this.isRunning()) {
      this.start();
    }

    const srcDevice = this._findDeviceByIP(srcIP);
    if (!srcDevice) {
      console.error(`[NetworkManager] No device found with IP ${srcIP}`);
      return null;
    }

    const srcInterface = this._getInterfaceWithIP(srcDevice, srcIP);
    if (!srcInterface) {
      console.error(`[NetworkManager] No interface on ${srcDevice.hostname} configured with IP ${srcIP}`);
      return null;
    }

    // Build ICMP packet
    const icmpPacket = createICMPPacket({
      type: 'echo-request',
      code: 0,
      id: Math.floor(Math.random() * 65536),
      sequence: 1,
      data: `PING ${Date.now()}`,
    });

    const ipPacket = createIPPacket({
      srcIP,
      dstIP,
      protocol: 'icmp',
      payload: icmpPacket,
    });

    const dstMac = this._resolveMACForIP(dstIP) || 'ff:ff:ff:ff:ff:ff';

    const frame = createEthernetFrame({
      srcMAC: srcInterface.macAddress,
      dstMAC: dstMac,
      etherType: 0x0800,
      payload: ipPacket,
    });

    const packetId = this.engine.transmitPacket(frame, srcInterface);

    console.log(`[NetworkManager] Sent ping from ${srcIP} to ${dstIP}`);
    this._emit('packetSent', { srcIP, dstIP, type: 'ICMP', packetId });

    return packetId;
  }

  /**
   * Send a generic IP packet.
   * 
   * @param {string} srcIP
   * @param {string} dstIP
   * @param {string} protocol - 'icmp' | 'tcp' | 'udp'
   * @param {any} payload - Application payload
   * @returns {boolean} Success
   */
  sendPacket(srcIP, dstIP, protocol = 'icmp', payload = null) {
    if (!this.engine) {
      console.error('[NetworkManager] Engine not initialized');
      return false;
    }

    if (!this.isRunning()) {
      this.start();
    }

    const srcDevice = this._findDeviceByIP(srcIP);
    if (!srcDevice) {
      console.error(`[NetworkManager] No device found with IP ${srcIP}`);
      return false;
    }

    const srcInterface = this._getInterfaceWithIP(srcDevice, srcIP);
    if (!srcInterface) {
      console.error(`[NetworkManager] No interface configured with IP ${srcIP}`);
      return false;
    }

    const ipPacket = createIPPacket({
      srcIP,
      dstIP,
      protocol,
      payload,
    });

    const dstMac = this._resolveMACForIP(dstIP) || 'ff:ff:ff:ff:ff:ff';

    const frame = createEthernetFrame({
      srcMAC: srcInterface.macAddress,
      dstMAC: dstMac,
      payload: ipPacket,
    });

    this.engine.transmitPacket(frame, srcInterface);
    this._emit('packetSent', { srcIP, dstIP, protocol });

    return true;
  }

  /**
   * Get network statistics.
   */
  getNetworkStats() {
    if (!this.engine) return null;
    return this.engine.getStats();
  }

  /**
   * Get all devices in the network.
   */
  getDevices() {
    return this.networkStore.devices || [];
  }

  /**
   * Get all links in the network.
   */
  getLinks() {
    return this.networkStore.links || [];
  }

  _bindEngineEvents() {
    if (!this.engine || typeof this.engine.addEventListener !== 'function') return;

    this.engine.addEventListener('packetTransmissionScheduled', (data) => this._emit('packetTransmissionScheduled', data));
    this.engine.addEventListener('packetDelivered', (data) => this._emit('packetDelivered', data));
    this.engine.addEventListener('packetDropped', (data) => this._emit('packetDropped', data));
  }

  isRunning() {
    return !!this.engine && !!this.engine._isRunning;
  }

  /**
   * Add a listener for network events.
   */
  addEventListener(eventType, callback) {
    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType].push(callback);
    }
  }

  /**
   * Remove an event listener.
   */
  removeEventListener(eventType, callback) {
    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType] = this.eventListeners[eventType].filter(cb => cb !== callback);
    }
  }

  /**
   * Destroy the network manager and unsubscribe from store updates.
   */
  destroy() {
    this.stop();
    if (typeof this._storeUnsubscribe === 'function') {
      this._storeUnsubscribe();
      this._storeUnsubscribe = null;
    }
    this.engine = null;
    this._isInitialized = false;
  }

  /**
   * Keep the engine in sync with the NetworkStore.
   * This allows network changes to apply while the simulation is active.
   */
  _syncWithStore() {
    if (!this.engine) return;

    const devices = typeof this.networkStore.getAllDevices === 'function'
      ? this.networkStore.getAllDevices()
      : this.networkStore.devices || [];
    const links = typeof this.networkStore.getAllLinks === 'function'
      ? this.networkStore.getAllLinks()
      : this.networkStore.links || [];

    this.engine.devices = new Map(devices.map(d => [d.id, d]));
    this.engine.links = new Map(links.map(l => [l.id, l]));
    this.engine.packetRouter.updateDevices(this.engine.devices);
    this.engine.packetRouter.updateLinks(this.engine.links);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Find a device by IP address.
   * 
   * @private
   */
  _findDeviceByIP(ipAddress) {
    const devices = this.networkStore.devices || [];
    for (const device of devices) {
      if (this._deviceHasIP(device, ipAddress)) {
        return device;
      }
    }
    return null;
  }

  /**
   * Check if a device has an interface with a specific IP.
   * 
   * @private
   */
  _deviceHasIP(device, ipAddress) {
    if (device._interfaces instanceof Map) {
      for (const intf of device._interfaces.values()) {
        if (intf.ipv4?.address === ipAddress) {
          return true;
        }
      }
      return false;
    }

    if (Array.isArray(device.interfaces)) {
      return device.interfaces.some((intf) => intf.ipv4?.address === ipAddress);
    }

    return false;
  }

  /**
   * Get the interface on a device with a specific IP.
   * 
   * @private
   */
  _getInterfaceWithIP(device, ipAddress) {
    if (device._interfaces instanceof Map) {
      for (const intf of device._interfaces.values()) {
        if (intf.ipv4?.address === ipAddress) {
          return intf;
        }
      }
      return null;
    }

    if (Array.isArray(device.interfaces)) {
      return device.interfaces.find((intf) => intf.ipv4?.address === ipAddress) || null;
    }

    return null;
  }

  /**
   * Resolve MAC address for an IP (simple lookup, no actual ARP).
   * 
   * @private
   */
  _resolveMACForIP(ipAddress) {
    const device = this._findDeviceByIP(ipAddress);
    if (device) {
      const intf = this._getInterfaceWithIP(device, ipAddress);
      if (intf) {
        return intf.macAddress;
      }
    }
    return null;
  }

  /**
   * Emit an event.
   * 
   * @private
   */
  _emit(eventType, data) {
    const listeners = this.eventListeners[eventType] || [];
    for (const callback of listeners) {
      callback(data);
    }
  }
}
