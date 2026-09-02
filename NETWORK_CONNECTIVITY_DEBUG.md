# Network Connectivity Testing Guide

## Issues Fixed

### 1. ✅ Ping Timeout Duration (CommandPromptModal.jsx)

**Problem**: Ping timeout was 4000ms, but ARP resolution requires 5000ms+ due to:

- Initial ARP request: 5000ms timeout
- Up to 3 retry attempts
- Processing delays

**Fix**: Increased ping timeout from 4000ms → **8000ms**

- Now allows 5000ms for ARP + 3000ms buffer for retries and processing
- Console logs show ARP request attempts: `[ARPCache] ARP request #1 sent for X.X.X.X, retry in 5000ms`

### 2. ✅ ARP Retry Scheduling (ARPCache.js)

**Problem**: ARP requests were sent once but never retried. The callback `onARPTimeout` was called but never actually scheduled retries.

**Fix**: Implemented proper retry scheduling:

- Added `_timeouts` Map to track active retry timeouts
- Each ARP request now automatically retries after 5000ms if no reply
- Retry counter increments and fails after 3 attempts (ARP_MAX_RETRIES)
- Added console logging for debugging ARP resolution steps

**How it works now**:

1. ARP request #1 sent → wait 5 seconds
2. If no reply → ARP request #2 sent → wait 5 seconds
3. If no reply → ARP request #3 sent → wait 5 seconds
4. If no reply → resolution fails, packet dropped

---

## Testing PC-to-PC Connectivity

### Scenario Setup

```
PC1 (192.168.1.10)  ←→  Switch/Router  ←→  PC2 (192.168.1.20)
```

### Step 1: Configure IP Addresses

1. **PC1**:
   - Interface IP: `192.168.1.10`
   - Subnet Mask: `255.255.255.0`
   - Gateway: `192.168.1.1` (or leave empty if on same subnet)

2. **PC2**:
   - Interface IP: `192.168.1.20`
   - Subnet Mask: `255.255.255.0`
   - Gateway: `192.168.1.1` (or leave empty if on same subnet)

### Step 2: Connect Devices

- Connect PC1 port to Switch/Router port
- Connect PC2 port to different Switch/Router port
- Or connect PC1 directly to PC2 (point-to-point link)

### Step 3: Run Ping

1. Open terminal on **PC1**
2. Run: `ping 192.168.1.20`
3. Watch browser console for ARP resolution logs

### Expected Console Output

```
[ARPCache] ARP request #1 sent for 192.168.1.20, retry in 5000ms
[ARPCache] ARP resolution succeeded for 192.168.1.20 → 00:11:22:33:44:55
```

### If Ping Still Times Out

Check the following:

1. **Verify Physical Connectivity**
   - Are all cables properly connected?
   - Are all ports enabled?
   - Check console for: `Link established between PC1:port0 ↔ PC2:port0`

2. **Verify IP Configuration**
   - Both PCs should be in same subnet (e.g., 192.168.1.x/24)
   - Run `ipconfig` on each device to confirm
   - Check console for: `IP configured on {Device}:port0 → 192.168.1.10`

3. **Check ARP Processing**
   - Look for ARP debug logs in browser console
   - Watch for: `No callback for ARP request send`
   - This indicates ARP frames aren't being broadcast properly

4. **Verify NetworkManager Integration**
   - Is `NetworkIntegrationEngine` properly wired to devices?
   - Check if `onSendARPRequest` callback is registered
   - Look for packet transmission events

5. **Check Switch MAC Learning** (if using switch)
   - Switches must learn MAC→port mappings to forward frames
   - Watch console for: `[MacTable] Learned {MAC} on port {N}`
   - If not learning, frames get flooded to all ports

---

## Testing Router Connectivity

### Scenario Setup

```
PC1 (192.168.1.10)  ←→  Router (192.168.1.1 / 192.168.2.1)  ←→  PC2 (192.168.2.20)
```

### Step 1: Configure Interfaces

1. **Router**:
   - Interface 0: `192.168.1.1/24`
   - Interface 1: `192.168.2.1/24`
2. **PC1**:
   - IP: `192.168.1.10/24`
   - Gateway: `192.168.1.1`
3. **PC2**:
   - IP: `192.168.2.20/24`
   - Gateway: `192.168.2.1`

### Step 2: Verify Routing

- Router should auto-generate connected routes for both subnets
- Check console for: `[Router] Route added: 192.168.1.0/24 via direct`
- Routes must have valid next-hop IP and interface

### Step 3: Run Ping from PC1 → PC2

```
ping 192.168.2.20
```

### Expected Flow

