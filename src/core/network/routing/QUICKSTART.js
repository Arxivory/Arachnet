/**
 * QUICK START GUIDE: Layer 3 Routing
 * 
 * This file shows you exactly how to integrate the routing system
 * into your application code.
 */

// ============================================================================
// 1. IMPORT THE ROUTING SYSTEM
// ============================================================================

import { installRouterBehavior } from './Router.js';
import SimulationBus from './SimulationBus.js';
import PacketBuilder from './PacketBuilder.js';
import { createEthernetFrame, createIPPacket } from '../Packet.js';
import DeviceFactory from '../../../data/DeviceFactory.js';
import RIPEngine from './RIPEngine.js';
// ============================================================================
// 2. CREATE & INITIALIZE ROUTERS
// ============================================================================

function setupRouter(catalogId, position, hostname) {
  // Create device using existing factory
  const device = DeviceFactory.create(catalogId, position);
  device.hostname = hostname;
  
  // Attach router behavior (this is the magic line!)
  if (device.type === 'router') {
    installRouterBehavior(device);
    return device;
  }
  
  throw new Error(`Device ${catalogId} is not a router`);
}

// Create two routers
const router1 = setupRouter('1941', { x: 0, y: 0 }, 'R1');
const router2 = setupRouter('1941', { x: 10, y: 0 }, 'R2');


// ============================================================================
// 3. CONFIGURE INTERFACES WITH IP ADDRESSES
// ============================================================================

// Router 1: GigabitEthernet0/0 - 192.168.1.1/24
router1.getInterfaceByName('GigabitEthernet0/0')
  .configureIPv4('192.168.1.1', '255.255.255.0');

// Router 1: GigabitEthernet0/1 - 10.0.0.1/24
router1.getInterfaceByName('GigabitEthernet0/1')
  .configureIPv4('10.0.0.1', '255.255.255.0');

// Router 2: GigabitEthernet0/0 - 192.168.1.2/24
router2.getInterfaceByName('GigabitEthernet0/0')
  .configureIPv4('192.168.1.2', '255.255.255.0');

// Router 2: GigabitEthernet0/1 - 172.16.0.1/24
router2.getInterfaceByName('GigabitEthernet0/1')
  .configureIPv4('172.16.0.1', '255.255.255.0');


// ============================================================================
// 4. CONFIGURE STATIC ROUTES
// ============================================================================

// R1 knows how to reach 172.16.0.0/24 via R2 (192.168.1.2)
router1.addStaticRoute({
  destination: '172.16.0.0',
  mask: '255.255.255.0',
  nextHop: '192.168.1.2',
  metric: 1,
});

// R2 knows how to reach 10.0.0.0/24 via R1 (192.168.1.1)
router2.addStaticRoute({
  destination: '10.0.0.0',
  mask: '255.255.255.0',
  nextHop: '192.168.1.1',
  metric: 1,
});

// Display routing tables
console.log(router1.showIPRoute());
console.log(router2.showIPRoute());


// ============================================================================
// 5. SEND PACKETS (via interface.receivePacket)
// ============================================================================

// Create a packet from 10.0.0.100 to 172.16.0.50
const frame = PacketBuilder.buildIPFrame(
  '00:1a:2b:3c:4d:5e',      // Source MAC (PC)
  'FF:FF:FF:FF:FF:FF',        // Destination MAC (broadcast initially)
  '10.0.0.100',               // Source IP
  '172.16.0.50',              // Destination IP
  'icmp',                     // Protocol
  64                          // TTL
);

// Send to R1's interface
router1.getInterfaceByName('GigabitEthernet0/1').receivePacket(frame);

// The packet will:
// 1. Arrive at R1's Gi0/1 interface
// 2. Trigger router1.onPacketReceived(frame, interface)
// 3. Pass through the 6-step RouterPipeline:
//    - Step 1: Check MAC (ours? yes)
//    - Step 2: Extract IP packet
//    - Step 3: LPM lookup → find route to 172.16.0.0/24 via 192.168.1.2
//    - Step 4: Decrement TTL (64 → 63)
//    - Step 5: ARP lookup for 192.168.1.2
//    - Step 6: Forward out Gi0/0 to R2
// 4. R2 receives it on Gi0/0
// 5. R2 routes it to 172.16.0.50 out Gi0/1


// ============================================================================
// 6. TEST PING
// ============================================================================

async function testPing() {
  // Note: This requires ARP to resolve and packet delivery to work
  // For now, just shows the capability
  
  const result = await router1.ping('172.16.0.50', 4);
  console.log('Ping results:', result);
}


// ============================================================================
// 7. ENABLE ROUTING PROTOCOLS (RIP vs OSPF)
// ============================================================================

// Create simulation bus for timed events
const simBus = new SimulationBus();

// ─────────────────────────────────────────────────────────────────────────
// OPTION A: Use RIP (distance-vector, simpler)
// ─────────────────────────────────────────────────────────────────────────

// Create RIP engines for both routers
const rip1 = new RIPEngine(router1, simBus);
const rip2 = new RIPEngine(router2, simBus);

// Enable RIP (or use device.enableRoutingProtocol('rip'))
rip1.enable();   // Starts periodic 30-second updates
rip2.enable();

