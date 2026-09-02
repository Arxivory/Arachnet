import MacTable from './MacTable.js';
import { isBroadcast, isSTPFrame } from '../Packet.js';

/**
 * SwitchingEngine.js
 * 
 * The Layer 2 processing brain. Now upgraded with 802.1Q VLAN awareness.
 */
export default class SwitchingEngine {
  constructor(device) {
    this.device = device;
    this.macTable = new MacTable();
  }

  processFrame(frame, ingressInterface) {
    if (!frame || !frame.srcMAC || !frame.dstMAC) return;

    const ingressPort = ingressInterface.physicalPort;
    if (!ingressPort || ingressPort.physicalStatus !== 'up') return;

    // --- NEW: STP INTERCEPTION ---
    // If it's a BPDU, send it directly to the STP Engine and STOP processing.
    if (isSTPFrame(frame)) {
      if (this.device.stpEngine) {
        this.device.stpEngine.processBPDU(frame.payload, ingressPort);
      }
      return; 
    }

    // --- NEW: STP BLOCKING GATE ---
    // If STP has blocked this port, DROP all normal data frames entering here.
    if (this.device.stpEngine?.portStates.get(ingressPort.id) === 'BLOCKING') {
      return; // Packet silently dropped
    }

    // --- STEP 1: INGRESS VLAN DETERMINATION ---
    const portMode = this.device.vlanManager.portModes.get(ingressPort.id) || 'access';
    let vlanId;

    if (portMode === 'trunk') {
      // Trunks trust incoming 802.1Q tags. If missing, assumes Native VLAN 1.
      vlanId = frame.vlanTag?.id || 1;
    } else {
      // Access ports ignore incoming tags. They forcefully assign their configured VLAN.
      vlanId = this.device.vlanManager.getIngressVlan(ingressPort.id);
      delete frame.vlanTag; // Strip tags (Security feature to prevent VLAN hopping)
    }

    // --- STEP 2: MAC LEARNING ---
    // The switch now memorizes the MAC address ALONG with its isolated VLAN ID
    this.macTable.learn(frame.srcMAC, ingressPort.id, vlanId);

    // --- STEP 3: FORWARDING DECISION ---
    if (isBroadcast(frame)) {
      this._flood(frame, ingressPort, vlanId);
    } else {
      const egressPortId = this.macTable.lookup(frame.dstMAC, vlanId);

      if (egressPortId) {
        this._forward(frame, egressPortId, vlanId);
      } else {
        this._flood(frame, ingressPort, vlanId);
      }
    }
  }

  _forward(frame, egressPortId, frameVlanId) {
    // --- NEW: STP EGRESS BLOCKING GATE ---
    // Do not forward data traffic out of a blocked port
    if (this.device.stpEngine?.portStates.get(egressPortId) === 'BLOCKING') {
      return; 
    }
    // SECURITY GATE: Is this frame allowed to exit this specific port?
    if (!this.device.vlanManager.isEgressAllowed(egressPortId, frameVlanId)) {
       return; // Packet Dropped: VLAN Boundary isolation
    }

    const egressPort = this.device.ports.find(p => p.id === egressPortId);
    if (!egressPort || !egressPort.link || egressPort.physicalStatus !== 'up') return;

    // Prepare the frame for leaving the switch
    const frameClone = this._prepareEgressFrame(frame, egressPortId, frameVlanId);
    egressPort.link.transmitPacket(frameClone, egressPort);
  }

  _flood(frame, ingressPort, vlanId) {
    const activePorts = this.device.occupiedPorts.filter(
      p => p.physicalStatus === 'up' && p.id !== ingressPort.id
    );

    activePorts.forEach(egressPort => {
      // --- NEW: STP EGRESS BLOCKING GATE ---
      if (this.device.stpEngine?.portStates.get(egressPort.id) === 'BLOCKING') {
        return; // Skip flooding down blocked links
      }
      // SECURITY GATE: Only flood out of ports allowed to carry this VLAN
      if (this.device.vlanManager.isEgressAllowed(egressPort.id, vlanId)) {
        const frameClone = this._prepareEgressFrame(frame, egressPort.id, vlanId);
        egressPort.link.transmitPacket(frameClone, egressPort);
      }
    });
  }

  /**
   * Helper: Modifies the Ethernet Frame headers depending on the port it is leaving.
   */
  _prepareEgressFrame(frame, egressPortId, frameVlanId) {
    const frameClone = JSON.parse(JSON.stringify(frame));
    const mode = this.device.vlanManager.portModes.get(egressPortId) || 'access';

    if (mode === 'trunk') {
      // Add the IEEE 802.1Q Tag so the next switch knows what VLAN this is
      frameClone.vlanTag = { id: frameVlanId, priority: 0 };
    } else {
      // Strip the tag! Standard PCs drop tagged frames, so access ports must strip them.
      delete frameClone.vlanTag;
    }
    
    return frameClone;
  }
}