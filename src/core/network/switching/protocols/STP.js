import { createBPDUPacket, createEthernetFrame } from '../../Packet.js';

/**
 * STP.js (IEEE 802.1D)
 * 
 * Elects a Root Bridge, calculates Root Path Cost, and blocks redundant ports.
 */
export default class STPEngine {
  constructor(device) {
    this.device = device;
    
    // Default Cisco STP Priority is 32768
    this.priority = 32768; 
    this.baseMac = null; 
    this.bridgeId = null;

    // STP State
    this.rootId = null;
    this.rootPathCost = 0;
    this.rootPortId = null; // The port that points to the Root Bridge

    // Port States: Maps portId -> 'FORWARDING' | 'BLOCKING'
    this.portStates = new Map();
    
    this._helloTimer = null;
    this.isRunning = false;
  }

  setBridgePriority(priority) {
    const normalized = Number.parseInt(priority, 10);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 61440) {
      throw new Error('STP priority must be between 0 and 61440.');
    }

    this.priority = normalized;
    this.bridgeId = `${this.priority}.${this.baseMac || this.device.interfaces[0]?.macAddress || '00:00:00:00:00:00'}`;
    this.rootId = this.bridgeId;
    this.rootPathCost = 0;
    return this.bridgeId;
  }

  getPortSummary() {
    return Array.from(this.portStates.entries()).map(([portId, state]) => ({ portId, state }));
  }

  start() {
    if (this.isRunning) return;
    
    // The Base MAC is usually the first interface's MAC
    this.baseMac = this.device.interfaces[0]?.macAddress || '00:00:00:00:00:00';
    this.bridgeId = `${this.priority}.${this.baseMac}`;
    
    // Initially, every switch believes it is the Root Bridge!
    this.rootId = this.bridgeId;
    this.rootPathCost = 0;
    this.rootPortId = null;

    // Set all active ports to FORWARDING initially
    this.device.ports.forEach(port => {
      this.portStates.set(port.id, 'FORWARDING');
    });

    this.isRunning = true;
    
    // Send BPDUs every 2 seconds (Standard IEEE 802.1D Hello Time)
    this._helloTimer = setInterval(() => this._sendBPDUs(), 2000);
    console.log(`[${this.device.hostname}] STP Started. Bridge ID: ${this.bridgeId}`);
  }

  stop() {
    this.isRunning = false;
    if (this._helloTimer) clearInterval(this._helloTimer);
    console.log(`[${this.device.hostname}] STP Stopped.`);
  }

  /**
   * Called by SwitchingEngine when an STP Multicast frame arrives.
   */
  processBPDU(bpdu, ingressPort) {
    if (!this.isRunning) return;

    const incomingRootId = bpdu.rootId;
    // Simplified cost: Add 19 (Standard 100Mbps FastEthernet cost) per hop
    const incomingCost = bpdu.rootPathCost + 19; 

    let topologyChanged = false;

    // 1. ROOT ELECTION: Lower Bridge ID wins!
    if (incomingRootId < this.rootId) {
      console.log(`[${this.device.hostname}] Found better Root Bridge! ${this.rootId} -> ${incomingRootId}`);
      this.rootId = incomingRootId;
      this.rootPathCost = incomingCost;
      this.rootPortId = ingressPort.id;
      topologyChanged = true;
    } 
    // 2. ROOT PATH TIE-BREAKER: If it's the same root, do we have a cheaper path?
    else if (incomingRootId === this.rootId) {
      if (incomingCost < this.rootPathCost) {
        this.rootPathCost = incomingCost;
        this.rootPortId = ingressPort.id;
        topologyChanged = true;
      }
    }

    if (topologyChanged) {
      this._recalculatePortStates();
    } else {
      // 3. LOOP PREVENTION: If this BPDU is from the same root, but it's not our Root Port,
      // and the sender has a better claim to the segment, we must BLOCK our port.
      if (incomingRootId === this.rootId && ingressPort.id !== this.rootPortId) {
        // If the sender's cost to root is lower than ours, they own the link. We yield and block.
        if (bpdu.rootPathCost < this.rootPathCost || 
           (bpdu.rootPathCost === this.rootPathCost && bpdu.bridgeId < this.bridgeId)) {
          
          if (this.portStates.get(ingressPort.id) !== 'BLOCKING') {
            console.warn(`[${this.device.hostname}] STP BLOCKING port ${ingressPort.name} to prevent loop!`);
            this.portStates.set(ingressPort.id, 'BLOCKING');
          }
        }
      }
    }
  }

  _recalculatePortStates() {
    this.device.occupiedPorts.forEach(port => {
      // The Root Port is always FORWARDING
      if (port.id === this.rootPortId) {
        this.portStates.set(port.id, 'FORWARDING');
      } else {
        // Assume Designated (FORWARDING) unless a superior BPDU tells us otherwise later
        this.portStates.set(port.id, 'FORWARDING');
      }
    });
  }

  _sendBPDUs() {
    // Only the Root Bridge generates BPDUs natively.
    // Non-root bridges only relay BPDUs out of their Designated ports, but for this
    // MVP, we broadcast our best knowledge to assert port roles.
    const bpdu = createBPDUPacket({
      rootId: this.rootId,
      rootPathCost: this.rootPathCost,
      bridgeId: this.bridgeId,
      portId: 'system', // Simplified
    });

    const frame = createEthernetFrame({
      srcMAC: this.baseMac,
      dstMAC: '01:80:C2:00:00:00', // STP Multicast MAC
      payload: bpdu,
    });

    this.device.occupiedPorts.forEach(port => {
      // Don't send BPDUs back out the Root Port
      if (port.id !== this.rootPortId && port.physicalStatus === 'up') {
        port.link.transmitPacket(frame, port);
      }
    });
  }
}