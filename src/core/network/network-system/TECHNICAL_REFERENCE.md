/\*\*

- TECHNICAL_REFERENCE.md
-
- Low-level technical details on how the unified system integrates
- with existing Device, Interface, Link, and routing/switching logic.
  \*/

# Technical Reference: Network System Integration

## Packet Flow Detail

### Step 1: Packet Origin

A packet originates when:

- Application calls `manager.sendPing()` or `manager.sendPacket()`
- Device needs to forward a received packet
- Routing protocol sends update messages
- ARP process needs to send request

```javascript
// Example: Sending a ping from PC1 to PC2
manager.sendPing('192.168.1.10', '192.168.1.20');

// Internally:
1. Find device with IP 192.168.1.10
2. Find interface with that IP
3. Create ICMP packet in IP packet in Ethernet frame
4. Call engine.transmitPacket(frame, interface)
```

### Step 2: Transmission Decision

`NetworkIntegrationEngine.transmitPacket()` decides where the packet goes:

```javascript
transmitPacket(packet, outInterface) {
  // 1. Find the physical port
  const port = outInterface.physicalPort;

  // 2. Check if port has a cable
  if (!port.link || port.link.status !== 'up') {
    this.stats.packetsDropped++;
    return;  // Dead end
  }

  // 3. Use PacketRouter to find next hop
  const nextHop = this.packetRouter.findNextHop(packet, outInterface, device);

  // 4. Schedule transmission on the link
  this.linkSimulator.scheduleTransmission(
    packetId,
    packet,
    port.link,
    outInterface,
    nextHop.nextInterface
  );
}
```

### Step 3: Link Simulation

`LinkSimulator.scheduleTransmission()` simulates the actual link:

```javascript
scheduleTransmission(id, packet, link, src, dst) {
  // 1. Check link status
  if (link.status !== 'up') return;

  // 2. Randomly drop based on loss
  if (Math.random() < link.packetLoss) {
    this.engine.stats.packetsDropped++;
    return;
  }

  // 3. Calculate arrival time
  const delayMs = link.latencyMs;
  const arrivalTime = this.engine.clock.now() + delayMs;

  // 4. Queue for delivery
  this.pendingDeliveries.push({
    packet,
    dstInterface: dst,
    deliveryTime: arrivalTime,
  });

  // 5. Process when time advances (or immediately if time already passed)
  this._processPendingDeliveries();
}
```

### Step 4: Packet Delivery

When the delivery time arrives:

```javascript
_processPendingDeliveries() {
  const now = this.engine.clock.now();

  // Check if any packets are ready to arrive
  while (this.pendingDeliveries.length > 0
         && this.pendingDeliveries[0].deliveryTime <= now) {

    const { packet, dstInterface } = this.pendingDeliveries.shift();

    // Deliver to destination interface
    this.engine.deliverPacket(packet, dstInterface);
  }
}

// In NetworkIntegrationEngine:
deliverPacket(packet, receivingInterface) {
  const device = receivingInterface.device;

  // 1. Check interface is up
  if (receivingInterface.lineStatus !== 'up') {
    this.stats.packetsDropped++;
    return;
  }

  // 2. Call device's packet handler
  if (device.onPacketReceived) {
    device.onPacketReceived(packet, receivingInterface);
  }

  // 3. Track statistics
  this.stats.packetsReceived++;
}
```

### Step 5: Device Processing

The device processes the received packet (L2/L3 logic):

#### For a Switch

```javascript
// In SwitchingEngine.processFrame():
processFrame(frame, ingressInterface) {
  // 1. Learn source MAC
  this.macTable.learn(frame.srcMAC, ingressPort.id, vlanId);

  // 2. Lookup destination MAC
  const egressPortId = this.macTable.lookup(frame.dstMAC, vlanId);

  if (egressPortId) {
    // 3. Forward to single port
    this._forward(frame, egressPortId, vlanId);
  } else {
    // 3. Flood to all ports
    this._flood(frame, ingressPort, vlanId);
  }
}

// Internal forwarding calls device.onPacketForwarding():
device.onPacketForwarding(frame, egressInterface) => {
  return { outPacket: frame, outInterface: egressInterface };
};
```

#### For a Router

