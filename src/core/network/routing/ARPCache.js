/**
 * ARPCache.js
 * 
 * Manages ARP (Address Resolution Protocol) cache and request/reply simulation.
 * 
 * Responsibilities:
 *  - Cache storage: IP → MAC address bindings
 *  - ARP request generation when MAC is unknown
 *  - ARP reply handling
 *  - Pending packet queue (hold packets while waiting for ARP resolution)
 *  - Cache timeout (aging out entries)
 * 
 * Flow:
 *   1. Router needs to forward to nextHop IP
 *   2. Check cache: nextHopIP → MAC
 *   3. Cache hit → forward immediately with that MAC
 *   4. Cache miss → generate ARP request, queue packet, wait for reply
 *   5. On ARP reply → add to cache, dequeue pending packets
 */

import { createARPPacket, createEthernetFrame, isARPFrame } from '../Packet.js';

/**
 * @typedef {object} ARPCacheEntry
 * @property {string} ip           - IP address
 * @property {string} mac          - MAC address
 * @property {number} timestamp    - When this entry was learned
 * @property {number} expiryTime   - When this entry expires (ms)
 */

/**
 * @typedef {object} ARPPendingEntry
 * @property {string} targetIP     - The IP we're trying to resolve
 * @property {Array} packetQueue   - Packets waiting for resolution
 * @property {number} requestCount - Number of ARP requests sent
 * @property {number} firstRequest - Timestamp of first request
 */

const ARP_CACHE_TIMEOUT = 300000; // 5 minutes in milliseconds
const ARP_REQUEST_TIMEOUT = 5000;  // Timeout if no reply after 5 seconds
const ARP_MAX_RETRIES = 3;         // Max ARP requests before giving up

export default class ARPCache {
  /**
   * @param {Device} device - The router device this cache belongs to
   */
  constructor(device) {
    this.device = device;

    /**
     * Cache: IP → ARPCacheEntry
     * @type {Map<string, ARPCacheEntry>}
     */
    this._cache = new Map();

    /**
     * Pending resolutions: IP → ARPPendingEntry
     * @type {Map<string, ARPPendingEntry>}
     */
    this._pending = new Map();

    /**
     * Timeout IDs for active ARP retries
     * @type {Map<string, number>}
     */
    this._timeouts = new Map();

    /**
     * Callback functions for SimulationBus integration
     * @type {object}
     */
    this._callbacks = {
      onSendARPRequest: null,  // Called to actually send ARP broadcast
      onARPTimeout: null,      // Called when ARP request times out
    };
  }

  // ---------------------------------------------------------------------------
  // CACHE OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Look up a MAC address for a given IP.
   * Returns MAC if cached and not expired, null otherwise.
   * @param {string} ip - IP address to resolve
   * @returns {string|null} MAC address or null
   */
  lookup(ip) {
    const entry = this._cache.get(ip);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiryTime) {
      this._cache.delete(ip);
      return null;
    }

