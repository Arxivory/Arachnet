(disregard this readme, this is only for implementation documentation)

# Layer 3 Routing Implementation

Complete Layer 3 (IP) routing implementation for the netarch network simulator, based on the PDF routing architecture guide.

## Architecture Overview

The routing system is organized around **four core concepts** from the PDF:

### A. Packet Processing Pipeline

The 6-step ingress → egress pipeline that every packet goes through:

1. **Ingress / MAC Match** — Is this frame for us?
2. **Decapsulation** — Extract IP packet from Ethernet frame
3. **Routing Lookup (LPM)** — Find best route using Longest Prefix Match
4. **TTL Handling** — Decrement TTL, check for zero
5. **Next-Hop Resolution (ARP)** — Resolve next-hop IP to MAC address
6. **Encapsulation + Forward** — Wrap in new Ethernet frame, transmit

**Files:**

- `RouterPipeline.js` — Pure logic for all 6 steps
- `RoutingTable.js` — Step 3 (LPM lookup)
- `ARPCache.js` — Step 5 (MAC resolution)
- `Router.js` — Behavior installer; calls RouterPipeline

### B. ARP System

Address Resolution Protocol — resolves IP addresses to MAC addresses.

**Features:**

- Cache storage with TTL (5 minutes default)
- Request/reply simulation
- Pending packet queue (hold packets while resolving)
- Timeout detection with retry logic

**Files:**

- `ARPCache.js` — Complete ARP implementation
- `PacketBuilder.js` — Constructs ARP frames

### C. Routing Table

Manages static and learned routes. Supports multiple protocols.

**Features:**

- Longest Prefix Match (LPM) lookup
- Static route management
- Auto-generated connected routes from interface IPs
- Per-route metrics (cost)
- Multi-protocol support (static, connected, RIP, OSPF)

**Files:**

- `RoutingTable.js` — Complete routing table implementation

### D. Routing Protocols

Static first, then distance-vector (RIP), then link-state (OSPF).

**Current Implementation:**

- **Static Routing** — Manual route entries via CLI commands
- **RIP v2** — Distance-vector, Bellman-Ford, hop-count metric (1-15)
- **OSPF** — (Planned) Link-state, Dijkstra, area-based

**Files:**

- `RoutingTable.js` — Static routing storage & lookup
- `RIPEngine.js` — RIP protocol implementation
- `OSPFEngine.js` — OSPF protocol implementation

## Core Components

### 1. Packet Schema (`Packet.js`)

Defines the two-layer packet structure:

```javascript
// Layer 2 - Ethernet Frame
{
  srcMAC: '00:1a:2b:3c:4d:5e',
  dstMAC: 'FF:FF:FF:FF:FF:FF',
  etherType: 0x0800,              // 0x0800=IPv4, 0x0806=ARP
  vlanTag: null,                  // Optional 802.1Q
  payload: <IPPacket>
}

// Layer 3 - IP Packet
{
  srcIP: '192.168.1.10',
  dstIP: '10.0.0.5',
  ttl: 64,
  protocol: 'icmp',               // 'icmp', 'tcp', 'udp', etc.
  payload: <L4Data>
}
```

### 2. Router Behavior (`Router.js`)

Uses the **behavior/mixin pattern** to avoid subclassing Device.

```javascript
import { installRouterBehavior } from "./routing/Router.js";

const device = DeviceFactory.create("router-1941");
if (device.type === "router") {
  installRouterBehavior(device); // Adds routing logic
}
```

After installation, the device gains:

- `device.routingTable` — Manage routes
- `device.arpCache` — Manage MAC resolution
- `device.icmp` — Handle ICMP (ping)
- `device.onPacketReceived()` — Process packets through 6-step pipeline

### 3. Routing Table (`RoutingTable.js`)

LPM lookup with multi-protocol support.

```javascript
// Add a static route
device.addStaticRoute({
  destination: "10.0.0.0",
  mask: "255.255.255.0",
  nextHop: "192.168.1.254",
  metric: 1,
});

// Lookup
const result = device.routingTable.lookup("10.0.0.5");
// → { route: {...}, reason: 'routed' }

// Display
console.log(device.showIPRoute());
```

### 4. ARP Cache (`ARPCache.js`)

Resolve IP → MAC with caching and timeout.

```javascript
// Direct lookup (cache hit)
const mac = device.arpCache.lookup("192.168.1.254");

// Resolution with pending queue
device.arpCache.resolve(
  "192.168.1.254",
  packet,
  (resolvedMAC) => {
    // Success - forward packet
  },
  () => {
    // Failed - drop packet
  },
);
```

### 5. ICMP Handler (`ICMPHandler.js`)

Ping and error messages.

```javascript
// Respond to ping
device.icmp.handleEchoRequest(icmpPacket, ipPacket, frame, interface_);

// Send ping
await device.ping("10.0.0.5", 4); // 4 pings

// Send error (TTL exceeded, unreachable)
device.icmp.sendTTLExceeded(ipPacket, interface_, frame);
device.icmp.sendDestinationUnreachable(ipPacket, interface_, frame);

// Statistics
console.log(device.showICMPStats());
```

