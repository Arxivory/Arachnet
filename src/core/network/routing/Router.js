/**
 * Router.js
 * 
 * Behavior installer for routers.
 * Attaches routing logic to a Device instance at runtime.
 * 
 * Pattern: Behavior/Mixin rather than subclassing.
 * This avoids coupling DeviceFactory to router-specific logic.
 * 
 * Usage:
 *   const device = DeviceFactory.create('router-1941');
 *   if (device.type === 'router') {
 *     installRouterBehavior(device);
 *   }
 */

import RoutingTable from './RoutingTable.js';
import ARPCache from './ARPCache.js';
import ICMPHandler from './ICMPHandler.js';
import RouterPipeline from './RouterPipeline.js';
import RIPEngine from './RIPEngine.js';
import OSPFEngine from './OSPFEngine.js';
import SimulationBus from './SimulationBus.js';

/**
 * Install router behavior on a Device instance.
 * After calling this, the device will:
 *  - Have routing table management
 *  - Support packet forwarding
 *  - Handle ARP requests/replies
 *  - Respond to ICMP (ping)
 * 
 * @param {Device} device - The device to upgrade to a router
 * @returns {Device} The same device, now with routing behavior
 */
export function installRouterBehavior(device) {
  // Prevent double-installation
  if (device._routerInstalled) {
    console.warn(`[${device.hostname}] Router behavior already installed`);
    return device;
  }

  // =========================================================================
  // INSTALL ROUTING COMPONENTS
  // =========================================================================

  device.routingTable = new RoutingTable(device);
  device.arpCache = new ARPCache(device);
  device.icmp = new ICMPHandler(device);

  // Wire up the ICMP handler to actually transmit packets
  device.icmp.onSendICMP((frame, egressInterface) => {
    if (egressInterface._engine) {
      egressInterface._engine.transmitPacket(frame, egressInterface);
    } else if (egressInterface.physicalPort?.link) {
      egressInterface.physicalPort.link.transmitPacket(frame, egressInterface.physicalPort);
    }
  });

  // =========================================================================
  // OVERRIDE PACKET HANDLING
  // =========================================================================

  /**
   * Main packet receiving hook.
   * Called whenever an interface receives a packet.
   */
  device.onPacketReceived = function(packet, ingressInterface) {
    // Route the packet through the pipeline
    RouterPipeline.process(packet, ingressInterface, this);
  };

  // =========================================================================
  // INTERFACE STATUS CHANGES
  // =========================================================================

  /**
   * Called when an interface comes up or goes down.
   * Updates connected routes in the routing table.
   */
  const originalOnInterfaceStatusChange = device.onInterfaceStatusChange;
  device.onInterfaceStatusChange = function(iface, newStatus, prevStatus) {
    // Call original if it exists
    if (originalOnInterfaceStatusChange) {
      originalOnInterfaceStatusChange.call(this, iface, newStatus, prevStatus);
    }

    // Update routing table for connected routes
    device.routingTable.updateConnectedRoute(iface);

    console.log(
      `[${device.hostname}] Interface ${iface.name}: ${prevStatus} → ${newStatus} ` +
      `(routing table updated)`
    );
  };

  // =========================================================================
  // MANAGEMENT COMMANDS
  // =========================================================================

  /**
   * Add a static route.
   * @param {object} routeConfig
   * @param {string} routeConfig.destination - Network address (e.g., '10.0.0.0')
   * @param {string} routeConfig.mask - Subnet mask (e.g., '255.255.255.0')
   * @param {string} routeConfig.nextHop - Next hop IP
   * @param {string} [routeConfig.egressInterface] - Interface name (optional)
   * @param {number} [routeConfig.metric] - Route cost (default: 1)
   */
  device.addStaticRoute = function(routeConfig) {
    const route = {
      destination: routeConfig.destination,
      mask: routeConfig.mask,
      nextHop: routeConfig.nextHop,
      egressInterface: routeConfig.egressInterface || this.interfaces[0]?.name || 'unknown',
      metric: routeConfig.metric || 1,
      protocol: 'static',
      active: true,
    };

    this.routingTable.addRoute(route);

    console.log(
      `[${this.hostname}] Static route added: ` +
      `${route.destination}/${route.mask} via ${route.nextHop}`
    );
  };

  /**
   * Remove a static route.
   * @param {string} destination
   * @param {string} mask
   * @param {string} [nextHop]
   */
  device.removeStaticRoute = function(destination, mask, nextHop = null) {
    const removed = this.routingTable.removeRoute(destination, mask, nextHop);
    if (removed) {
      console.log(
        `[${this.hostname}] Static route removed: ${destination}/${mask}`
      );
    } else {
      console.warn(
        `[${this.hostname}] No static route found: ${destination}/${mask}`
      );
    }
  };

  /**
   * Display routing table (Cisco-style `show ip route`).
   */
  device.showIPRoute = function() {
    return this.routingTable.showRoutes();
  };

  /**
   * Display ARP table (Cisco-style `show arp`).
   */
  device.showARP = function() {
    return this.arpCache.showCache();
  };

  /**
   * Display ICMP statistics (Cisco-style `show icmp statistics`).
   */
  device.showICMPStats = function() {
    return this.icmp.showStats();
  };

  /**
   * Send a ping to another device.
   * @param {string} destIP - Destination IP
   * @param {number} [count] - Number of pings
   */
  device.ping = async function(destIP, count = 4) {
    // Find a local interface with an IP address
    const localInterface = this.interfaces.find(i => i.ipv4);
    if (!localInterface) {
      throw new Error(`[${this.hostname}] No interface with IP configuration`);
    }

    console.log(`[${this.hostname}] Pinging ${destIP} from ${localInterface.ipv4.address}...`);

    return this.icmp.ping(localInterface.ipv4.address, destIP, count);
  };

  /**
   * Enable routing protocol.
   * @param {string} protocol - 'rip' | 'ospf'
   * @param {object} config - Protocol-specific config
   */
  device.enableRoutingProtocol = function(protocol, config = {}) {
    protocol = protocol.toLowerCase();

    if (protocol === 'rip') {
      if (device.rip) {
        console.warn(`[${this.hostname}] RIP already enabled`);
        return;
      }

      // Create simulation bus if not exists
      if (!device._simBus) {
        device._simBus = new SimulationBus();
      }

      device.rip = new RIPEngine(this, device._simBus);
      device.rip.enable();
      console.log(`[${this.hostname}] RIP routing protocol enabled`);

    } else if (protocol === 'ospf') {
      if (device.ospf) {
        console.warn(`[${this.hostname}] OSPF already enabled`);
        return;
      }

      // Create simulation bus if not exists
      if (!device._simBus) {
        device._simBus = new SimulationBus();
      }

      device.ospf = new OSPFEngine(this, device._simBus, config);
      device.ospf.enable();
      console.log(`[${this.hostname}] OSPF routing protocol enabled`);

    } else {
      console.error(`[${this.hostname}] Unknown routing protocol: ${protocol}`);
    }
  };

  /**
   * Disable routing protocol.
   * @param {string} protocol - 'rip' | 'ospf'
   */
  device.disableRoutingProtocol = function(protocol) {
    protocol = protocol.toLowerCase();

    if (protocol === 'rip' && device.rip) {
      device.rip.disable();
      delete device.rip;
      console.log(`[${this.hostname}] RIP routing protocol disabled`);

    } else if (protocol === 'ospf' && device.ospf) {
      device.ospf.disable();
      delete device.ospf;
      console.log(`[${this.hostname}] OSPF routing protocol disabled`);

    } else {
      console.warn(`[${this.hostname}] Routing protocol ${protocol} not enabled`);
    }
  };

  // =========================================================================
  // MARK INSTALLATION COMPLETE
  // =========================================================================

  device._routerInstalled = true;

  console.log(`[${device.hostname}] Router behavior installed ✓`);

  return device;
}

/**
 * Check if a device has router behavior installed.
 * @param {Device} device
 * @returns {boolean}
 */
export function isRouter(device) {
  return device._routerInstalled === true;
}

/**
 * Uninstall router behavior (cleanup).
 * @param {Device} device
 */
export function uninstallRouterBehavior(device) {
  if (!device._routerInstalled) {
    return;
  }

  // Clear state
  if (device.routingTable) device.routingTable.flush();
  if (device.arpCache) device.arpCache.flush();
  if (device.icmp) device.icmp.resetStats();

  // Remove added methods
  delete device.routingTable;
  delete device.arpCache;
  delete device.icmp;
  delete device.addStaticRoute;
  delete device.removeStaticRoute;
  delete device.showIPRoute;
  delete device.showARP;
  delete device.showICMPStats;
  delete device.ping;
  delete device.enableRoutingProtocol;
  delete device.disableRoutingProtocol;
  delete device._routerInstalled;

  console.log(`[${device.hostname}] Router behavior uninstalled`);
}

export default {
  installRouterBehavior,
  isRouter,
  uninstallRouterBehavior,
};