    return entry.mac;
  }

  /**
   * Add or update a cache entry.
   * @param {string} ip
   * @param {string} mac
   */
  learn(ip, mac) {
    const now = Date.now();
    this._cache.set(ip, {
      ip,
      mac,
      timestamp: now,
      expiryTime: now + ARP_CACHE_TIMEOUT,
    });
  }

  /**
   * Remove a cache entry.
   * @param {string} ip
   */
  forget(ip) {
    this._cache.delete(ip);
  }

  /**
   * Clear entire cache (typically on router reboot).
   */
  flush() {
    this._cache.clear();
  }

  /**
   * Get all cache entries (for debugging).
   * @returns {ARPCacheEntry[]}
   */
  getAllEntries() {
    return [...this._cache.values()];
  }

  /**
   * Display cache (similar to Cisco `show arp`).
   * @returns {string}
   */
  showCache() {
    let output = 'ARP Cache:\n';
    output += 'IP Address      MAC Address         Interface\n';
    output += ''.padEnd(50, '-') + '\n';

    this._cache.forEach(entry => {
      const ip = entry.ip.padEnd(15);
      const mac = entry.mac.padEnd(20);
      output += `${ip} ${mac}\n`;
    });

    return output;
  }

  // ---------------------------------------------------------------------------
  // ARP RESOLUTION
  // ---------------------------------------------------------------------------

  /**
   * Initiate ARP resolution for a target IP.
   * If already cached, calls onResolved immediately.
   * If pending, adds packet to queue.
   * If new, generates ARP request and queues packet.
   * 
   * @param {string} targetIP - IP to resolve
   * @param {object} packet - The packet waiting for resolution
   * @param {Function} onResolved - Callback(mac) when resolved
   * @param {Function} onFailed - Callback() if resolution fails
   */
  resolve(targetIP, packet, onResolved, onFailed) {
    // Check cache first
    const cachedMAC = this.lookup(targetIP);
    if (cachedMAC) {
      onResolved(cachedMAC);
      return;
    }

    // Check if already pending
    if (this._pending.has(targetIP)) {
      const entry = this._pending.get(targetIP);
      entry.packetQueue.push({ packet, onResolved, onFailed });
      return;
    }

    // New resolution request
    const pendingEntry = {
      targetIP,
      packetQueue: [{ packet, onResolved, onFailed }],
      requestCount: 0,
      firstRequest: Date.now(),
    };

    this._pending.set(targetIP, pendingEntry);

    // Generate ARP request
    this._generateARPRequest(targetIP);
  }

  /**
   * Handle incoming ARP packet (either request or reply).
   * @param {object} arpPacket
   * @param {string} ingressInterface - Interface name where ARP came in
   */
  onARPReceived(arpPacket, ingressInterface) {
    if (arpPacket.operation === 'request') {
      this._handleARPRequest(arpPacket, ingressInterface);
    } else if (arpPacket.operation === 'reply') {
      this._handleARPReply(arpPacket, ingressInterface);
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL ARP REQUEST/REPLY LOGIC
  // ---------------------------------------------------------------------------

  /**
   * Generate and send an ARP request for a target IP.
   * @private
   */
  _generateARPRequest(targetIP) {
    const pending = this._pending.get(targetIP);
    if (!pending) return;

    pending.requestCount++;

    if (pending.requestCount > ARP_MAX_RETRIES) {
      // Timeout — resolution failed
      this._resolveFailed(targetIP);
      return;
    }

    // Create ARP request
    const arpRequest = createARPPacket({
      operation: 'request',
      senderIP: this.device.interfaces[0]?.ipv4?.address || '0.0.0.0',
      senderMAC: this.device.interfaces[0]?.macAddress || '00:00:00:00:00:00',
      targetIP,
      targetMAC: '00:00:00:00:00:00', // Unknown
    });

    // Wrap in Ethernet frame (broadcast)
    const frame = createEthernetFrame({
      srcMAC: this.device.interfaces[0]?.macAddress || '00:00:00:00:00:00',
      dstMAC: 'FF:FF:FF:FF:FF:FF',  // Broadcast
      etherType: 0x0806,             // ARP
      payload: arpRequest,
    });

    // Delegate actual transmission to SimulationBus if callback set
    if (this._callbacks.onSendARPRequest) {
      this._callbacks.onSendARPRequest(frame, targetIP);
    } else {
      console.warn(`ARPCache: No callback for ARP request send. targetIP=${targetIP}`);
    }

    // Cancel any existing timeout for this IP
    if (this._timeouts.has(targetIP)) {
      clearTimeout(this._timeouts.get(targetIP));
    }

    // Schedule retry/timeout
    const timeoutId = setTimeout(() => {
      this._timeouts.delete(targetIP);
      // Retry by calling _generateARPRequest again (which increments requestCount)
      this._generateARPRequest(targetIP);
    }, ARP_REQUEST_TIMEOUT);

    this._timeouts.set(targetIP, timeoutId);

    console.log(`[ARPCache] ARP request #${pending.requestCount} sent for ${targetIP}, retry in ${ARP_REQUEST_TIMEOUT}ms`);
  }

  /**
   * Handle incoming ARP request (reply to it if we own the target IP).
   * @private
   */
  _handleARPRequest(arpRequest, ingressInterface) {
    const ourInterfaces = this.device.interfaces;
    const targetInterface = ourInterfaces.find(iface => 
      iface.ipv4?.address === arpRequest.targetIP
    );

    if (!targetInterface) {
      // Not our IP, ignore
      return;
    }

    // Create ARP reply
    const arpReply = createARPPacket({
      operation: 'reply',
      senderIP: targetInterface.ipv4.address,
      senderMAC: targetInterface.macAddress,
      targetIP: arpRequest.senderIP,
      targetMAC: arpRequest.senderMAC,
    });

    // Wrap in Ethernet frame
    const frame = createEthernetFrame({
      srcMAC: targetInterface.macAddress,
      dstMAC: arpRequest.senderMAC,  // Reply directly to requester
      etherType: 0x0806,              // ARP
      payload: arpReply,
    });

    // Send reply (through SimulationBus)
    if (this._callbacks.onSendARPReply) {
      this._callbacks.onSendARPReply(frame, ingressInterface);
    }
  }

  /**
   * Handle incoming ARP reply.
   * @private
   */
  _handleARPReply(arpReply, ingressInterface) {
    const { senderIP, senderMAC } = arpReply;

    // Learn this MAC
    this.learn(senderIP, senderMAC);

    // Resolve any pending requests
    if (this._pending.has(senderIP)) {
      this._resolveSuccess(senderIP, senderMAC);
    }
  }

  /**
   * Resolve all pending packets for a target IP successfully.
   * @private
   */
  _resolveSuccess(targetIP, mac) {
    const entry = this._pending.get(targetIP);
    if (!entry) return;

    // Clear any pending timeout
    if (this._timeouts.has(targetIP)) {
      clearTimeout(this._timeouts.get(targetIP));
      this._timeouts.delete(targetIP);
    }

    entry.packetQueue.forEach(({ onResolved }) => {
      onResolved(mac);
    });

    this._pending.delete(targetIP);
    console.log(`[ARPCache] ARP resolution succeeded for ${targetIP} → ${mac}`);
  }

  /**
   * Fail all pending packets for a target IP.
   * @private
   */
  _resolveFailed(targetIP) {
    const entry = this._pending.get(targetIP);
    if (!entry) return;

    // Clear any pending timeout
    if (this._timeouts.has(targetIP)) {
      clearTimeout(this._timeouts.get(targetIP));
      this._timeouts.delete(targetIP);
    }

    entry.packetQueue.forEach(({ onFailed }) => {
      if (onFailed) onFailed();
    });

    this._pending.delete(targetIP);
    console.log(`[ARPCache] ARP resolution failed for ${targetIP} after ${entry.requestCount} attempts`);
  }

  // ---------------------------------------------------------------------------
  // CALLBACKS (for SimulationBus integration)
  // ---------------------------------------------------------------------------

  /**
   * Register callback to actually send ARP frames.
   * @param {Function} callback - (frame, targetIP) => void
   */
  onSendARPRequest(callback) {
    this._callbacks.onSendARPRequest = callback;
  }

  /**
   * Register callback for ARP reply sending.
   * @param {Function} callback - (frame) => void
   */
  onSendARPReply(callback) {
    this._callbacks.onSendARPReply = callback;
  }

  /**
   * Register callback for ARP timeout handling.
   * @param {Function} callback - (targetIP, timeoutMs) => void
   */
  onARPTimeout(callback) {
    this._callbacks.onARPTimeout = callback;
  }
}