### 6. Simulation Bus (`SimulationBus.js`)

Discrete event queue for timed events (ARP timeouts, RIP updates).

```javascript
const bus = new SimulationBus();

// Schedule an event 5 seconds from now
bus.schedule(5000, "my-event", (event) => {
  console.log("Event fired!");
});

// Recurring events
bus.schedule(
  30000,
  "rip-update",
  updateHandler,
  {},
  {
    recurring: true,
    interval: 30000,
  },
);

// Control
bus.start(); // Start simulation
bus.pause(); // Pause (can resume)
bus.step(); // Execute one event
bus.stop(); // Stop completely
```

### 7. RIP Engine (`RIPEngine.js`)

Distance-vector routing protocol.

```javascript
const rip = new RIPEngine(device, simulationBus);

// Enable RIP on this router
rip.enable(); // Starts 30-second periodic updates

// Receive RIP update from neighbor
rip.onRIPUpdate(ripMessage, ipPacket, ingressInterface);

// Display
console.log(rip.showDatabase()); // Learned routes
console.log(rip.showNeighbors()); // Active neighbors
console.log(rip.showStats()); // Statistics
```

### 8. OSPF Engine (`OSPFEngine.js`)

Link-state routing protocol with faster convergence than RIP.

**Key Features:**
- Hello protocol for neighbor discovery (10-second Hello interval, 40-second dead timer)
- Link State Database (LSDB) with LSA flooding
- Dijkstra SPF computation for optimal path calculation
- Single area support (Area 0 / backbone)
- Link metrics based on bandwidth (1 Gbps = 1 cost unit)
- Fast convergence on topology changes (1-second SPF delay)
- Neighbor state machine (init → two-way → full)
- Statistics tracking and diagnostic commands

```javascript
const ospf = new OSPFEngine(device, simulationBus);

// Enable OSPF on this router
ospf.enable(); // Starts 10-second Hello interval

// Handle received Hello packet from neighbor
ospf.onHelloReceived(helloPacket, ipPacket, ingressInterface);

// Handle received Link State Advertisement
ospf.onLSAReceived(lsa, ingressInterface);

// Display
console.log(ospf.showNeighbors()); // Neighbor states (init, two-way, full)
console.log(ospf.showDatabase()); // Link State Database
console.log(ospf.showRoutes()); // Computed routes via SPF
console.log(ospf.showStats()); // Protocol statistics
```

**OSPF vs RIP:**
| Feature | RIP | OSPF |
|---------|-----|------|
| Algorithm | Bellman-Ford (distance-vector) | Dijkstra (link-state) |
| Update Interval | 30 seconds | 10 seconds (Hello), event-triggered LSA |
| Convergence | Slow (can take minutes) | Fast (seconds) |
| Max Hop Count | 15 | Unlimited |
| Scalability | Small networks | Large enterprise networks |
| Metric | Simple hop count | Bandwidth-based cost |
| Memory Usage | Low | High (maintains full topology) |

## Usage Workflow

### 1. Create a Router Device

```javascript
import DeviceFactory from "./data/DeviceFactory.js";
import { installRouterBehavior } from "./core/network/routing/Router.js";

const router = DeviceFactory.create("router-1941", { x: 0, y: 0, z: 0 });

if (router.type === "router") {
  installRouterBehavior(router);
}
```

### 2. Configure Interfaces

```javascript
// Configure IP on an interface
router
  .getInterfaceByName("GigabitEthernet0/0")
  .configureIPv4("192.168.1.1", "255.255.255.0");
router
  .getInterfaceByName("GigabitEthernet0/1")
  .configureIPv4("10.0.0.1", "255.255.0.0");
```

### 3. Add Static Routes

```javascript
router.addStaticRoute({
  destination: "172.16.0.0",
  mask: "255.255.0.0",
  nextHop: "10.0.0.254",
});
```

### 4. Send Packets

Packets arriving at interfaces are automatically processed through the 6-step pipeline:

```javascript
interface.receivePacket(ethernetFrame);
// → Triggers device.onPacketReceived(frame, interface)
// → Calls RouterPipeline.process(frame, interface, device)
// → Packet forwarded or dropped based on routing table
```

### 5. Monitor & Debug

```javascript
// View routing table
console.log(router.showIPRoute());

// View ARP cache
console.log(router.showARP());

// View ICMP stats
console.log(router.showICMPStats());

// Ping a destination
await router.ping("10.0.0.5", 4);
```

## Integration Points

### With DeviceFactory

No changes needed! The factory creates devices with `type: 'router'`. The behavior installer detects this and attaches routing logic.

### With Link/Interface

- `Interface.receivePacket()` calls `device.onPacketReceived()` (already implemented)
- After installing router behavior, this triggers the full 6-step pipeline
- No changes to Link or Interface code

### With NetworkStore

- Add routers to the network via the normal device creation flow
- Call `installRouterBehavior()` after adding to store (if type is 'router')

### With SimulationBus (future)

