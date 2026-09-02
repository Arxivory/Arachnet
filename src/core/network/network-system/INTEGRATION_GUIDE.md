# Network System Integration Guide

## Overview

The unified network system connects Layer 1 (physical cables), Layer 2 (switching), and Layer 3 (routing) into a cohesive, functional network simulation. Packets flow automatically through devices using real switching and routing logic.

## Architecture

### Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│             NetworkIntegrationEngine                         │
│  (Central coordinator - orchestrates entire packet flow)     │
└──────────┬────────────────────────────────────┬──────────────┘
           │                                    │
           ▼                                    ▼
    ┌─────────────────┐              ┌──────────────────┐
    │ LinkSimulator   │              │ PacketRouter     │
    │ (L1 Simulation) │              │ (Decision Logic) │
    │ - Latency       │              │ - Find next hop  │
    │ - Packet loss   │              │ - Route lookup   │
    └─────────────────┘              └──────────────────┘
           ▲                                    ▲
           │                                    │
    Uses: NetworkSimulationClock       Works with:
                                       - Switching Engine
                                       - Routing Table
                                       - VLAN Manager
```

### Data Flow

1. **Packet Origin**: Application or device sends packet from interface
2. **Transmission**: `engine.transmitPacket(packet, interface)` called
3. **Routing Decision**: `PacketRouter.findNextHop()` determines where packet goes
4. **Link Simulation**: `LinkSimulator.scheduleTransmission()` with latency/loss
5. **Delivery**: After delay, `engine.deliverPacket()` called on destination
6. **Processing**: Device's L2/L3 handlers process received packet
7. **Forwarding**: If packet should forward, repeat from step 2

## Components

### NetworkIntegrationEngine

**Purpose**: Central orchestrator

- Maintains device and link registries
- Coordinates packet flow through network
- Tracks in-flight packets and statistics
- Wires device packet handlers

**Key Methods**:

- `start()` / `stop()` - Control simulation
- `transmitPacket(packet, interface)` - Send packet
- `deliverPacket(packet, interface)` - Receive packet
- `addDevice(device)` / `removeDevice(deviceId)` - Dynamic network changes
- `addLink(link)` / `removeLink(linkId)` - Cable changes
- `getStats()` - Network statistics

### LinkSimulator

**Purpose**: Simulates physical layer transmission

- Adds configurable latency (propagation delay)
- Randomly drops packets based on loss percentage
- Schedules deliveries with precision timing
- Uses NetworkSimulationClock for accurate timing

**Key Methods**:

- `scheduleTransmission(id, packet, link, src, dst)` - Queue packet for transmission
- `getPendingDeliveries()` - View in-transit packets

### NetworkSimulationClock

**Purpose**: Manages simulation time

- Advances simulation time
- Supports real-time or accelerated modes
- Can run continuously or step-by-step

**Key Methods**:

- `start()` / `stop()` - Control time flow
- `now()` - Get current simulation time
- `advance(ms)` - Step forward (when stopped)
- `setTimeScale(scale)` - 1.0=real-time, 2.0=2x speed

### PacketRouter

**Purpose**: Makes packet forwarding decisions

- Implements L2 switching logic (MAC table lookup)
- Implements L3 routing logic (route table lookup)
- Finds physical path through network

**Key Methods**:

- `findNextHop(packet, interface, device)` - Determine next forwarding point
- `getFloodInterfaces(packet, interface, device)` - Get L2 broadcast/flood ports
- `findRouteForIP(destIP, device)` - L3 route lookup
- `getRemoteConnection(interface)` - Find device at other end of cable

### NetworkManager

**Purpose**: High-level API for application

- Initializes and manages the engine
- Provides packet generation APIs
- Emits network events
- Collects statistics

**Key Methods**:

- `initialize()` - Set up network simulation
- `start()` / `stop()` / `reset()` - Control simulation
- `sendPing(srcIP, dstIP)` - Send ICMP echo request
- `sendPacket(srcIP, dstIP, protocol, payload)` - Send generic packet
- `getNetworkStats()` - Get counters
- `addEventListener(type, callback)` - Subscribe to events

## Integration with Existing System

### Device Packet Reception

When a device receives a packet, the unified system ensures both L2 and L3 processing:

```javascript
// BEFORE: Device would only call its handler
device.onPacketReceived(packet, interface);

