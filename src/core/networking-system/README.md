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

Switch VLAN configuration and static-route configuration are model data only.
Switch VLAN configuration and static-route configuration are network
configuration data. CAM learning/aging, STP behavior, frame forwarding, IPv4
forwarding, ARP retry behavior, and ICMP responses are implemented as distinct
deterministic emulation logic; configured state must not be mistaken for
simulated protocol behavior. Twin synchronization/session orchestration is also
separate from the device and protocol model.

## Cisco alignment

The model uses Cisco IOS-style interface identifiers and common enterprise
switching concepts (access/trunk ports, native/allowed VLANs, operational
interface state). It is a research simulator model, not a Cisco IOS
implementation or a substitute for vendor-specific validation. Add exact
device profiles only when their port, PoE, and feature capabilities have been
verified against the specific SKU documentation.