- Replace ad-hoc setTimeout calls in Link with SimulationBus events
- Integrate ARP timeouts into SimulationBus
- Tie RIP/OSPF periodic updates to SimulationBus clock
- Enable pause/replay of entire simulation

## Cisco-Style Commands

The router supports Cisco IOS-like commands:

```javascript
// Configuration
router.addStaticRoute({ destination, mask, nextHop, metric });
router.removeStaticRoute(destination, mask);

// Enable routing protocol (RIP or OSPF, auto-creates SimulationBus)
router.enableRoutingProtocol("rip");   // Distance-vector routing
router.enableRoutingProtocol("ospf");  // Link-state routing

router.disableRoutingProtocol("rip");
router.disableRoutingProtocol("ospf");

// Diagnostics
router.showIPRoute(); // show ip route
router.showARP(); // show arp
router.showICMPStats(); // show icmp statistics
router.ping(destIP, count); // ping

// Protocol-specific
router.rip.showDatabase(); // show ip rip database
router.rip.showNeighbors(); // show ip rip neighbor
```

## Build Order (Recommended)

This is the order used in the implementation:

1. ✅ **Packet Schema** (`Packet.js`) — Foundation for everything
2. ✅ **RoutingTable** (`RoutingTable.js`) — Core lookup logic
3. ✅ **ARPCache** (`ARPCache.js`) — MAC resolution
4. ✅ **PacketBuilder** (`PacketBuilder.js`) — Frame construction
5. ✅ **ICMPHandler** (`ICMPHandler.js`) — Ping & error messages
6. ✅ **RouterPipeline** (`RouterPipeline.js`) — 6-step processing
7. ✅ **Router** (`Router.js`) — Behavior installer
8. ✅ **SimulationBus** (`SimulationBus.js`) — Timed events
9. ✅ **RIPEngine** (`RIPEngine.js`) — Distance-vector routing
10. ✅ **OSPFEngine** (`OSPFEngine.js`) — Link-state routing
11. ⏳ **BGP** (`BGPEngine.js` future) — Exterior gateway protocol

## Files Reference

| File                | Purpose                                 | Lines |
| ------------------- | --------------------------------------- | ----- |
| `Packet.js`         | Packet schema (Ethernet, IP, ARP, ICMP) | ~200  |
| `RoutingTable.js`   | Route storage & LPM lookup              | ~300  |
| `ARPCache.js`       | ARP cache & resolution                  | ~350  |
| `PacketBuilder.js`  | Frame construction helpers              | ~200  |
| `ICMPHandler.js`    | ICMP echo/error messages                | ~250  |
| `RouterPipeline.js` | 6-step packet processing                | ~250  |
| `Router.js`         | Behavior installer                      | ~200  |
| `SimulationBus.js`  | Discrete event queue                    | ~350  |
| `RIPEngine.js`      | RIP v2 routing protocol                 | ~350  |
| `OSPFEngine.js`     | OSPF v2 routing protocol                | ~400  |
| `index.js`          | Module exports                          | ~40   |

## Testing

### Manual Testing

```javascript
// Create two routers
const r1 = DeviceFactory.create("router-1941", { x: 0, y: 0 });
const r2 = DeviceFactory.create("router-1941", { x: 10, y: 0 });

// Install router behavior
installRouterBehavior(r1);
installRouterBehavior(r2);

// Configure IPs
r1.getInterfaceByName("Gi0/0").configureIPv4("192.168.1.1", "255.255.255.0");
r2.getInterfaceByName("Gi0/0").configureIPv4("192.168.1.2", "255.255.255.0");

// Add static routes (for now)
r1.addStaticRoute({
  destination: "10.0.0.0",
  mask: "255.255.0.0",
  nextHop: "192.168.1.2",
  metric: 1,
});
r2.addStaticRoute({
  destination: "172.16.0.0",
  mask: "255.255.0.0",
  nextHop: "192.168.1.1",
  metric: 1,
});

// Create a packet and send
const frame = PacketBuilder.buildIPFrame(
  "00:1a:2b:3c:4d:5e",
  "FF:FF:FF:FF:FF:FF",
  "192.168.1.100",
  "10.0.0.5",
  "icmp",
);

r1.getInterfaceByName("Gi0/0").receivePacket(frame);
```

### Automated Tests

(To be implemented in `__tests__/routing/`)

## Future Enhancements

1. **OSPF** — Link-state routing with area support
2. **BGP** — Border Gateway Protocol for AS routing
3. **VLAN Routing** — Inter-VLAN routing (Router-on-a-Stick)
4. **ACLs** — Access Control Lists (packet filtering)
5. **NAT** — Network Address Translation
6. **QoS** — Quality of Service (prioritization)
7. **VRF** — Virtual Routing & Forwarding (multi-tenancy)
8. **Monitoring** — Real-time packet visualization, flow diagrams

## References

- PDF: "Routing Layer 3 Router Implementation Guide"
- Cisco IOS Command Reference
- RFC 2453 (RIP v2)
- RFC 2328 (OSPF)
- IEEE 802.3 (Ethernet)

---

**Implementation Date:** May 2026  
**Status:** Alpha (static routing & basic ICMP working, RIP tested)
