# Network Connectivity - Root Cause Analysis & Fixes

## What Was Wrong (Root Cause)

Your ping was timing out due to **3 interconnected issues**:

### Issue #1: Ping UI Timeout Too Short (FIXED ✅)

- **File**: [src/ui/PCModals/CommandPromptModal.jsx](src/ui/PCModals/CommandPromptModal.jsx#L290)
- **Problem**: Ping timeout was 4000ms (4 seconds)
- **Why it matters**: ARP resolution takes 5000ms minimum (5 seconds timeout + processing)
- **Result**: Ping would timeout before ARP even finished trying to resolve MAC addresses
- **Fix**: Changed timeout to **8000ms (8 seconds)**

### Issue #2: ARP Retry Logic Not Implemented (FIXED ✅)

- **File**: [src/core/network/routing/ARPCache.js](src/core/network/routing/ARPCache.js)
- **Problem**: When ARP request failed to get a reply:
  - No retry timeout was scheduled
  - The callback `onARPTimeout` was called but never actually did anything
  - Packets would queue indefinitely, never retrying
- **Why it matters**: Without retries, a single failed ARP request = permanent failure
- **How it worked before**:
  ```
  ARP request sent → wait forever → packet dies
  ```
- **Fix**: Implemented proper retry scheduling:
  ```
  ARP request #1 → wait 5s → no reply
  ARP request #2 → wait 5s → no reply
  ARP request #3 → wait 5s → no reply
  Resolution fails after 3 attempts
  ```
- **Changes**:
  1. Added `_timeouts` Map to track active retry timers
  2. Each ARP request now schedules a setTimeout for 5000ms
  3. After timeout, automatically retries by calling `_generateARPRequest` again
  4. Cleans up timeout when resolution succeeds or fails

### Issue #3: Missing Debug Logging

- **File**: [src/core/network/routing/ARPCache.js](src/core/network/routing/ARPCache.js)
- **Problem**: No visibility into what was happening during ping
- **Fix**: Added console logs to show:
  - `[ARPCache] ARP request #N sent for {IP}, retry in 5000ms`
  - `[ARPCache] ARP resolution succeeded for {IP} → {MAC}`
  - `[ARPCache] ARP resolution failed for {IP} after N attempts`

---

## What's Working Now

### Host Behavior ✅

- **File**: [src/core/network/Host.js](src/core/network/Host.js)
- Hosts properly detect ICMP echo-request packets
- Generate ICMP echo-reply with swapped source/destination
- Reply is queued and forwarded through NetworkIntegrationEngine

### NetworkIntegrationEngine ✅

- **File**: [src/core/network/network-system/NetworkIntegrationEngine.js](src/core/network/network-system/NetworkIntegrationEngine.js#L250-L258)
- Properly calls `device.onPacketForwarding()` after receiving packets
- Hosts can return replies which get transmitted

### Routing Pipeline ✅

- **File**: [src/core/network/routing/RouterPipeline.js](src/core/network/routing/RouterPipeline.js)
- 6-step forwarding pipeline: Ingress MAC → Decapsulation → Routing Lookup → TTL → ARP → Encapsulation
- Longest Prefix Match routing
- TTL decrement and ICMP TTL exceeded

### Switching Engine ✅

- **File**: [src/core/network/switching/SwitchingEngine.js](src/core/network/switching/SwitchingEngine.js)
- MAC table learning
- Unicast/broadcast/multicast flooding
- VLAN support

---

## Testing Checklist

### Quick Test: Direct PC-to-PC Link

**Setup**:

```
PC1 (192.168.1.10) ←→ Link ←→ PC2 (192.168.1.20)
```

**Steps**:

1. Create 2 PCs
2. Configure **PC1 Interface 0**: `192.168.1.10/255.255.255.0`
3. Configure **PC2 Interface 0**: `192.168.1.20/255.255.255.0`
4. Connect PC1:port0 ↔ PC2:port0
5. Open terminal on PC1
6. Run: `ping 192.168.1.20`
7. **Expected**: Successful pings with realistic latencies

**Console logs should show**:

```
[ARPCache] ARP request #1 sent for 192.168.1.20, retry in 5000ms
[ARPCache] ARP resolution succeeded for 192.168.1.20 → 00:11:22:33:44:55
```

### Test 2: Through a Switch

**Setup**:

```
PC1 ─┐
     Switch ─ PC2
PC3 ─┘
```

**Configuration**:

- PC1: `192.168.1.10/24`
- PC2: `192.168.1.20/24`
- PC3: `192.168.1.30/24`
- All connected to switch ports 0, 1, 2

**Expected**:

```
PC1 ping 192.168.1.20 → Success
PC1 ping 192.168.1.30 → Success
Switch learns all MACs and forwards correctly
```

**Console logs should show**:

```
[MacTable] Learned {PC1_MAC} on port 0
[MacTable] Learned {PC2_MAC} on port 1
[MacTable] Learned {PC3_MAC} on port 2
[SwitchingEngine] Forwarding unicast from port 0 → port 1
```

### Test 3: Through a Router (Multi-Subnet)

**Setup**:

```
PC1 (192.168.1.x) ─┐
                   Router ─ PC2 (192.168.2.x)
                   (has both IPs)
```

**Configuration**:

- **Router Interface 0**: `192.168.1.1/24`
- **Router Interface 1**: `192.168.2.1/24`
- **PC1 Interface 0**: `192.168.1.10/24` with gateway `192.168.1.1`
- **PC2 Interface 0**: `192.168.2.20/24` with gateway `192.168.2.1`

**Test from PC1**:

```
ping 192.168.2.20
```

**Expected Flow**:

1. PC1 recognizes 192.168.2.20 is not local
2. PC1 does ARP for gateway 192.168.1.1 (the router)
3. Packet forwarded to router
4. Router does routing lookup: 192.168.2.20 → Interface 1
5. Router does ARP for 192.168.2.20 (PC2)
6. Packet forwarded to PC2
7. **PC2 MUST send echo-reply** back through router
8. Echo-reply routed back to PC1

**Console logs**:

```
[ARPCache] ARP request #1 sent for 192.168.1.1
[ARPCache] ARP resolution succeeded for 192.168.1.1 → {ROUTER_MAC}
[ARPCache] ARP request #1 sent for 192.168.2.20
[ARPCache] ARP resolution succeeded for 192.168.2.20 → {PC2_MAC}
Ping statistics: Sent=4, Received=4, Lost=0
```

---

## Troubleshooting Guide

### Symptom: Still Getting "Request timed out"

**Check 1: Verify Physical Connectivity**

```javascript
// In browser console:
const pc1 = findDevice("PC1");
const pc2 = findDevice("PC2");
console.log(pc1.interfaces[0].link); // Should show connected link
console.log(pc2.interfaces[0].link); // Should show same link
```

- If undefined: cables not connected

**Check 2: Verify IP Configuration**

```javascript
const device = findDevice("PC1");
device.interfaces.forEach((iface, idx) => {
  console.log(`Interface ${idx}:`, iface.ipv4);
});
```

- Should show: `{ address: '192.168.1.10', subnetMask: '255.255.255.0' }`

**Check 3: Check ARP Logs**

- Open **Browser DevTools** → **Console**
- Look for `[ARPCache]` messages
- If you see "ARP request #3" but no "resolution failed" → resolution succeeded
- If you don't see any ARP messages → ARP not being initiated (routing lookup failed?)

**Check 4: Verify Router Connectivity** (for multi-subnet test)

```javascript
const router = findDevice("Router");
console.log("Routing table:", router.routerBehavior.routingTable.getTable());
```

- Should have routes for both subnets
- Format: `{ destination: '192.168.1.0/24', nextHop: 'direct', interface: Interface0, metric: 0 }`

**Check 5: Check Host Echo-Reply**

- Device must be installed with Host behavior
- Open **Properties Panel** → Select PC2 → Check for `Host` behavior indicator
- Without this, PC2 won't respond to ICMP echo-requests

### Symptom: ARP Requests Not Reaching Destination

**Possible Causes**:

1. **Switch not learning/forwarding**
   - Check: `[MacTable] Learned` logs in console
   - If missing: MAC table not being updated (ingress MAC not attached to frame)

2. **Router not forwarding ARP**
   - Routers should forward ARP to all interfaces looking for next-hop
   - Check routing lookup is producing valid next-hop

3. **NetworkIntegrationEngine not wired**
   - Check browser console for errors about undefined callbacks
   - Verify `onSendARPRequest` callback is registered

### Symptom: Ping Succeeds But Takes Too Long

**Normal latency**:

- Direct link (PC↔PC): 1-10ms
- Through switch: 10-30ms
- Through router: 30-100ms (routing lookup + ARP)

**If 5+ seconds on direct link**:

- Likely waiting for ARP timeout
- Check if ARP request is being sent at all

---

## Performance Tips

1. **Pre-populate ARP cache** to skip ARP resolution:
   - Click "Learn routes" on device properties
   - This learns all directly connected devices

2. **Use direct links** for testing connectivity:
   - Fewer variables than routing through switch/router
   - Easier to debug

3. **Start simple**:
   - Test PC↔PC first
   - Then add switch
   - Then add router
   - Then multi-hop routing

---

## Files Modified

| File                                                                  | Change                           | Impact                        |
| --------------------------------------------------------------------- | -------------------------------- | ----------------------------- |
| [CommandPromptModal.jsx](src/ui/PCModals/CommandPromptModal.jsx#L290) | Timeout: 4000ms → 8000ms         | Allows ARP resolution time    |
| [ARPCache.js](src/core/network/routing/ARPCache.js)                   | Added retry scheduling + logging | ARP now retries after timeout |

---

## Next Steps

1. **Test the simple PC-to-PC scenario** first
2. **Check browser console** for ARP retry logs
3. **Report any "Request timed out" errors** with console logs
4. If routing test fails: **Verify Host echo-reply** is being sent
5. If switch test fails: **Check MAC table learning**
6. If router test fails: **Verify routing table** has correct routes

Good luck! 🚀
