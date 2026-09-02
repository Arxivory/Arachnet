import Device from "../../core/network/Device";
import Link from "../../core/network/Link";
import appState from "../AppState";

export class NetworkStore {
  constructor() {
    this.devices = [];
    this.links = [];
    this.metadata = {
      name: 'Untitled Network',
      created: new Date(),
      modified: new Date()
    };
    this.listeners = [];
  }

  addDevice(deviceData) {
    if (!deviceData.id) {
      console.error('Invalid device data', deviceData);
      return null;
    }

    if (this.devices.find(d => d.id === deviceData.id)) {
      console.warn(`Device already exists: ${deviceData.id}`);
      return null;
    }

    console.log(deviceData);

    this.devices.push(deviceData);
    this.updateModified();
    this.notify();

    return deviceData;
  }

removeDevice(deviceId) {
    const index = this.devices.findIndex(d => d.id === deviceId);
    if (index === -1) return false;

    // 1. Use the correct property names: sourceId and targetId
    const linksToRemove = this.links
        .filter(l => l.sourceId === deviceId || l.targetId === deviceId)
        .map(l => l.id);

    // 2. Delete those cables first to free up surviving ports!
    linksToRemove.forEach(linkId => {
        this.removeLink(linkId); 
    });

    // 3. Now safely destroy the device itself
    this.devices.splice(index, 1);
    
    // Tell the Canvas to visually destroy the device graphic
    window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: deviceId } }));

    this.updateModified();
    this.notify();

    return true;
  }

