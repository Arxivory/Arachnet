# Network Connectivity for Different Devices

## Overview

Your network simulation supports 3 main device types with different L2/L3 behaviors:

| Device Type | Layer | Behavior                       | Key Difference                         |
| ----------- | ----- | ------------------------------ | -------------------------------------- |
| **PC/Host** | L3    | Responds to ICMP, uses gateway | End device, doesn't route              |
| **Switch**  | L2    | Learns MACs, floods frames     | No IP config needed, connects networks |
| **Router**  | L3    | Routes packets, does ARP       | Connects subnets, has multiple IPs     |

---

## 1. PC-to-PC Connectivity ✅

### How It Works

```
PC1 (192.168.1.10)
   ↓ [Send ARP for 192.168.1.20]
   ↓ [Get MAC of PC2]
   ↓ [Create Ethernet frame]
   ↓ (through switch/direct link)
   ↓
PC2 (192.168.1.20)
   ↓ [Receive Ethernet frame]
   ↓ [Check if IP matches]
   ↓ [Create ICMP echo-reply]
   ↓ [Send back to PC1 MAC]
```

### Behavior

- **ARP**: Broadcasts "Who has 192.168.1.20?" on local network
- **Response**: PC2 replies "It's me, MAC is 00:11:22:33:44:55"
- **Echo-Reply**: PC2 sends ICMP response back
- **No Routing**: If on same subnet, packet goes directly

### Console Logs

```
[ARPCache] ARP request #1 sent for 192.168.1.20, retry in 5000ms
[ARPCache] ARP resolution succeeded for 192.168.1.20 → 00:11:22:33:44:55
Ping statistics: Sent=4, Received=4, Lost=0 (0% loss)
```

### Config Example

```
PC1:
  - Interface 0 IP: 192.168.1.10
  - Subnet: 255.255.255.0
  - No gateway needed (same subnet)

PC2:
  - Interface 0 IP: 192.168.1.20
  - Subnet: 255.255.255.0
  - No gateway needed
```

### Common Issues

- **"Request timed out"**: ARP failed to resolve MAC
  - Check: Is PC2 connected?
  - Check: Are both on same subnet (192.168.1.x)?
  - Check: Does PC2 have IP configured?

- **Ping succeeds but slow (5+ seconds)**: ARP had to retry
  - This is OK! ARP can take up to 15 seconds with retries
  - Fix: Pre-populate ARP cache to speed up

---

## 2. Switch Connectivity

### How It Works

```
Switch learns source MACs on each port
   ↓
When frame arrives, switch checks:
   - Is destination MAC in MAC table?
     → Yes: Forward to that port only (unicast)
     → No: Forward to all ports except ingress (flooding)
   ↓
All devices on switch in same broadcast domain (collision domain)
```

### Behavior

- **MAC Learning**: Switch learns "MAC 00:11:22:33:44:55 arrived on port 0"
- **Forwarding**: "Destination MAC 00:11:22:33:44:55 → send to port 0"
- **Broadcasting**: "Destination FF:FF:FF:FF:FF:FF → send to all ports"
- **ARP**: Switches broadcast all ARP requests to all ports

### Console Logs

```
[MacTable] Learned 00:11:22:33:44:55 on port 0
[MacTable] Learned 00:11:22:33:44:66 on port 1
[SwitchingEngine] Forwarding unicast frame from port 0 → port 1
[SwitchingEngine] Flooding broadcast frame to ports 0,2,3 (not 1)
```

### Config Example

```
PC1: 192.168.1.10/24 → Switch Port 0
PC2: 192.168.1.20/24 → Switch Port 1
PC3: 192.168.1.30/24 → Switch Port 2

PC1 pings PC2:
  1. PC1 sends ARP broadcast: "Who has 192.168.1.20?"
  2. Switch floods to all ports (0,1,2)
  3. PC2 responds: "It's me at port 1"
  4. Switch learns: MAC[PC2] → port 1
  5. PC2 sends echo-reply
  6. Switch sends to port 0 (learned location of PC1)
  7. Success!
```

### Advanced: VLAN Support

Switches support 802.1Q VLAN tagging:

```
Port 0: Access VLAN 10 (untagged)
Port 1: Access VLAN 20 (untagged)
Port 2: Trunk (tagged for VLANs 10,20,30)

PC1 → Port 0 (VLAN 10)
PC2 → Port 1 (VLAN 20)
Router → Port 2 (receives tagged frames)

Result: PC1 and PC2 cannot ping each other
        (different VLANs, need router)
```

### Common Issues

- **"Request timed out" through switch**: MAC learning failed
  - Check: `[MacTable] Learned` logs in console
  - If missing: Ingress MAC not being extracted properly
  - Solution: Verify frame structure includes MAC addresses

- **Broadcast storms**: STP disabled, loops created
  - Frames flood in circles forever
  - Fix: Enable STP or verify no physical loops

- **Slow switching**: Too many MACs in table
  - Modern switches handle 100k+ MACs
  - Your simulation: ~1000 should be fine

---

## 3. Router Connectivity

### How It Works (Single Hop)

```
PC1 (192.168.1.10)           PC2 (192.168.2.20)
    ↓                              ↑
    [ARP for gateway             [ARP for gateway
     192.168.1.1]                 192.168.2.1]
    ↓                              ↑
    Router Interface 0      Router Interface 1
    (192.168.1.1)          (192.168.2.1)
    ↓                              ↑
    [Route lookup for              [Route lookup for
     192.168.2.20]                 192.168.1.10]
    ↓                              ↑
    [ARP for next-hop      [ARP for next-hop
     192.168.2.20]                 192.168.1.10]
    ↓                              ↑
    Forward to PC2         Forward to PC1
```

