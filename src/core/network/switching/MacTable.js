/**
 * MacTable.js
 * 
 * The Content Addressable Memory (CAM) table for a Layer 2 Switch.
 * Stores mappings of MAC addresses to specific physical ports and VLANs.
 */
export default class MacTable {
  constructor() {
    // Map is perfect here for O(1) lookups.
    // Key: MAC Address (string)
    // Value: { portId (string), vlanId (number), timestamp (number) }
    this.entries = new Map();
  }

  /**
   * Phase 1 & 2: Learn or update a MAC address entry.
   * Called by the SwitchingEngine when a frame arrives.
   * 
   * @param {string} macAddress - The Source MAC of the incoming frame
   * @param {string} portId     - The ID of the physical port it arrived on
   * @param {number} vlanId     - The VLAN the port belongs to (defaults to 1)
   */
  learn(macAddress, portId, vlanId = 1) {
    // Switches never learn broadcast or multicast source MACs
    if (!macAddress || macAddress.toUpperCase() === 'FF:FF:FF:FF:FF:FF') {
      return;
    }

    // Add or update the entry, recording the exact time it was learned
    this.entries.set(macAddress.toUpperCase(), {
      portId,
      vlanId,
      timestamp: Date.now()
    });
  }

  /**
   * Look up a destination MAC address to find its egress port.
   * 
   * @param {string} macAddress - The Destination MAC of the frame
   * @param {number} vlanId     - The VLAN context of the frame
   * @returns {string|null}     - The portId if known, or null if unknown
   */
  lookup(macAddress, vlanId = 1) {
    const entry = this.entries.get(macAddress.toUpperCase());
    
    // Phase 2 check: Only return the port if it belongs to the exact same VLAN
    if (entry && entry.vlanId === vlanId) {
      return entry.portId;
    }
    
    return null; // Unknown unicast -> causes the switch to flood
  }

  /**
   * Get the full table (Useful for your UI Modals later!)
   * @returns {Array} Array of MAC table entries
   */
  getTable() {
    const table = [];
    for (const [mac, data] of this.entries.entries()) {
      table.push({
        macAddress: mac,
        portId: data.portId,
        vlanId: data.vlanId,
        age: Math.floor((Date.now() - data.timestamp) / 1000) // Age in seconds
      });
    }
    return table;
  }

  /**
   * Clears the entire MAC table.
   */
  flush() {
    this.entries.clear();
  }

  /**
   * Future-proofing: Removes entries older than the maxAge (MAC Aging Timer)
   * @param {number} maxAgeSeconds - Default Cisco aging time is usually 300s (5 mins)
   */
  ageOut(maxAgeSeconds = 300) {
    const now = Date.now();
    for (const [mac, data] of this.entries.entries()) {
      const ageSeconds = (now - data.timestamp) / 1000;
      if (ageSeconds > maxAgeSeconds) {
        this.entries.delete(mac);
      }
    }
  }
}