// AFTER: Integration engine wraps this with automatic forwarding
// 1. Call device's original handler (L2/L3 processing)
// 2. Check if packet should be forwarded
// 3. If yes, call engine.transmitPacket() again
```

### Physical Link Connection

When cables connect devices, they automatically participate in simulation:

```javascript
// Create cable connecting two ports
const link = new Link({
  sourcePort: port1,
  targetPort: port2,
  latencyMs: 1, // Network propagation delay
  packetLoss: 0.1, // 0.1% packet loss
});

// No special setup needed - integration engine automatically knows about this link
```

### Layer 2 Switching Integration

The switching engine processes packets and can forward them:

```javascript
// SwitchingEngine.processFrame() learns MAC and makes forwarding decision
// If forwarding needed, it calls device.onPacketForwarding()
// NetworkIntegrationEngine hooks this and transmits on the link
```

### Layer 3 Routing Integration

The routing engine determines next hop and interface:

```javascript
// RouterPipeline.process() finds route and determines egress interface
// It calls device.onPacketForwarding() with the packet and interface
// NetworkIntegrationEngine transmits on the link connected to that interface
```

## Usage Example

### Basic Setup

```javascript
import { NetworkManager } from "./network/network-system/index.js";

// Initialize
const manager = new NetworkManager(appState.network);
manager.initialize();

// Listen to events
manager.addEventListener("packetSent", (data) => {
  console.log(`Packet sent from ${data.srcIP} to ${data.dstIP}`);
});

manager.addEventListener("packetReceived", (data) => {
  console.log(`Packet received at ${data.destIP}`);
});

// Start simulation
manager.start();
```

### Sending Traffic

```javascript
// Send a ping (ICMP Echo Request)
manager.sendPing("192.168.1.10", "192.168.1.20");

// Send generic packet
manager.sendPacket("10.0.0.1", "10.0.0.2", "tcp", { payload: "data" });
```

### Monitoring

```javascript
// Get statistics
const stats = manager.getNetworkStats();
console.log(`Packets sent: ${stats.packetsSent}`);
console.log(`Packets received: ${stats.packetsReceived}`);
console.log(`Packets dropped: ${stats.packetsDropped}`);
console.log(`In-flight packets: ${stats.inFlightPackets}`);

// Check simulation state
manager.engine.logNetworkState();
```

## Packet Flow Examples

### Example 1: Simple Ping (Router-to-End-Device)

1. PC sends ICMP echo request to 192.168.1.1 (router interface)
2. `NetworkManager.sendPing()` creates packet
3. `engine.transmitPacket()` called on PC's interface
4. `PacketRouter.findNextHop()` finds link to router
5. `LinkSimulator.scheduleTransmission()` schedules 1ms delivery
6. After 1ms, packet arrives at router's interface
7. `RouterPipeline.process()` handles it:
   - Recognizes frame is for router's MAC
   - Extracts IP packet
   - **This is the router's own IP - router responds with ICMP echo reply**
8. Router sends echo reply back to PC
9. Packet travels back through link (another 1ms)
10. PC receives ICMP reply

### Example 2: End-to-End Routing (PC-to-PC through Router)

1. PC1 (192.168.1.10) sends to PC2 (192.168.2.10)
2. PC1 knows 192.168.2.0/24 is via router (192.168.1.1)
3. PC1 sends frame with dst MAC = router's MAC
4. Frame travels through cable (1ms)
5. Router receives on interface1, recognizes dst MAC is itself
6. `RouterPipeline` processes:
   - Extracts IP packet (dst: 192.168.2.10)
   - Looks up route: 192.168.2.0/24 via interface2
   - Decrements TTL
   - Does ARP lookup for 192.168.2.10
   - **Finds it's direct connected to interface2**
   - Wraps in new Ethernet frame (dst MAC = PC2's MAC)
7. Forwards out interface2 to cable
8. Frame travels through cable (1ms)
9. PC2 receives on its interface
10. PC2 processes (if it's a host, just accepts it)

### Example 3: Switch Flooding (Unknown Unicast)

1. PC1 sends frame with unknown dst MAC
2. Frame arrives at switch
3. `SwitchingEngine.processFrame()`:
   - Learns src MAC on port1
   - Looks up dst MAC: not in table
   - **Floods to all other ports**
4. Frame copies sent to port2, port3, port4
5. Each copy travels separately on its link (potentially different latency)
6. Multiple devices may receive
7. Only true recipient processes it

## Configuration

### Link Parameters

```javascript
const link = new Link({
  sourcePort: port1,
  targetPort: port2,
  latencyMs: 1, // Propagation delay (0.1 = 100µs)
  packetLoss: 0.5, // Packet loss percentage (0-100)
});
```

### Simulation Speed

```javascript
// Real-time simulation
manager.engine.clock.setTimeScale(1.0);

