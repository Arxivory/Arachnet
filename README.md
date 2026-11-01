# ArachNet (formerly NetArch-3D)

> **A GNN-Assisted, Spatially-Aware Digital Twin Platform for Enterprise LAN & WLAN Design**

ArachNet evolves the original 3D network design concept into a research-driven, GNN-powered Network Digital Twin (NDT). While traditional 2D schematic tools (like Packet Tracer or Visio) calculate distances across flat Euclidean planes and ignore vertical risers, ceiling plenums, and structural walls, ArachNet ingests native multi-floor 3D CAD/BIM geometry (`.dwg`, `.ifc`) and models the environment as a **Heterogeneous Spatial Graph**.

By applying Relational Graph Convolutional Networks (R-GCN) and Heterogeneous Graph Transformers (HGT), ArachNet dynamically optimizes physical cabling paths and wireless access point placements in milliseconds, strictly enforcing IEEE 802.3 distance limits, NEC 40% conduit fill ratios, and RF material attenuation constraints.

---

## Thesis Core Concepts & Innovations

ArachNet moves beyond basic CAD-style network editing by introducing a spatial deep learning pipeline:

- **Heterogeneous Spatial Graph Formulation (G = (V, E, X, Z)):**
  - **Node Types ($V$):** Active Devices (Switches, APs), Structural Junctions (Conduit elbows, risers, tray intersections), and 3D Wireless Coverage Grids.
  - **Edge Types ($E$):** Physical Pathway Segments (Conduits, trays) and Ray-Cast Wireless Propagation Paths.
- **Constrained Multi-Objective Optimization ($\mathcal{L}_{total}$):**
  Uses a continuous, differentiable penalty function to jointly optimize topology layout while eliminating severe physical engineering violations:
  - **IEEE 802.3 100m Cat6 Limit ($\mathcal{L}_{distance}$):** Enforces a hard quadratic penalty for cable runs exceeding the strict 100-meter copper channel ceiling.
  - **NEC Chapter 9 Conduit Fill ($\mathcal{L}_{capacity}$):** Prevents physical tray/conduit overcrowding by enforcing the 40% maximum fill capacity rule.
  - **RF Attenuation & RSSI Target ($\mathcal{L}_{coverage}$):** Incorporates ITU-R P.1238 ray-cast material attenuation (e.g., concrete shear walls, glass) to eliminate coverage dead zones below **-65 dBm**.
  - **Power-over-Ethernet Budget ($\mathcal{L}_{poe}$):** Balances active powered devices (PDs) against maximum distribution switch wattage capacities (IEEE 802.3bt).
- **Sub-50ms Inference Latency:** Replaces heavy, super-linear deterministic search algorithm $O(|E| + |V|\log|V|)$ like 3D $A^*$ with a single forward GNN link-prediction pass $O(L \cdot |E|)$ for real-time, interactive BIM updates.
- **Bidirectional Digital Twin Synchronization:** Uses active SNMP polling and SSH socket streaming to achieve real-time co-simulation and telemetry mirroring between the 3D viewport and physical switch stacks or virtualized testbeds (EVE-NG / GNS3).

---

## System Architecture & Tech Stack

                    ┌───────────────────────────────┐
                    │       3D CAD / BIM Input      │
                    │         (.DWG / .IFC)         │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
        ┌─────────────────────────────────────────────────┐
        │              FRONTEND VIEWPORT & UX             │
        │                                                 │
        │  React JS  │  Three.js / WebGL  │  Electron JS  │
        │                                                 │
        │  • 3D CAD/BIM visualization                     │
        │  • Interactive topology & spatial navigation    │
        │  • Network state / device visualization         │
        └───────────────────────┬─────────────────────────┘
                                ▲
                                │
                 Bidirectional WebSockets / REST API
                                │
                                ▼
        ┌─────────────────────────────────────────────────┐
        │              GNN REASONING ENGINE               │
        │                                                 │
        │  Python  │  PyTorch Geometric  │  FastAPI       │
        │                                                 │
        │  • R-GCN / HGT graph reasoning                  │
        │  • Spatial & relational representation learning │
        │  • Topology inference                           │
        │  • Network state reasoning                      │
        └───────────────────────┬─────────────────────────┘
                                ▲
                                │
              Southbound Telemetry / Control Interface
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
          SNMP              NETCONF              SSH
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                                ▼
        ┌─────────────────────────────────────────────────┐
        │          PHYSICAL HARDWARE / CO-SIMULATION      │
        │                                                 │
        │     Physical Network Devices                    │
        │     EVE-NG                                      │
        │     GNS3                                        │
        │                                                 │
        │  PySNMP  │  Paramiko  │  EVE-NG/GNS3 APIs       │
        └─────────────────────────────────────────────────┘

