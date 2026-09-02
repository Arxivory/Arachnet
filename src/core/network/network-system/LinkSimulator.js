/**
 * LinkSimulator.js
 * 
 * Simulates packet transmission on physical links with:
 *  - Propagation delay (latency) based on link configuration
 *  - Random packet loss based on configured loss percentage
 *  - Packet queuing on ingress/egress buffers
 * 
 * Usage:
 *   const simulator = new LinkSimulator(engine);
 *   simulator.scheduleTransmission(id, packet, link, srcInterface, dstInterface);
 * 
 * When transmission completes:
 *   - engine.deliverPacket() is called
 *   - Packet is delivered to the receiving interface
 */

export default class LinkSimulator {
  /**
   * @param {NetworkIntegrationEngine} engine - Reference to the integration engine
   */
  constructor(engine) {
    this.engine = engine;

    // Transmission queues per link
    /** @type {Map<string, object[]>} Queued transmissions */
    this.transmissionQueues = new Map();

    // In-transit packets: scheduled deliveries
    this.pendingDeliveries = [];
  }

  /**
   * Schedule a packet transmission on a link.
   * 
   * @param {string} packetId         - Unique packet identifier
   * @param {object} packet           - The Ethernet frame or IP packet
   * @param {Link} link              - The physical link to transmit on
   * @param {Interface} srcInterface - Source interface
   * @param {Interface} dstInterface - Destination interface
   */
  scheduleTransmission(packetId, packet, link, srcInterface, dstInterface) {
    if (!link || link.status !== 'up') {
      this.engine.stats.packetsDropped++;
      this.engine._emit?.('packetDropped', {
        packetId,
        packet,
        link,
        srcInterface,
        dstInterface,
        reason: 'link-down',
      });
      return;
    }

    // Check for packet loss
    if (this._shouldDropPacket(link.packetLoss)) {
      this.engine.stats.packetsDropped++;
      console.log(`[LinkSimulator] Packet ${packetId} dropped due to link loss on ${link.id}`);
      this.engine._emit?.('packetDropped', {
        packetId,
        packet,
        link,
        srcInterface,
        dstInterface,
        reason: 'link-loss',
      });
      return;
    }

    // Calculate propagation delay
    const delayMs = link.latencyMs || 1;

    // Schedule delivery
    const deliveryTime = this.engine.clock.now() + delayMs;
    this.pendingDeliveries.push({
      packetId,
      packet,
      link,
      dstInterface,
      deliveryTime,
    });

    // Sort by delivery time (min-heap simulation)
    this.pendingDeliveries.sort((a, b) => a.deliveryTime - b.deliveryTime);

    console.log(`[LinkSimulator] Scheduled transmission ${packetId} on ${link.id} (latency: ${delayMs}ms)`);

    // Use real-time setTimeout so delivery actually fires after the latency delay.
    // _processPendingDeliveries is synchronous and checks clock.now() — without this
    // the check (deliveryTime <= now) is always false on the same JS tick and packets
    // sit in the queue forever.
    setTimeout(() => this._processPendingDeliveries(), delayMs);
  }

  /**
   * Check if a packet should be dropped based on loss percentage.
   * 
   * @private
   */
  _shouldDropPacket(lossPercentage) {
    if (lossPercentage <= 0) return false;
    if (lossPercentage >= 100) return true;
    return Math.random() * 100 < lossPercentage;
  }

  /**
   * Process packets that have completed transmission.
   * 
   * @private
   */
  _processPendingDeliveries() {
    const now = this.engine.clock.now();

    while (this.pendingDeliveries.length > 0 && this.pendingDeliveries[0].deliveryTime <= now) {
      const delivery = this.pendingDeliveries.shift();

      // Deliver to the destination interface
      console.log(`[LinkSimulator] Delivered ${delivery.packetId} to ${delivery.dstInterface.name} on ${delivery.dstInterface.device?.hostname}`);
      this.engine.deliverPacket(delivery.packet, delivery.dstInterface);
    }
  }

  /**
   * Get current queue lengths per link.
   */
  getQueueStats() {
    const stats = {};
    for (const [linkId, queue] of this.transmissionQueues.entries()) {
      stats[linkId] = queue.length;
    }
    return stats;
  }

  /**
   * Get pending deliveries.
   */
  getPendingDeliveries() {
    return [...this.pendingDeliveries];
  }
}