1. PC1 (192.168.1.10) creates ICMP echo-request to 192.168.2.20
2. PC1 checks local subnet: 192.168.2.20 not local → use gateway 192.168.1.1
3. PC1 does ARP for gateway: 192.168.1.1 → {Router MAC}
4. Packet forwarded to Router
5. Router receives packet, does routing lookup: 192.168.2.20 → 192.168.2.1 (via Interface 1)
6. Router does ARP for next-hop: 192.168.2.20 → {PC2 MAC}
7. Router forwards to PC2
8. PC2 receives ICMP echo-request
9. **PC2 responds with ICMP echo-reply** ← This is critical!
10. Echo-reply is routed back through Router to PC1

### Critical Issue: Host Echo-Reply Logic

**If ping still fails despite correct routing:**

The issue is likely in Host behavior when it receives ICMP echo-request. The host must:

1. Recognize ICMP echo-request is addressed to its IP
2. Create ICMP echo-reply with swapped src/dst IPs
3. Send echo-reply back to source

Check [Host.js](src/core/network/Host.js) for `onPacketReceived` handler.

---

## Testing Switch Connectivity

### Scenario Setup

```
PC1 ↗
     Switch ← MAC Learning  → PC3
PC2 ↖

All on same broadcast domain (192.168.1.0/24)
```

### Key Switch Features

- **MAC Learning**: Learns source MAC → ingress port
- **Frame Forwarding**:
  - Known unicast → send to learned port
  - Unknown unicast → flood to all ports
  - Broadcast/Multicast → flood to all ports
- **VLAN Support**: Separates traffic by VLAN
- **STP**: Prevents loops (if enabled)

### Step 1: Connect Devices

1. PC1 → Switch Port 1
2. PC2 → Switch Port 2
3. PC3 → Switch Port 3

### Step 2: Run Traffic

```
ping 192.168.1.20  (from PC1 to PC2)
```

### Expected Console Output

```
[MacTable] Learned {PC1_MAC} on port 1
[MacTable] Learned {PC2_MAC} on port 2
[SwitchingEngine] Forwarding unicast frame from port 1 → port 2
```

### If Frames Don't Forward

1. **Check MAC table**: Is MAC learning working?
   - Look for `[MacTable] Learned` logs
   - If not learning, ingress interface not sending up MAC addresses

2. **Check port states**: Are ports operational?
   - Ports must be in FORWARDING state
   - Look for `port[N] state: FORWARDING`

3. **Check VLAN configuration**:
   - All ports default to VLAN 1
   - Frame must enter/exit same VLAN to be forwarded
   - For tagged traffic, check 802.1Q handling

---

## Debugging Commands

### From Host CLI

```bash
# Show network interfaces
ifconfig

# Show routing table
route print

# Show ARP cache
arp -a

# Test connectivity
ping 192.168.1.20

# Trace route
tracert 192.168.2.20  (if implemented)
```

### Browser Console

```javascript
// Check NetworkManager status
console.log(networkManager.getNetworkStats());

// Check device interfaces
const device = findDevice("PC1");
console.log(device.interfaces.map((i) => i.ipv4));

// Check ARP cache
const arpCache = device.routerBehavior?.arpCache;
console.log(arpCache.getAllEntries());

// Check routing table
const router = device.routerBehavior;
console.log(router.routingTable.getTable());
```

### Common Log Patterns

| Log                                      | Meaning                       |
| ---------------------------------------- | ----------------------------- |
| `[ARPCache] ARP request #1 sent`         | ARP resolution initiated      |
| `[ARPCache] ARP resolution succeeded`    | MAC address resolved          |
| `[ARPCache] ARP resolution failed`       | Destination unreachable       |
| `[MacTable] Learned`                     | Switch learned MAC→port       |
| `[PacketRouter] Forwarding on interface` | Packet sent out interface     |
| `Request timed out`                      | Ping timeout (8 second limit) |

---

## Performance Considerations

### Timing

- **ARP resolution**: 5 seconds per attempt, up to 3 attempts (15 seconds max)
- **Ping timeout**: 8 seconds (should complete before timeout)
- **Switch MAC table**: Entries age out after 5 minutes by default

### Packet Loss

- Packets dropped if:
  - ARP resolution fails (destination unreachable)
  - TTL reaches 0 (routing loop)
  - Interface down
  - Switch port down/blocked

### Scalability

- Current implementation suitable for ~50 devices
- Beyond that, consider optimizing:
  - ARP cache size
  - Routing table lookup algorithm
  - MAC table size

---

## Next Steps

1. **Test simple PC-to-PC ping** with these fixes
2. **Check browser console** for ARP retry logs
3. **Verify Host echo-reply** is being sent
4. **Test multi-hop routing** if PC-to-PC works
5. **Implement DNS** for hostname resolution (optional)
