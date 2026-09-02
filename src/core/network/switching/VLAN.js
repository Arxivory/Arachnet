/**
 * VLAN.js
 * 
 * Manages the VLAN Database (vlan.dat) and port assignments for a Layer 2 Switch.
 */
export default class VLANManager {
  /**
   * @param {import('../Device.js').default} device - The parent switch hardware
   */
  constructor(device) {
    this.device = device;
    
    // VLAN Database: Map of vlanId (number) -> name (string)
    this.database = new Map();
    
    // Port Configurations
    // Maps portId -> 'access' | 'trunk'
    this.portModes = new Map(); 
    
    // Maps portId -> vlanId (for access ports)
    this.accessVlans = new Map();

    // Maps portId -> trunk config metadata
    this.trunkConfigs = new Map();
    
    // Boot up with standard Cisco default VLANs
    this._initDefaults();
  }

  _initDefaults() {
    this.database.set(1, 'default');
    this.database.set(1002, 'fddi-default');
    this.database.set(1003, 'token-ring-default');
    this.database.set(1004, 'fddinet-default');
    this.database.set(1005, 'trnet-default');
  }

  // =========================================================================
  // VLAN DATABASE MANAGEMENT
  // =========================================================================

  addVlan(vlanId, name = null, metadata = {}) {
    if (vlanId <= 0 || vlanId > 4094) {
      throw new Error("VLAN ID must be between 1 and 4094.");
    }
    const vlanName = name || `VLAN${vlanId.toString().padStart(4, '0')}`;
    this.database.set(vlanId, {
      id: vlanId,
      name: vlanName,
      type: metadata.type || 'data',
      status: metadata.status || 'active',
      mtu: metadata.mtu || 1500,
      subnet: metadata.subnet || null,
    });
    console.log(`[${this.device.hostname}] Created VLAN ${vlanId} (${vlanName})`);
  }

  removeVlan(vlanId) {
    if ([1, 1002, 1003, 1004, 1005].includes(vlanId)) {
      throw new Error(`Cannot delete default VLAN ${vlanId}.`);
    }
    this.database.delete(vlanId);
    console.log(`[${this.device.hostname}] Deleted VLAN ${vlanId}`);
    
    // If a VLAN is deleted, any access ports assigned to it fallback to VLAN 1
    for (const [portId, pVlanId] of this.accessVlans.entries()) {
      if (pVlanId === vlanId) {
        this.accessVlans.set(portId, 1);
        console.warn(`[${this.device.hostname}] Port ${portId.split('::')[1]} fell back to VLAN 1`);
      }
    }
  }

  // =========================================================================
  // PORT CONFIGURATION (switchport)
  // =========================================================================

  setPortMode(portId, mode) {
    if (mode !== 'access' && mode !== 'trunk') {
      throw new Error("Port mode must be 'access' or 'trunk'.");
    }
    this.portModes.set(portId, mode);
    
    // Ensure it has a default access VLAN assigned if it doesn't already
    if (!this.accessVlans.has(portId)) {
      this.accessVlans.set(portId, 1);
    }

    if (mode === 'access') {
      this.trunkConfigs.delete(portId);
    } else {
      const existing = this.trunkConfigs.get(portId) || {};
      this.trunkConfigs.set(portId, {
        nativeVlan: existing.nativeVlan || 1,
        allowedVlans: existing.allowedVlans || null,
        tagNativeFrames: existing.tagNativeFrames || false,
      });
    }
  }

  setAccessVlan(portId, vlanId) {
    if (!this.database.has(vlanId)) {
      console.log(`[${this.device.hostname}] VLAN ${vlanId} does not exist. Creating it.`);
      this.addVlan(vlanId);
    }
    this.accessVlans.set(portId, vlanId);
    this.portModes.set(portId, 'access'); // Automatically force to access mode
    this.trunkConfigs.delete(portId);
  }

  setTrunkPort(portId, options = {}) {
    const nativeVlan = Number.parseInt(options.nativeVlan ?? 1, 10) || 1;
    const allowedVlans = Array.isArray(options.allowedVlans)
      ? new Set(options.allowedVlans.map(v => Number.parseInt(v, 10)).filter(v => Number.isInteger(v) && v > 0 && v <= 4094))
      : null;

    if (!this.database.has(nativeVlan)) {
      this.addVlan(nativeVlan);
    }

    this.portModes.set(portId, 'trunk');
    this.trunkConfigs.set(portId, {
      nativeVlan,
      allowedVlans,
      tagNativeFrames: Boolean(options.tagNativeFrames),
    });
  }