// View RIP database and neighbors
console.log(rip1.showDatabase());
console.log(rip1.showNeighbors());
console.log(rip1.showStats());

// ─────────────────────────────────────────────────────────────────────────
// OPTION B: Use OSPF (link-state, faster convergence)
// ─────────────────────────────────────────────────────────────────────────

// Create OSPF engines for both routers
// const ospf1 = new OSPFEngine(router1, simBus, { 
//   routerId: '1.1.1.1',
//   area: '0.0.0.0'  // Backbone area
// });
// const ospf2 = new OSPFEngine(router2, simBus, {
//   routerId: '2.2.2.2',
//   area: '0.0.0.0'
// });

// Enable OSPF (or use device.enableRoutingProtocol('ospf', config))
// ospf1.enable();
// ospf2.enable();

// View OSPF database and neighbors
// console.log(ospf1.showNeighbors());
// console.log(ospf1.showDatabase());
// console.log(ospf1.showRoutes());
// console.log(ospf1.showStats());

// ─────────────────────────────────────────────────────────────────────────
// EASIER: Use device.enableRoutingProtocol() method
// ─────────────────────────────────────────────────────────────────────────

// Enable RIP on a router
// router1.enableRoutingProtocol('rip');
// router2.enableRoutingProtocol('rip');

// Or enable OSPF
router1.enableRoutingProtocol('ospf', { routerId: '1.1.1.1' });
router2.enableRoutingProtocol('ospf', { routerId: '2.2.2.2' });

// Manually trigger events (for testing)
// simBus.step();  // Execute one event
// simBus.step();
// simBus.step();
// etc.

// Or run simulation automatically
simBus.start();  // Start event loop (processes events from queue)


// ============================================================================
// 8. MONITOR & DEBUG
// ============================================================================

// View routing table
console.log('R1 Routing Table:');
console.log(router1.showIPRoute());

// View ARP cache
console.log('R1 ARP Cache:');
console.log(router1.showARP());

// View ICMP statistics
console.log('R1 ICMP Stats:');
console.log(router1.showICMPStats());

// View RIP database (if RIP is enabled)
if (rip1) {
  console.log('R1 RIP Database:');
  console.log(rip1.showDatabase());
  
  console.log('R1 RIP Neighbors:');
  console.log(rip1.showNeighbors());
  
  console.log('R1 RIP Stats:');
  console.log(rip1.showStats());
}


// ============================================================================
// 9. INTEGRATION WITH UI (RoutingModal example)
// ============================================================================

// From your RoutingModal.jsx, when user hits "Apply":
export function applyRoutingConfig(device, routingConfig) {
  if (!device || device.type !== 'router') {
    console.error('Device is not a router');
    return;
  }
  
  // Make sure router behavior is installed
  if (!device.routingTable) {
    installRouterBehavior(device);
  }
  
  // Apply static routes from modal
  if (routingConfig.staticRoutes) {
    routingConfig.staticRoutes.forEach(route => {
      device.addStaticRoute({
        destination: route.destination,
        mask: route.subnetMask,
        nextHop: route.nextHop,
        metric: route.metric || 1,
      });
    });
  }
  
  // Enable routing protocol if selected
  if (routingConfig.protocol === 'RIP') {
    if (!device.rip) {
      const simBus = new SimulationBus();
      device.rip = new RIPEngine(device, simBus);
    }
    device.rip.enable();
  } else if (routingConfig.protocol === 'OSPF') {
    // TODO: Implement OSPFEngine
    console.log('OSPF not yet implemented');
  }
  
  console.log(`[${device.hostname}] Routing configuration applied`);
}


// ============================================================================
// 10. COMPLETE EXAMPLE FLOW
// ============================================================================

/*

// Step 1: Create routers
const r1 = setupRouter('router-1941', { x: 0, y: 0 }, 'Router1');
const r2 = setupRouter('router-2960', { x: 10, y: 0 }, 'Router2');

// Step 2: Configure IPs
r1.getInterfaceByName('Gi0/0').configureIPv4('192.168.1.1', '255.255.255.0');
r1.getInterfaceByName('Gi0/1').configureIPv4('10.0.0.1', '255.255.255.0');
r2.getInterfaceByName('Gi0/0').configureIPv4('192.168.1.2', '255.255.255.0');
r2.getInterfaceByName('Gi0/1').configureIPv4('172.16.0.1', '255.255.255.0');

// Step 3: Add routes
r1.addStaticRoute({ destination: '172.16.0.0', mask: '255.255.255.0', nextHop: '192.168.1.2' });
r2.addStaticRoute({ destination: '10.0.0.0', mask: '255.255.255.0', nextHop: '192.168.1.1' });

// Step 4: Connect physical links (already done in your network)

// Step 5: Send a packet
const packet = PacketBuilder.buildIPFrame(
  '00:1a:2b:3c:4d:5e',
  'FF:FF:FF:FF:FF:FF',
  '10.0.0.100',
  '172.16.0.50',
  'icmp',
  64
);
r1.getInterfaceByName('Gi0/1').receivePacket(packet);

// Step 6: Packet flows through routing pipeline and reaches R2!

*/

export default {
  setupRouter,
  applyRoutingConfig,
};
