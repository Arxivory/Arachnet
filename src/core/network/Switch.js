/**
 * Switch.js
 * 
 * Behavior installer for switches.
 * Attaches Layer 2 switching logic to a Device instance at runtime.
 * 
 * Pattern: Behavior/Mixin rather than subclassing.
 * This avoids coupling DeviceFactory to switch-specific logic.
 * 
 * Usage:
 *   const device = new Device(config);
 *   if (device.type === 'switch') {
 *     installSwitchBehavior(device);
 *   }
 */

import SwitchingEngine from './switching/SwitchingEngine.js';
import VLANManager from './switching/VLAN.js';
import STPEngine from './switching/protocols/STP.js';
import Interface from './Interface.js';
import PacketBuilder from './routing/PacketBuilder.js';

/**
 * Install switch behavior on a Device instance.
 * After calling this, the device will:
 *  - Have a MAC Address Table (CAM)
 *  - Support Layer 2 frame forwarding and flooding
 *  - Isolate broadcast domains (VLANs)
 * 
 * @param {Device} device - The device to upgrade to a switch
 * @returns {Device} The same device, now with switching behavior
 */
export function installSwitchBehavior(device) {
  // Prevent double-installation
  if (device._switchInstalled) {
    console.warn(`[${device.hostname}] Switch behavior already installed`);
    return device;
  }

  // =========================================================================
  // INSTALL SWITCHING COMPONENTS
  // =========================================================================
  // Install the VLAN Manager first, as the Switching Engine will rely on it for VLAN info
  device.vlanManager = new VLANManager(device);
  // Instantiates the brain, which internally creates the MacTable
  device.engine = new SwitchingEngine(device);

  // Install and boot Spanning Tree
  device.stpEngine = new STPEngine(device);
  device.stpEngine.start()
  // =========================================================================
  // OVERRIDE PACKET HANDLING
  // =========================================================================

  /**
   * Main packet receiving hook.
   * Called whenever an interface receives a frame from a physical link.
   */
  device.onPacketReceived = function(packet, ingressInterface) {
    // CHECK L3 INTERCEPT FOR SVI
    if (packet && packet.etherType === 0x0800) {
       // Is the destination MAC one of our SVIs? (SVIs use the base MAC of the switch)
       if (packet.dstMAC === this.interfaces[0]?.macAddress) {
          const ipPacket = PacketBuilder.extractIPPacket(packet);
          if (ipPacket && ipPacket.protocol === 'icmp') {
             const icmp = ipPacket.payload;
             if (icmp && icmp.type === 'echo-request') {
                // Find if we have an SVI with this IP
                let svi = null;
                if (this.switchVirtualInterfaces) {
                   for (const intf of this.switchVirtualInterfaces.values()) {
                      if (intf.ipv4 && intf.ipv4.address === ipPacket.dstIP) {
                         svi = intf;
                         break;
                      }
                   }
                }
                if (svi) {
                   // Build reply
                   const replyFrame = PacketBuilder.buildICMPEchoReply(
                      svi.macAddress,
                      packet.srcMAC,
                      ipPacket.dstIP,
                      ipPacket.srcIP,
                      icmp.id,
                      icmp.sequence,
                      icmp.data
                   );
                   // Transmit back out the ingress interface
                   if (ingressInterface._engine) {
                      ingressInterface._engine.transmitPacket(replyFrame, ingressInterface);
                   } else if (ingressInterface.physicalPort?.link) {
                      ingressInterface.physicalPort.link.transmitPacket(replyFrame, ingressInterface.physicalPort);
                   }
                   return; // Consumed by SVI
                }
             }
          }
       }
    }

    // Route the ethernet frame through the Layer 2 pipeline
    this.engine.processFrame(packet, ingressInterface);
  };

  // =========================================================================
  // INTERFACE STATUS CHANGES
  // =========================================================================

  /**
   * Called when an interface comes up or goes down.
   * Clears MAC addresses associated with a port that goes down.
   */
  const originalOnInterfaceStatusChange = device.onInterfaceStatusChange;
  device.onInterfaceStatusChange = function(iface, newStatus, prevStatus) {
    // Call original if it exists
    if (originalOnInterfaceStatusChange) {
      originalOnInterfaceStatusChange.call(this, iface, newStatus, prevStatus);
    }

    // If a port goes down, flush its dynamically learned MAC addresses
    if (newStatus === 'down' || newStatus === 'err-disabled') {
      const portId = iface.physicalPort?.id;
      if (portId) {
        // Iterate and remove entries matching this port
        for (const [mac, data] of this.engine.macTable.entries.entries()) {
          if (data.portId === portId) {
            this.engine.macTable.entries.delete(mac);
          }
        }
        console.log(`[${this.hostname}] Flushed MAC entries for downed interface ${iface.name}`);
      }
    }
  };

  // =========================================================================
  // MANAGEMENT COMMANDS (Cisco CLI Equivalents)
  // =========================================================================

  /**
   * Display the MAC address table (Cisco-style: show mac address-table)
   * Essential for connecting to your Advanced Configuration UI modals.
   */
  device.showMacAddressTable = function() {
    return this.engine.macTable.getTable();
  };

  /**
   * Clear dynamic MAC address entries (Cisco-style: clear mac address-table dynamic)
   */
  device.clearMacAddressTable = function() {
    this.engine.macTable.flush();
    console.log(`[${this.hostname}] MAC address table cleared.`);
  };

  device.configureAccessPort = function(interfaceName, vlanId) {
    const port = this.getPortByName(interfaceName);
    if (!port) {
      throw new Error(`[${this.hostname}] Unknown port ${interfaceName}`);
    }

    this.vlanManager.setAccessVlan(port.id, Number.parseInt(vlanId, 10));
    return this.vlanManager.getPortConfig(port.id);
  };

  device.configureTrunkPort = function(interfaceName, options = {}) {
    const port = this.getPortByName(interfaceName);
    if (!port) {
      throw new Error(`[${this.hostname}] Unknown port ${interfaceName}`);
    }

    this.vlanManager.setTrunkPort(port.id, options);
    return this.vlanManager.getPortConfig(port.id);
  };

  device.configureNativeVlan = function(interfaceName, vlanId) {
    const port = this.getPortByName(interfaceName);
    if (!port) {
      throw new Error(`[${this.hostname}] Unknown port ${interfaceName}`);
    }

    this.vlanManager.setNativeVlan(port.id, Number.parseInt(vlanId, 10));
    return this.vlanManager.getPortConfig(port.id);
  };

  device.configureAllowedVlans = function(interfaceName, vlanList) {
    const port = this.getPortByName(interfaceName);
    if (!port) {
      throw new Error(`[${this.hostname}] Unknown port ${interfaceName}`);
    }

    const list = Array.isArray(vlanList)
      ? vlanList
      : String(vlanList || '')
          .split(',')
          .map(value => value.trim())
          .filter(Boolean);

    this.vlanManager.setTrunkAllowedVlans(port.id, list);
    return this.vlanManager.getPortConfig(port.id);
  };

  device.configureRouterOnStick = function(physicalInterfaceName, vlanId, ipAddress, subnetMask) {
    const baseInterface = this.getInterfaceByName(physicalInterfaceName);
    if (!baseInterface) {
      throw new Error(`[${this.hostname}] Unknown interface ${physicalInterfaceName}`);
    }

    const subInterface = baseInterface.createSubInterface(Number.parseInt(vlanId, 10));
    subInterface.configureDot1Q(Number.parseInt(vlanId, 10));
    if (ipAddress && subnetMask) {
      subInterface.configureIPv4(ipAddress, subnetMask);
    }
    return subInterface;
  };

  device.configureSwitchSvi = function(vlanId, ipAddress, subnetMask) {
    const normalizedVlanId = Number.parseInt(vlanId, 10);
    if (!Number.isInteger(normalizedVlanId) || normalizedVlanId <= 0 || normalizedVlanId > 4094) {
      throw new Error(`[${this.hostname}] Invalid VLAN ID ${vlanId}`);
    }

    if (!this.vlanManager.database.has(normalizedVlanId)) {
      this.vlanManager.addVlan(normalizedVlanId);
    }

    if (!this.switchVirtualInterfaces) {
      this.switchVirtualInterfaces = new Map();
    }

    const sviName = `Vlan${normalizedVlanId}`;
    let svi = this.switchVirtualInterfaces.get(normalizedVlanId) || this.getInterfaceByName(sviName);

    if (!svi) {
      svi = new Interface({
        id: `${this.id}::${sviName}::intf`,
        name: sviName,
        macAddress: this.interfaces[0]?.macAddress || '00:00:00:00:00:00',
      });
      this.addInterface(svi);
      this.switchVirtualInterfaces.set(normalizedVlanId, svi);
    }

    if (ipAddress && subnetMask) {
      svi.configureIPv4(ipAddress, subnetMask);
    }

    svi.setAccessVlan(normalizedVlanId);
    this.ipRoutingEnabled = true;
    return svi;
  };

  device.enableIpRouting = function(enabled = true) {
    this.ipRoutingEnabled = Boolean(enabled);
    return this.ipRoutingEnabled;
  };

  // NEW: UI helper to display VLAN assignments (Cisco: show vlan brief)
  device.showVlanBrief = function() {
    const db = this.vlanManager.getDatabase();
    return db.map(vlan => {
       const ports = [];
       // Find all access ports assigned to this VLAN
       for(const [portId, vId] of this.vlanManager.accessVlans.entries()) {
           if(vId === vlan.id && this.vlanManager.portModes.get(portId) !== 'trunk') {
               const portName = portId.split('::')[1] || portId; // Extract friendly name
               ports.push(portName);
           }
       }
       const trunkPorts = [];
       for (const [portId, config] of this.vlanManager.trunkConfigs.entries()) {
         const allowed = config.allowedVlans ? [...config.allowedVlans] : null;
         if (!allowed || allowed.includes(vlan.id)) {
           trunkPorts.push(portId.split('::')[1] || portId);
         }
       }
       return { ...vlan, ports, trunkPorts };
    });
  };

  // =========================================================================
  // MARK INSTALLATION COMPLETE
  // =========================================================================

  device._switchInstalled = true;

  console.log(`[${device.hostname}] Switch behavior installed ✓`);

  return device;
}

/**
 * Check if a device has switch behavior installed.
 * @param {Device} device
 * @returns {boolean}
 */
export function isSwitch(device) {
  return device._switchInstalled === true;
}

/**
 * Uninstall switch behavior (cleanup).
 * @param {Device} device
 */
export function uninstallSwitchBehavior(device) {
  if (!device._switchInstalled) {
    return;
  }

  // Clear state
  if (device.engine && device.engine.macTable) {
    device.engine.macTable.flush();
  }

  // Remove added methods and components
  delete device.vlanManager;
  delete device.engine;
  delete device.showMacAddressTable;
  delete device.clearMacAddressTable;
  delete device.configureAccessPort;
  delete device.configureTrunkPort;
  delete device.configureNativeVlan;
  delete device.configureAllowedVlans;
  delete device.configureRouterOnStick;
  delete device.configureSwitchSvi;
  delete device.enableIpRouting;
  delete device.switchVirtualInterfaces;
  delete device.ipRoutingEnabled;
  delete device.showVlanBrief;
  delete device._switchInstalled;

  console.log(`[${device.hostname}] Switch behavior uninstalled`);
}

export default {
  installSwitchBehavior,
  isSwitch,
  uninstallSwitchBehavior,
};