```javascript
// In RouterPipeline.process():
static process(frame, ingressInterface, device) {
  // 1. Check frame is for us
  if (!frame.dstMAC === ingressInterface.macAddress) return;

  // 2. Extract IP packet
  const ipPacket = this._extractIPPacket(frame);

  // 3. Routing lookup
  const route = device.routingTable.lookup(ipPacket.dstIP);
  if (!route) {
    // Send ICMP unreachable
    device.icmp.sendDestinationUnreachable(...);
    return;
  }

  // 4. TTL check and decrement
  if (ipPacket.ttl <= 1) {
    device.icmp.sendTTLExceeded(...);
    return;
  }
  ipPacket.ttl--;

  // 5. ARP lookup for next hop MAC
  const nextHopMac = device.arpCache.lookup(route.nextHop);

  // 6. Create new Ethernet frame and forward
  const egressInterface = device.getInterfaceByName(route.egressInterface);
  const newFrame = createEthernetFrame({
    srcMAC: egressInterface.macAddress,
    dstMAC: nextHopMac,
    payload: ipPacket,
  });

  // Call forwarding hook
  device.onPacketForwarding(newFrame, egressInterface) => {
    return { outPacket: newFrame, outInterface: egressInterface };
  };
}
```

### Step 6: Forwarding Hook

The device's `onPacketForwarding` callback is called:

```javascript
// Wired by NetworkIntegrationEngine._wireDevice():
device.onPacketForwarding = function (packet, outInterface) {
  // This is set by the device's logic (Switch/Router)
  // It returns: { outPacket, outInterface } or null
  //
  // If return value is provided, the packet will be forwarded
};
```

### Step 7: Recursive Forwarding

If forwarding is needed, we go back to Step 2:

```javascript
// In the integration engine's device wiring:
if (device.onPacketForwarding) {
  const forward = device.onPacketForwarding(packet, ingressInterface);
  if (forward) {
    // Recursively forward - back to transmitPacket()
    this.transmitPacket(forward.outPacket, forward.outInterface);
  }
}
```

This creates the recursive flow: transmit → deliver → process → forward → transmit → ...

## Class Integration Points

### Device Class Modifications

The Device class doesn't need modification, but instances get enhanced:

```javascript
// BEFORE: Device has only basic structure
device._ports = new Map(); // Physical ports
device._interfaces = new Map(); // Logical interfaces

// AFTER: NetworkIntegrationEngine enhances it
device.onPacketReceived = function (packet, interface) {
  // Original logic for L2/L3 processing
  originalHandler.call(this, packet, interface);

  // NEW: Check if should forward
  const forward = this.onPacketForwarding(packet, interface);
  if (forward) {
    // Send back to engine for transmission
    this._engine.transmitPacket(forward.outPacket, forward.outInterface);
  }
};

device._engine = engine; // Back-reference for callbacks
```

### Interface Class Integration

The Interface class represents both L2 and L3 parameters:

```javascript
export class Interface {
  // Layer 1: Physical port reference
  physicalPort; // PhysicalPort instance

  // Layer 2: Link-layer parameters
  macAddress; // Hardware address
  encapsulation; // 'arpa' | 'dot1q' | 'hdlc' | 'ppp'
  vlan; // VLAN membership (switchport access vlan)
  subInterfaces; // 802.1Q sub-interfaces (Map)

  // Layer 3: Network layer parameters
  ipv4; // { address, subnetMask }
  ipv6; // { address, prefixLength }

  // Line protocol status
  lineStatus; // 'up' | 'down' | 'err-disabled'

  // Negotiated speed/duplex
  negotiatedSpeedBps; // From link autonegotiation
  negotiatedFullDuplex;
}
```

The interface `lineStatus` is derived from its physical port:

```javascript
// In PhysicalPort:
get lineStatus() {
  if (!this.interface) return 'administratively down';
  if (this._physicalStatus === 'up' && this.link?.status === 'up') {
    return 'up';
  }
  return 'down';
}
```

### Link Class Integration

Links represent physical cables:

```javascript
export class Link {
  sourcePort; // PhysicalPort at one end
  targetPort; // PhysicalPort at other end

  status; // 'up' | 'down' (negotiated)
  cableType; // Catalog entry for specs

  // Simulation parameters
  latencyMs; // Propagation delay (0.1 = 100µs)
  packetLoss; // Loss percentage (0-100)

  geometry; // 3D path points for visualization

  negotiation; // Result of autonegotiation
  // { speed, duplex } for both ports
}
```

When a link is created, it:

1. Runs autonegotiation on both ports
2. Calls `_setPhysicalStatus('up')` on both ports
3. Triggers port → interface status propagation
4. Sets `negotiatedSpeed` and `negotiatedFullDuplex` on interfaces

