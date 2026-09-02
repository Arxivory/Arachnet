/**
 * PacketRouter.js
 * 
 * Determines the next hop for a packet in the network.
 * Coordinates between L2 switching and L3 routing logic.
 * 
 * Decision tree:
 *  1. Is destination MAC on this interface? (L2 direct delivery)
 *  2. Is device a switch? (L2 MAC table lookup)
 *  3. Is device a router? (L3 routing table lookup)
 *  4. Otherwise, flood (for L2) or drop (for L3)
 * 
 * Usage:
 *   const router = new PacketRouter(devices, links);
 *   const nextHop = router.findNextHop(packet, interface, device);
 *   if (nextHop) {
 *     // Forward packet
 *   }
 */

import { createEthernetFrame } from '../Packet.js';

export default class PacketRouter {
  /**
   * @param {Map<string, Device>} devices - All network devices
   * @param {Map<string, Link>} links     - All network links
   */
  constructor(devices, links) {
    this.devices = devices;
    this.links = links;
  }

  /**
   * Update devices map.
   */
  updateDevices(devices) {
    this.devices = devices;
  }

  /**
   * Update links map.
   */
  updateLinks(links) {
    this.links = links;
  }

  /**
   * Find the next hop for a packet.
   * 
   * @param {object} packet - Ethernet frame
   * @param {Interface} outInterface - Interface packet is being sent from
   * @param {Device} device - Device sending the packet
   * @returns {object | null} { nextDevice, nextInterface, viaLink } or null if no route
   */
  findNextHop(packet, outInterface, device) {
    if (!outInterface || !outInterface.physicalPort) {
      return null;
    }

    // Get the physical port and check for a link
    const physPort = outInterface.physicalPort;
    if (!physPort.link || physPort.link.status !== 'up') {
      return null;
    }

    const link = physPort.link;

    // Determine the receiving port (the other end of the link)
    const receivingPort = link.sourcePort === physPort ? link.targetPort : link.sourcePort;
    if (!receivingPort) return null;

    // Find the device that owns the receiving port
    const nextDevice = this._findDeviceByPortId(receivingPort.id);
    if (!nextDevice) return null;

    // Get the interface bound to that port
    const nextInterface = receivingPort.interface;
    if (!nextInterface) return null;

    return {
      nextDevice,
      nextInterface,
      viaLink: link,
    };
  }

  /**
   * Find a device by one of its port IDs.
   * Port IDs are formatted as "deviceId::portName"
   * 
   * @private
   */
  _findDeviceByPortId(portId) {
    if (!portId || !portId.includes('::')) return null;

    const deviceId = portId.split('::')[0];
    return this.devices.get(deviceId) || null;
  }

  /**
   * Determine if a packet should be flooded (L2 broadcast/unknown unicast).
   * Returns an array of interfaces to flood to.
   * 
   * @param {object} packet - Ethernet frame
   * @param {Interface} ingressInterface - Interface frame arrived on
   * @param {Device} device - Switch device
   * @returns {Interface[]} Interfaces to send copies to
   */
  getFloodInterfaces(packet, ingressInterface, device) {
    const floodInterfaces = [];

    // For L2 flooding, send to all ports except the ingress port
    if (device._interfaces) {
      for (const intf of device._interfaces.values()) {
        if (intf.id !== ingressInterface.id && intf.physicalPort && intf.physicalPort.link) {
          // Check VLAN membership if it's a switch
          if (device.vlanManager) {
            const vlanId = packet.vlanTag?.id || 1;
            if (device.vlanManager.isEgressAllowed(intf.physicalPort.id, vlanId)) {
              floodInterfaces.push(intf);
            }
          } else {
            floodInterfaces.push(intf);
          }
        }
      }
    }

    return floodInterfaces;
  }

  /**
   * Find the best route for a destination IP (L3 routing).
   * 
   * @param {string} destIP - Destination IP address
   * @param {Device} device - Router device
   * @returns {object | null} Route object or null
   */
  findRouteForIP(destIP, device) {
    if (!device.routingTable) return null;
    
    const result = device.routingTable.lookup(destIP);
    return result.route || null;
  }

  /**
   * Get all interfaces of a device that are up.
   * 
   * @param {Device} device
   * @returns {Interface[]}
   */
  getActiveInterfaces(device) {
    if (!device._interfaces) return [];

    const active = [];
    for (const intf of device._interfaces.values()) {
      if (intf.lineStatus === 'up' && intf.physicalPort?.link?.status === 'up') {
        active.push(intf);
      }
    }
    return active;
  }

  /**
   * Get interface by name on a device.
   * 
   * @param {Device} device
   * @param {string} interfaceName - e.g., 'GigabitEthernet0/1'
   * @returns {Interface | null}
   */
  getInterfaceByName(device, interfaceName) {
    return device.getInterfaceByName(interfaceName) || null;
  }

  /**
   * Check if an interface is connected to another device.
   * 
   * @param {Interface} intf
   * @returns {object | null} { link, remoteDevice, remoteInterface } or null
   */
  getRemoteConnection(intf) {
    const port = intf.physicalPort;
    if (!port || !port.link || port.link.status !== 'up') {
      return null;
    }

    const link = port.link;
    const remotePort = link.sourcePort === port ? link.targetPort : link.sourcePort;
    if (!remotePort) return null;

    const remoteDevice = this._findDeviceByPortId(remotePort.id);
    const remoteInterface = remotePort.interface;

    if (!remoteDevice || !remoteInterface) return null;

    return {
      link,
      remoteDevice,
      remoteInterface,
    };
  }
}