updateDevice(deviceId, updates) {
    const device = this.devices.find(d => d.id === deviceId);
    if (!device) return false;

    const normalizedUpdates = { ...updates };

    // ── Path A: Full IPv4/IPv6 objects from IPConfigurationModal ──────────────
    // The modal already wrote to the live ifaceRef directly; here we persist
    // the values on both the device record and the correct interface object so
    // that toJSON(), readIpv4(), and future modal opens all see consistent data.
    // We deliberately do NOT call configureIPv4() — that strips gateway/dns/mode.
    if (normalizedUpdates._ipv4 !== undefined || normalizedUpdates._ipv6 !== undefined) {

      // ── Resolve the FastEthernet0 interface by name, mirroring resolveInterfaces()
      // in IPConfigurationModal so we always patch the exact same object the modal
      // wrote to — not just whichever interface happens to be at index 0.
      const isFastEthernet = (name = '') => /^fastethernet\d/i.test(name.trim());

      let targetIface = null;

      if (device._interfaces instanceof Map) {
        // Device class instance — search the Map by name
        const all = [...device._interfaces.values()];
        targetIface =
          all.find(i => isFastEthernet(i.name)) ||   // prefer FastEthernet
          all[0] ||                                    // fallback: first interface
          null;
      } else if (Array.isArray(device.interfaces) && device.interfaces.length > 0) {
        // Plain NetworkStore object — search the array by name/label
        targetIface =
          device.interfaces.find(i => isFastEthernet(i.name || i.label || '')) ||
          device.interfaces[0];
      }

      if (normalizedUpdates._ipv4 !== undefined) {
        const nextIpv4 = normalizedUpdates._ipv4;
        delete normalizedUpdates._ipv4;

        // Persist on device for serialisation / re-hydration consumers
        device._ipv4 = nextIpv4;
        // Also store under plain ipv4 so toJSON() picks it up without special-casing
        device.ipv4  = nextIpv4;

        // Patch the resolved interface object (the same one ifaceRef points to)
        if (targetIface) {
          targetIface.ipv4 = nextIpv4;
        }
      }

      if (normalizedUpdates._ipv6 !== undefined) {
        const nextIpv6 = normalizedUpdates._ipv6;
        delete normalizedUpdates._ipv6;

        device._ipv6 = nextIpv6;
        device.ipv6  = nextIpv6;

        if (targetIface) {
          targetIface.ipv6 = nextIpv6;
        }
      }
    }

    // ── Path B: Legacy ipAddress/subnetMask shortcut (other callers) ──────────
    // Only runs when _ipv4 is NOT present so the modal path never hits this.
    if (normalizedUpdates.ipAddress !== undefined || normalizedUpdates.subnetMask !== undefined) {
      const addressFromUpdate = normalizedUpdates.ipAddress;
      const maskFromUpdate = normalizedUpdates.subnetMask;

      const deviceInterfaces = Array.isArray(device.interfaces) ? device.interfaces : [];

      if (deviceInterfaces.length > 0) {
        const primaryInterface = deviceInterfaces[0];
        const currentAddress = primaryInterface?.ipv4?.address ?? '';
        const currentMask = primaryInterface?.ipv4?.subnetMask ?? '';
        const nextAddress = addressFromUpdate !== undefined ? addressFromUpdate : currentAddress;
        const nextMask = maskFromUpdate !== undefined ? maskFromUpdate : currentMask;

        if (typeof primaryInterface.configureIPv4 === 'function') {
          primaryInterface.configureIPv4(nextAddress, nextMask);
        } else {
          primaryInterface.ipv4 = {
            ...(primaryInterface.ipv4 || {}),
            address: nextAddress,
            subnetMask: nextMask
          };
        }
      } else {
        const fallbackAddress = addressFromUpdate !== undefined ? addressFromUpdate : '';
        const fallbackMask = maskFromUpdate !== undefined ? maskFromUpdate : '';
        device.interfaces = [{ ipv4: { address: fallbackAddress, subnetMask: fallbackMask } }];
      }

      delete normalizedUpdates.ipAddress;
      delete normalizedUpdates.subnetMask;
    }

    // 1. Guardrail: Prevent Empty Names
    if (normalizedUpdates.label !== undefined) {
        if (normalizedUpdates.label.trim() === '') {
            delete normalizedUpdates.label; // Cancel this specific update
        } else {
            device.hostname = normalizedUpdates.label;
            device.name = normalizedUpdates.label;
            device.label = normalizedUpdates.label;
        }
    }

    Object.assign(device, normalizedUpdates);

    // 2. Dispatch event to instantly update Canvas
    window.dispatchEvent(new CustomEvent('forceCanvasUpdate', { 
        detail: { id: deviceId, updates: normalizedUpdates } 
    }));
    
    this.updateModified();
    this.notify(); 
    return true;
  }

  getDevice(deviceId) {
    return this.devices.find(d => d.id === deviceId);
  }

  getAllDevices() {
    return [...this.devices];
  }

  addLink(linkData) {
    if (!linkData.id) {
      console.error('Invalid link data', linkData);
      return null;
    }

    const sourceId = linkData.sourcePort.id.split("::")[0];
    const targetId = linkData.targetPort.id.split("::")[0];

    if (!this.getDevice(sourceId) || !this.getDevice(targetId)) {
      console.error('One or both devices do not exist', linkData);
      return null;
    }

    console.log('Link Data: ', linkData);

    this.links.push(linkData);
    this.updateModified();
    this.notify();

    //link array log check
    console.log('Link Added Successfully...');
    console.log("Links Check: ");

    for (const link of this.links)
      console.log(link);

    return linkData;
  }

  // Helper to safely detach a port so it returns to the dropdown
  _freePort(deviceId, portId) {
    const dev = this.devices.find(d => d.id === deviceId);
    if (dev && dev.interfaces) {
      const port = dev.interfaces.find(i => 
        i.id === portId || i.name === portId || i.label === portId
      );
      if (port) {
        port.status = 'available';
        port.connected = false;
        delete port.connectedTo;
        delete port.linkId;
        delete port.targetDevice;
        delete port.targetInterface;
      }
    }
  }

  updateLinkEndpoint(linkId, endpointType, newDeviceId, newPort) {
    const link = this.getLink(linkId);
    if (!link) return false;

    const newPortObj = (newPort && typeof newPort === 'object') 
        ? newPort 
        : this.getDevice(newDeviceId)?.getPortByName(newPort);

    if (!newPortObj) {
        console.error('updateLinkEndpoint: could not resolve new port');
        return false;
    }

    // 1. Detach from the old port at Layer 1
    if (endpointType === 'source') {
        link.sourcePort?.detachLink?.();
    } else {
        link.targetPort?.detachLink?.();
    }

    const result = newPortObj.attachLink(link);
    if (!result.success) {
        console.error('updateLinkEndpoint: failed to attach to new port:', result.error);
        return false;
    }

    if (endpointType === 'source') {
        link.sourcePort = newPortObj;
        link.sourceId   = newDeviceId;
    } else {
        link.targetPort = newPortObj;
        link.targetId   = newDeviceId;
    }

    this.updateModified();
    this.notify();
    appState.selection?.notify?.();
    return true;
  }

  removeLink(linkId) {
    const index = this.links.findIndex(l => l.id === linkId);
    if (index === -1) return false;

    const link = this.links[index];

    if (typeof link.bringDown === 'function') {
        link.bringDown();
    }

    this.links.splice(index, 1);

    window.dispatchEvent(new CustomEvent('forceCanvasDelete', { detail: { id: linkId } }));

    this.updateModified();
    this.notify();
    appState.selection?.notify?.();

    return true;
  }

  getLink(linkId) {
    return this.links.find(l => l.id === linkId);
  }

  getAllLinks() {
    return [...this.links];
  }

  setNetworkName(name) {
    this.metadata.name = name;
    this.updateModified();
    this.notify();
  }

  getNetworkName() {
    return this.metadata.name;
  }

  updateModified() {
    this.metadata.modified = new Date();
  }

  reset() {
    this.devices = [];
    this.links = [];
    this.metadata = {
      name: 'Untitled Network',
      created: new Date(),
      modified: new Date()
    };
    this.notify();
  }

  subscribe(callback) {
    if (typeof callback !== 'function') {
      console.error('Listener must be a function');
      return () => {};
    }

    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  notify() {
    this.listeners.forEach(listener => {
      try {
        listener(this);
      } catch (error) {
        console.error('Error in NetworkStore listener:', error);
      }
    });
  }
}