### PhysicalPort Class Integration

```javascript
export class PhysicalPort {
  id; // "deviceId::portName"
  name; // "GigabitEthernet0/1"
  interface; // Reference to bound Interface
  link; // Reference to Link if connected
  _physicalStatus; // 'up' | 'down' | 'err-disabled'

  // 1:1 relationship with Interface
  bindInterface(intf) {
    this.interface = intf;
    intf.physicalPort = this;
  }

  // Single occupancy: one link per port
  attachLink(link) {
    if (this.isOccupied) throw Error();
    this.link = link;
    this._setPhysicalStatus("up");
  }

  // Port state transitions propagate to interface
  _setPhysicalStatus(status) {
    this._physicalStatus = status;
    // Trigger interface status change
    this.interface._notifyStatusChange();
  }
}
```

## State Management Integration

### NetworkStore

The NetworkStore maintains device and link lists:

```javascript
export class NetworkStore {
  devices = [];    // Array of Device instances
  links = [];      // Array of Link instances
  metadata = { ... };

  // NetworkManager reads these and passes to NetworkIntegrationEngine
  const engine = new NetworkIntegrationEngine(this.devices, this.links);
}
```

### AppState Synchronization

When NetworkStore updates, it notifies listeners:

```javascript
// In NetworkStore:
notify() {
  this.listeners.forEach(cb => cb());
}

// NetworkManager can subscribe:
appState.network.subscribe(() => {
  // Devices or links changed
  // Could rebuild engine or update references
});
```

## Routing and Switching Logic

### Routing Table Integration

```javascript
// Router has routing table
device.routingTable = new RoutingTable(device);

// Add routes
routingTable.addStaticRoute(
  "10.0.0.0",
  "255.255.255.0",
  "192.168.1.1",
  "gi0/1",
);
routingTable.addConnectedRoute("192.168.1.0", "255.255.255.0", "gi0/0");

// Lookup
const result = routingTable.lookup("10.0.0.5");
// Returns: { route, matchLength }
// route.nextHop = '192.168.1.1'
// route.egressInterface = 'gi0/1'
```

The integration engine doesn't modify routing logic—it just uses lookup results to find the next hop.

### MAC Table Integration

```javascript
// Switch has MAC table
device.engine.macTable = new MacTable();

// Learning happens automatically in SwitchingEngine
macTable.learn(srcMac, portId, vlanId);

// Lookup
const egressPortId = macTable.lookup(dstMac, vlanId);
// Returns port ID or null (unknown)
```

### VLAN Integration

```javascript
// Switch has VLAN manager
device.vlanManager = new VLANManager(device);

// Port modes
vlanManager.setPortMode(portId, "trunk"); // Carries multiple VLANs
vlanManager.setPortMode(portId, "access"); // Single VLAN

// Access port VLAN
vlanManager.setAccessVlan(portId, 10); // Force VLAN 10

// Trunk native VLAN
vlanManager.setNativeVlan(10); // Untagged frames get VLAN 10

// Egress check
if (vlanManager.isEgressAllowed(portId, vlanId)) {
  // OK to forward on this port
}
```

The integration engine respects these boundaries when forwarding.

## Timing and Clock

### Simulation Time

All timing is relative to the NetworkSimulationClock:

```javascript
export class NetworkSimulationClock {
  startRealTime; // Wall clock when simulation started
  startSimTime; // Simulation time at start
  elapsedMs; // Total elapsed simulation time
  timeScale; // Multiplier (1.0 = real-time)

  now() {
    // Returns current simulation time in milliseconds
    // Accounts for time scale factor
  }
}
```

### Link Transmission Scheduling

```javascript
// When a packet is transmitted on a link:
const delayMs = link.latencyMs; // e.g., 1ms
const arrivalTime = clock.now() + delayMs; // Absolute sim time

// When clock advances past arrivalTime:
if (clock.now() >= arrivalTime) {
  // Deliver the packet
}
```

This works correctly even with accelerated time:

- Real time progresses at normal rate
- Simulation time progresses faster/slower per time scale
- Packet timing remains consistent

### Event Ordering

Multiple packets in flight can arrive in order:

```javascript
// Time 0ms: Send packet A to link with 2ms latency
// Arrival time: 0 + 2 = 2ms

// Time 1ms: Send packet B to link with 1ms latency
// Arrival time: 1 + 1 = 2ms

// Time 2ms: Both arrive simultaneously
// Processed in order: A, then B
```

## Error Handling