### Behavior

- **Routing**: Uses Longest Prefix Match (LPM) algorithm
- **Connected Routes**: Auto-generated for each interface with IP
- **ARP**: Routers do ARP for next-hop, not final destination
- **TTL**: Decremented on each hop, ICMP sent if reaches 0

### Console Logs

```
[RouterPipeline] Routing lookup for 192.168.2.20 → Interface 1
[ARPCache] ARP request #1 sent for 192.168.2.20, retry in 5000ms
[ARPCache] ARP resolution succeeded for 192.168.2.20 → 00:11:22:33:44:77
[PacketRouter] Forwarding on Interface 1 to PC2
```

### Config Example

```
Router:
  - Interface 0: 192.168.1.1/24 (connects to PC1 subnet)
  - Interface 1: 192.168.2.1/24 (connects to PC2 subnet)
  - Routing table (auto-generated):
    * 192.168.1.0/24 via Interface 0 (direct)
    * 192.168.2.0/24 via Interface 1 (direct)

PC1:
  - Interface 0: 192.168.1.10/24
  - Gateway: 192.168.1.1

PC2:
  - Interface 0: 192.168.2.20/24
  - Gateway: 192.168.2.1

When PC1 pings PC2 (192.168.2.20):
  1. PC1 recognizes: "192.168.2.20 not on my subnet"
  2. PC1 uses gateway: "I'll send to 192.168.1.1"
  3. PC1 does ARP for 192.168.1.1 (router)
  4. Router receives packet on Interface 0
  5. Router does routing lookup: 192.168.2.20 → Interface 1
  6. Router does ARP for 192.168.2.20 (PC2)
  7. Router sends to PC2 on Interface 1
  8. PC2 responds
  9. Router forwards response back to PC1 on Interface 0
```

### Multi-Hop Routing

```
PC1 (192.168.1.0) → Router A (192.168.1.1 / 192.168.2.1)
                  → Router B (192.168.2.2 / 192.168.3.1)
                  → PC2 (192.168.3.20)

PC1 pings PC2:
  1. PC1 → Router A (ARP for 192.168.1.1)
  2. Router A → Router B (ARP for 192.168.2.2)
  3. Router B → PC2 (ARP for 192.168.3.20)
  4. TTL: 64 → 63 → 62 (decremented at each hop)
```

### Common Issues

- **"Request timed out" through router**: Routing lookup failed
  - Check: Routing table has route for destination
  - Check: Connected routes were generated for each interface IP

- **"Destination unreachable"**: Route exists but no ARP reply
  - This means router can't reach next-hop
  - Check: Next-hop device is on the link
  - Check: Next-hop has correct IP configured

- **TTL exceeded**: Routing loop created
  - Packets bounce between routers indefinitely
  - TTL reaches 0, ICMP sent back
  - Fix: Verify routing table doesn't have cycles

### Advanced: Static Routes

For custom routing (not auto-generated connected routes):

```javascript
// In Router properties:
router.routingTable.addRoute({
  destination: "192.168.4.0/24",
  nextHop: "192.168.2.2", // Via Router B
  interface: router.interfaces[1],
  metric: 100,
});
```

---

## Comparison Table

| Aspect               | PC                 | Switch              | Router                    |
| -------------------- | ------------------ | ------------------- | ------------------------- |
| **Max Devices**      | Many               | 3+                  | 2+                        |
| **Configuration**    | IP + Subnet        | VLAN                | IP per interface          |
| **Forwarding**       | Direct/via gateway | MAC table → port    | Routing table → interface |
| **Broadcast**        | Joins subnet       | Floods to all ports | Blocks by interface       |
| **ARP**              | For gateway/dest   | Floods              | For next-hop              |
| **Responds to Ping** | Yes (ICMP)         | No (L2 only)        | No (unless target)        |

---

## Quick Decision Tree

**I want to test connectivity between 2 devices:**

1. Are they both on **same subnet** (e.g., 192.168.1.x)?
   - Yes → **Use Direct PC-to-PC** (or through Switch)
   - No → **Use Router**

2. Are there **many devices** to connect?
   - Yes → **Use Switch** (scales better than direct links)
   - No → **Use direct links** (simpler to debug)

3. Do I want to test **multiple subnets**?
   - Yes → **Use Router**
   - No → **Use Switch**

4. Do I want to test **Internet-like routing**?
   - Yes → **Use Multiple Routers**

---

## Troubleshooting Workflow

1. **Start with PC-to-PC direct link** (simplest case)
2. **If works**: Add switch, test through it
3. **If works**: Remove switch, add router
4. **If works**: Add second router for multi-hop
5. **If fails at any step**: Check logs, verify config

---

## Performance Expectations

| Scenario                 | Typical Time | Max Time        |
| ------------------------ | ------------ | --------------- |
| PC ↔ PC direct           | 1-10ms       | ~5s (ARP retry) |
| PC ↔ PC through switch   | 10-30ms      | ~5s (ARP)       |
| PC ↔ PC through router   | 30-100ms     | ~10s (ARP × 2)  |
| PC ↔ PC multi-hop router | 100-300ms    | ~15s (ARP × 3)  |

Times increase if ARP cache misses and retries are needed.