  setNativeVlan(portId, vlanId) {
    if (!this.database.has(vlanId)) {
      this.addVlan(vlanId);
    }

    const existing = this.trunkConfigs.get(portId) || {};
    this.portModes.set(portId, 'trunk');
    this.trunkConfigs.set(portId, {
      nativeVlan: vlanId,
      allowedVlans: existing.allowedVlans || null,
      tagNativeFrames: existing.tagNativeFrames || false,
    });
  }

  setTrunkAllowedVlans(portId, vlanList) {
    const normalized = Array.isArray(vlanList)
      ? vlanList.map(v => Number.parseInt(v, 10)).filter(v => Number.isInteger(v) && v > 0 && v <= 4094)
      : [];

    const existing = this.trunkConfigs.get(portId) || {};
    this.portModes.set(portId, 'trunk');
    this.trunkConfigs.set(portId, {
      nativeVlan: existing.nativeVlan || 1,
      allowedVlans: new Set(normalized),
      tagNativeFrames: existing.tagNativeFrames || false,
    });
  }

  setTagNativeFrames(portId, shouldTag = true) {
    const existing = this.trunkConfigs.get(portId) || {};
    this.portModes.set(portId, 'trunk');
    this.trunkConfigs.set(portId, {
      nativeVlan: existing.nativeVlan || 1,
      allowedVlans: existing.allowedVlans || null,
      tagNativeFrames: Boolean(shouldTag),
    });
  }

  // =========================================================================
  // ENGINE LOGIC HOOKS (Used by SwitchingEngine.js)
  // =========================================================================

  /**
   * Determines the VLAN of an incoming frame.
   * If the frame arrived on an Access port, it is assigned that port's VLAN.
   */
  getIngressVlan(portId, frame = null) {
    return this.resolveIngress(portId, frame).vlanId;
  }

  resolveIngress(portId, frame = null) {
    const mode = this.portModes.get(portId) || 'access';

    if (mode === 'trunk') {
      const trunkConfig = this.trunkConfigs.get(portId) || { nativeVlan: 1, allowedVlans: null, tagNativeFrames: false };
      const taggedVlan = frame?.vlanTag?.id;

      if (taggedVlan) {
        if (trunkConfig.allowedVlans && !trunkConfig.allowedVlans.has(taggedVlan)) {
          return { vlanId: null, dropFrame: true, stripTag: false };
        }
        return { vlanId: taggedVlan, dropFrame: false, stripTag: false };
      }

      return { vlanId: trunkConfig.nativeVlan || 1, dropFrame: false, stripTag: false };
    }

    const accessVlan = this.accessVlans.get(portId) || 1;
    return {
      vlanId: accessVlan,
      dropFrame: false,
      stripTag: Boolean(frame?.vlanTag),
    };
  }

  /**
   * Checks if a frame belonging to a specific VLAN is allowed to leave this port.
   */
  isEgressAllowed(portId, frameVlanId) {
    const mode = this.portModes.get(portId) || 'access';
    
    if (mode === 'access') {
      // Isolation: Access ports can ONLY send traffic belonging to their exact VLAN
      const assignedVlan = this.accessVlans.get(portId) || 1;
      return assignedVlan === frameVlanId;
    } else if (mode === 'trunk') {
      const trunkConfig = this.trunkConfigs.get(portId);
      if (!trunkConfig || !trunkConfig.allowedVlans) {
        return true;
      }
      return trunkConfig.allowedVlans.has(frameVlanId);
    }
    return false;
  }

  shouldTagEgressFrame(portId, frameVlanId) {
    const mode = this.portModes.get(portId) || 'access';
    if (mode !== 'trunk') {
      return false;
    }

    const trunkConfig = this.trunkConfigs.get(portId) || { nativeVlan: 1, tagNativeFrames: false };
    if (frameVlanId === (trunkConfig.nativeVlan || 1) && !trunkConfig.tagNativeFrames) {
      return false;
    }

    return true;
  }

  getPortConfig(portId) {
    const mode = this.portModes.get(portId) || 'access';
    const trunkConfig = this.trunkConfigs.get(portId) || null;

    return {
      mode,
      accessVlan: this.accessVlans.get(portId) || 1,
      nativeVlan: trunkConfig?.nativeVlan || 1,
      allowedVlans: trunkConfig?.allowedVlans ? [...trunkConfig.allowedVlans] : null,
      tagNativeFrames: trunkConfig?.tagNativeFrames || false,
    };
  }

  // =========================================================================
  // UI HELPERS (For your VLANModal.jsx later!)
  // =========================================================================
  
  getDatabase() {
    return Array.from(this.database.values()).map(vlan => ({
      id: vlan.id,
      name: vlan.name,
      type: vlan.type,
      status: vlan.status,
      mtu: vlan.mtu,
      subnet: vlan.subnet,
    }));
  }
}