### Graceful Degradation

If a link fails during transmission:

```javascript
if (link.status !== "up") {
  // Don't schedule transmission
  stats.packetsDropped++;
  return;
}
```

If a destination port is unplugged:

```javascript
if (!receivingPort.interface) {
  // Port has no interface bound
  stats.packetsDropped++;
  return;
}
```

If a device is removed:

```javascript
// NetworkManager.removeDevice() cleans up:
1. Remove from device map
2. Remove all its links
3. Update PacketRouter's device map
```

### Packet Loss Simulation

```javascript
_shouldDropPacket(lossPercentage) {
  if (lossPercentage <= 0) return false;
  if (lossPercentage >= 100) return true;
  // Random drop based on percentage
  return Math.random() * 100 < lossPercentage;
}
```

This simulates realistic network conditions with random loss.

## Performance Considerations

### Lookup Complexity

```javascript
// MAC table lookup: O(1) hash table
macTable.lookup(dstMac, vlanId);

// Routing table lookup: O(k) where k = number of routes
// Uses longest-prefix-match linear search
routingTable.lookup(destIP);

// PacketRouter.findNextHop(): O(1) to O(k)
```

### Memory Usage

```javascript
// Per device:
- Device object: ~500 bytes
- Per port: ~200 bytes (for 50 ports = 10KB)
- Per interface: ~300 bytes (for 50 interfaces = 15KB)
- Routing table: O(n) routes
- MAC table: O(m) learned MACs

// Per packet in flight: ~200 bytes
// Per link: ~100 bytes
```

### Scaling

- **1,000 devices**: No problem, all devices and routes in memory
- **10,000 packets/second**: Simulation can handle, UI may lag
- **Large networks (500+ devices)**: Consider batching UI updates

## Extension Points

### Custom Packet Handling

Override device's `onPacketReceived`:

```javascript
const original = device.onPacketReceived;
device.onPacketReceived = function (packet, intf) {
  console.log("Packet received:", packet);
  original.call(this, packet, intf);
};
```

### Custom Forwarding

Override device's `onPacketForwarding`:

```javascript
device.onPacketForwarding = function (packet, intf) {
  // Return null to drop
  // Return { outPacket, outInterface } to forward
  // Return nothing to consume
};
```

### Custom Link Behavior

Subclass LinkSimulator:

```javascript
class CustomLinkSimulator extends LinkSimulator {
  _shouldDropPacket(lossPercentage) {
    // Custom drop logic (e.g., burst errors)
  }
}
```

### Custom Routing

The routing table is consulted but not modified by the integration engine:

```javascript
// You can add custom routes
routingTable.addStaticRoute(...);

// Or replace routing logic entirely
device.onPacketForwarding = function(packet, intf) {
  // Custom routing decision
};
```

## Debugging Guide

### Trace a Specific Packet

1. Add unique ID to packet metadata
2. Log in NetworkIntegrationEngine.transmitPacket()
3. Log in LinkSimulator.scheduleTransmission()
4. Log in NetworkIntegrationEngine.deliverPacket()
5. Log in device's onPacketReceived()
6. Log in device's onPacketForwarding()

### Inspect Device State

```javascript
const device = appState.network.devices[0];

// Check physical connections
device.ports.forEach((port) => {
  console.log(`${port.name}: ${port.link ? "connected" : "disconnected"}`);
});

// Check interface configuration
device._interfaces.forEach((intf) => {
  console.log(`${intf.name}: ${intf.ipv4?.address || "no IP"}`);
});

// Check routing (if router)
if (device.routingTable) {
  device.routingTable.entries.forEach((route, dest) => {
    console.log(`${dest} -> ${route.nextHop || "direct"}`);
  });
}
```

### Monitor Packet Flow

```javascript
// Hook into NetworkIntegrationEngine events
engine.addEventListener = function (type, cb) {
  // Could be added to emit specific events
};

// Or examine statistics
setInterval(() => {
  console.log(engine.getStats());
}, 1000);
```

## References

- Device: `src/core/network/Device.js`
- Interface: `src/core/network/Interface.js`
- Link: `src/core/network/Link.js`
- PhysicalPort: `src/core/network/PhysicalPort.js`
- RouterPipeline: `src/core/network/routing/RouterPipeline.js`
- SwitchingEngine: `src/core/network/switching/SwitchingEngine.js`
- RoutingTable: `src/core/network/routing/RoutingTable.js`
- MacTable: `src/core/network/switching/MacTable.js`