// 10x speed
manager.engine.clock.setTimeScale(10.0);

// Half speed
manager.engine.clock.setTimeScale(0.5);

// Step-by-step
manager.engine.clock.stop();
manager.engine.clock.advance(100); // Advance 100ms
```

## Debugging

### Enable Logging

The system logs at key points:

- `[NetworkIntegrationEngine]` - High-level flow
- `[LinkSimulator]` - Link-level transmission
- `[PacketRouter]` - Routing decisions
- `[NetworkManager]` - API calls

### Inspect Network State

```javascript
manager.engine.logNetworkState();

// Or manually:
const stats = manager.engine.getStats();
const inflight = manager.engine.linkSimulator.getPendingDeliveries();
console.log("In-flight packets:", inflight);
```

### Trace a Packet

Add logging in `RouterPipeline.process()` and `SwitchingEngine.processFrame()` to see exactly where packets go.

## Extension Points

### Custom Packet Processing

Extend device's `onPacketReceived` to add custom logic:

```javascript
const originalHandler = device.onPacketReceived;
device.onPacketReceived = function (packet, iface) {
  // Custom pre-processing
  console.log("Packet received on", iface.name);

  // Call original
  originalHandler.call(this, packet, iface);

  // Custom post-processing
};
```

### Custom Forwarding

Extend device's `onPacketForwarding`:

```javascript
device.onPacketForwarding = (packet, ingressInterface) => {
  // Custom forwarding logic
  // Return { outPacket, outInterface } or null
};
```

### Custom Link Behavior

Override `LinkSimulator._shouldDropPacket()` for different loss models.

## Performance Considerations

1. **Large Networks**: 100+ devices may slow down GUI but simulation scales well
2. **High Traffic**: 1000+ packets/second may impact real-time UI updates
3. **Link Latency**: Lower latencies mean faster simulations (set to 0.1ms for fast sim)
4. **Simulation Speed**: Increase time scale for faster-than-real-time simulation

## Troubleshooting

### Packets Not Flowing

1. Check links are connected (`link.status === 'up'`)
2. Check interfaces are up (`interface.lineStatus === 'up'`)
3. Check routing table has routes (for routers)
4. Enable logging and trace packet path

### Packets Dropped

1. Verify source device has IP address configured
2. Verify destination IP is reachable (route exists)
3. Check packet loss rate on links
4. Check `stats.packetsDropped` counter

### Wrong Routing Decisions

1. Verify routing table entries are correct
2. Check interface IP addresses match routing table
3. Check VLAN configuration on switches
4. Trace packet through `RouterPipeline` step-by-step

## Next Steps

1. Integrate NetworkManager into UI for network visualization
2. Create packet history/trace view
3. Implement more ICMP types (unreachable, time exceeded)
4. Add DNS resolution layer
5. Implement TCP/UDP socket layer
6. Add network protocol analyzers
