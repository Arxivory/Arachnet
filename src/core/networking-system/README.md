# Networking system core

This directory contains network hardware, topology, and protocol-emulation
logic. It does not contain project, building, floor, CAD/BIM geometry, or
architectural-model code.

## Networking boundary

`NetworkTopology` owns devices and physical network links. Network entities
may reference a floor identifier or use spatial route points when the networking
work requires it, but ownership and parsing of architectural geometry belong
in a separate sibling module under `src/core/` if/when that scope is started.
Do not add building or geometry classes here.

Devices are typed instances (`Switch`, `Router`, `WirelessAP`, `PC`, `Laptop`,
and `Server`) based on the `Device` inventory model. A device profile supplies
model-specific capabilities; generic defaults are not claims about a specific
Cisco SKU. Device ids and physical port ids must be unique within a topology.
Port and interface objects are separate: physical ports represent
the connection point and media capability, while interfaces carry logical
configuration and operational state.

The current physical link model covers copper Ethernet Cat5e, Cat6, and Cat6A.
It negotiates the highest shared speed and a shared duplex mode, and measures a
3D route plus patch cords against the research's 100 m channel limit. Links
without a route remain explicitly **unverified**; they are not reported as
compliant. Fiber routing and standards-complete RF simulation are outside the
paper's stated scope.

PoE allocations enforce the configured switch budget and standard per-device
power ceilings for IEEE 802.3af/at/bt. Hardware power budgets and port counts
must come from the selected device profile rather than guessed model-family
defaults.

Switch VLAN and static-route configuration are consumed by the Layer 2/3
emulation engine. Endpoint interfaces can specify a `defaultGateway` for
off-subnet IPv4 traffic.
## Layer 2/3 emulation

`NetworkManager` owns the topology and exposes `sendFrame`, `sendIpv4`, and
`retryArp`. It wires physical links to the frame-processing engines and emits
network events. Ethernet switching supports VLAN access/trunk ingress and
egress, VLAN-scoped CAM learning/aging, flooding/unicast forwarding, and
configurable STP port states. Routers build connected/static routes, perform
longest-prefix forwarding, resolve next hops through ARP, decrement TTL, and
generate ICMP echo, time-exceeded, and destination-unreachable messages.

The simulator is synchronous and deterministic for a given topology/config.
ARP retry intervals are driven by explicit `retryArp()` calls. STP models BPDU
root selection and explicit port states; it does not run a real-time STP timer
or implement every Cisco feature. It is not a vendor IOS implementation.
Packet checksums, FCS calculation, TCP/UDP transport behavior, IPv6, wireless
association, and physical-device control are not currently simulated.

This behavior is functional simulator logic, separate from a real network
integration or twin synchronization.

## Cisco alignment

The model uses Cisco IOS-style interface identifiers and common enterprise
switching concepts (access/trunk ports, native/allowed VLANs, operational
interface state). It is a research simulator model, not a Cisco IOS
implementation or a substitute for vendor-specific validation. Add exact
device profiles only when their port, PoE, and feature capabilities have been
verified against the specific SKU documentation.