---

## Setup & Installation (Soon)

### Prerequisites

- **Node.js:** v18.x or higher
- **Python:** v3.10 or higher
- **NVIDIA GPU:** Recommended with CUDA support for fast GNN inference and WebGL GPU acceleration.

## Empirical Evaluation & Metrics

ArachNet is evaluated across a dataset of 36 multi-floor CAD/BIM blueprints using four core Key Performance Indicators (KPIs):

| Metric                         | Target / Description                                           | Baseline Comparison                              |
| :----------------------------- | :------------------------------------------------------------- | :----------------------------------------------- |
| Violation Reduction Rate (VRR) | % reduction in hidden Cat6 Ethernet runs exceeding > 100m      | vs. Flat 2D Euclidean Estimation                 |
| Cabling Material Savings       | Linear meters saved and local cost efficiency in PHP           | vs. 2D Euclidean & Deterministic 3D A\*          |
| Inference Latency ($t_{exec}$) | < 50 ms execution time for dynamic topology re-computation     | vs. Super-linear 3D A\* search                   |
| Co-Sim Sync Speed ($t_{sync}$) | Round-trip telemetry polling & rendering delay in milliseconds | Evaluated against physical switch stack / EVE-NG |

## Thesis Research Context

Originally NetArch from our Software Engineering Course, now designed and developed as part of an undergraduate research thesis exploring GNN-Assisted, Spatially-Aware Digital Twins for Enterprise Local Area Network Topology Optimization.

- Theoretical Framework: Design Science Research Methodology (DSRM), Heterogeneous Spatial Graph Theory, State-Space Search Complexity, Non-Convex Multi-Objective Optimization.
- Statistical Validation: Evaluated using the Non-Parametric Wilcoxon Signed-Rank Test ($\alpha = 0.05$).

---

## Current Components

### Wired Connectivity and Route Planning

The current UI uses `NetworkManager` for physical Ethernet port occupancy,
speed/duplex negotiation, interface line state, and link up/down behavior. A
connection stores two independent route measurements:

- Logical mode draws topology edges in abstract graph coordinates. Physical
  mode draws the flat, straight-line floorplan baseline. The demo floorplan is
  calibrated at 50 pixels per meter; imported plans need their own scale.
- CAD and Interactive modes draw the 3D route from a structural junction graph.
  The current deterministic A\* baseline snaps endpoints to their nearest
  junction and routes across tray/conduit/riser segments. It tracks 3D length
  and reserves conduit cross-section against the 40% fill ceiling.

The structural graph is demo fixture data, not extracted BIM geometry. The
route is a deterministic research baseline, not a trained GNN result. BIM
junction extraction, project-specific plan calibration, and GNN inference are
future integration steps. Optical links use matching fiber ports and are
excluded from the copper 100-meter channel check.

### Device Configuration and Connectivity Simulation

The Properties panel's **Configure device** dialog writes settings to the same
networking devices used by packet forwarding:

- Ethernet interfaces accept IPv4 CIDR addresses and an on-link default
  gateway. Duplicate addresses and off-link gateways are rejected.
- Switches accept VLAN definitions, access/trunk port assignments, native and
  allowed VLANs, and an STP bridge priority. VLAN rules are enforced by the
  802.1Q switching engine; bridge priority participates in root elections when
  BPDUs are received.
- Routers accept static routes, which are installed in the RIB/FIB. Connected
  routes continue to be derived from operational addressed interfaces.
- The ICMP ping tool sends echo requests through the configured interfaces,
  links, VLANs, ARP, and router forwarding pipeline. It reports echo replies,
  router-generated time-exceeded/destination-unreachable responses, source
  interface/no-route failures, or timeouts when no response returns.

Ping is a synchronous deterministic simulation: a timeout means the traversal
produced no ICMP response, not that a configurable wall-clock timer expired.
The displayed reply time measures local emulator execution and is not modeled
wire latency. STP priority is configurable, but periodic BPDU generation and
timer-driven STP convergence are not yet simulated. Other legacy dialogs
(NAT, OSPF, ACL, DHCP, and management services) are not shown as active
configuration because those behaviors are not implemented in the L2/L3 engine.

---
