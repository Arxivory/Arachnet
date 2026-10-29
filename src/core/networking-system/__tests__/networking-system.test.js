import {
  EthernetInterface,
  NetworkManager,
  NetworkTopology,
  PC,
  PhysicalPort,
  PoeManager,
  Switch,
} from "..";

function makeEndpoint(id, portName) {
  const device = new PC({ id, name: id });
  device.addPort(new PhysicalPort({
    id: `${id}-port`,
    name: portName,
    supportedSpeedsMbps: [100, 1000],
    supportedDuplexModes: ["full"],
  }));
  device.addInterface(new EthernetInterface({
    id: `${id}-interface`,
    name: portName,
    physicalPortId: `${id}-port`,
  }));
  return device;
}

describe("network hardware and topology", () => {
  test("binds logical interfaces to physical ports and negotiates a wired link", () => {
    const accessSwitch = new Switch({ id: "sw-1", name: "Access switch", poeBudgetWatts: 180 });
    accessSwitch.addPort(new PhysicalPort({
      id: "sw-1-port-1",
      name: "GigabitEthernet1/0/1",
      supportedSpeedsMbps: [10, 100, 1000],
      supportedDuplexModes: ["half", "full"],
    }));
    accessSwitch.addInterface(new EthernetInterface({
      id: "sw-1-if-1",
      name: "GigabitEthernet1/0/1",
      physicalPortId: "sw-1-port-1",
    }));
    const workstation = makeEndpoint("pc-1", "Ethernet0");
    const manager = new NetworkManager(new NetworkTopology({ devices: [accessSwitch, workstation] }));

    const link = manager.connectEthernet({
      id: "link-1",
      portAId: "sw-1-port-1",
      portBId: "pc-1-port",
      routePoints: [[0, 0, 0], [30, 0, 0], [30, 0, 2]],
      patchCordLengthMeters: 3,
    });

    expect(link.negotiatedSpeedMbps).toBe(1000);
    expect(link.negotiatedDuplex).toBe("full");
    expect(link.channelLengthMeters).toBe(35);
    expect(link.distanceComplianceStatus).toBe("compliant");
    expect(accessSwitch.ports.get("sw-1-port-1").linkId).toBe("link-1");
    expect(accessSwitch.interfaces.get("sw-1-if-1").isOperational(accessSwitch.ports.get("sw-1-port-1"))).toBe(true);

    manager.setInterfaceAdminEnabled("sw-1", "sw-1-if-1", false);
    expect(accessSwitch.interfaces.get("sw-1-if-1").lineStatus).toBe("down");
    expect(accessSwitch.interfaces.get("sw-1-if-1").isOperational(accessSwitch.ports.get("sw-1-port-1"))).toBe(false);
    expect(manager.topology.toJSON().links).toHaveLength(1);
  });

  test("rejects an occupied port and releases both ports when a link is removed", () => {
    const first = makeEndpoint("pc-1", "Ethernet0");
    const second = makeEndpoint("pc-2", "Ethernet0");
    const third = makeEndpoint("pc-3", "Ethernet0");
    const manager = new NetworkManager(new NetworkTopology({ devices: [first, second, third] }));
    manager.connectEthernet({
      id: "link-1",
      portAId: "pc-1-port",
      portBId: "pc-2-port",
      routePoints: [[0, 0, 0], [2, 0, 0]],
    });

    expect(() => manager.connectEthernet({
      id: "link-2",
      portAId: "pc-1-port",
      portBId: "pc-3-port",
      routePoints: [[0, 0, 0], [2, 0, 0]],
    })).toThrow("only one cable");

    manager.disconnectEthernet("link-1");
    expect(first.ports.get("pc-1-port").linkId).toBeNull();
    expect(second.ports.get("pc-2-port").status).toBe("down");
  });

  test("propagates physical port shutdown to link and interface operational state", () => {
    const first = makeEndpoint("pc-1", "Ethernet0");
    const second = makeEndpoint("pc-2", "Ethernet0");
    const manager = new NetworkManager(new NetworkTopology({ devices: [first, second] }));
    manager.connectEthernet({
      id: "link-1",
      portAId: "pc-1-port",
      portBId: "pc-2-port",
      routePoints: [[0, 0, 0], [2, 0, 0]],
    });

    manager.setPortEnabled("pc-1-port", false);

    expect(manager.topology.links.get("link-1").status).toBe("down");
    expect(second.ports.get("pc-2-port").status).toBe("down");
    expect(first.interfaces.get("pc-1-interface").isOperational(first.ports.get("pc-1-port"))).toBe(false);

    manager.setPortEnabled("pc-1-port", true);
    expect(manager.topology.links.get("link-1").status).toBe("up");
    expect(second.interfaces.get("pc-2-interface").isOperational(second.ports.get("pc-2-port"))).toBe(true);
  });

  test("reports overlength routes and keeps unrouted links unverified", () => {
    const first = makeEndpoint("pc-1", "Ethernet0");
    const second = makeEndpoint("pc-2", "Ethernet0");
    const third = makeEndpoint("pc-3", "Ethernet0");
    const fourth = makeEndpoint("pc-4", "Ethernet0");
    const manager = new NetworkManager(new NetworkTopology({ devices: [first, second, third, fourth] }));
    manager.connectEthernet({
      id: "long-link",
      portAId: "pc-1-port",
      portBId: "pc-2-port",
      routePoints: [[0, 0, 0], [99, 0, 0]],
      patchCordLengthMeters: 2,
    });
    manager.connectEthernet({
      id: "unrouted-link",
      portAId: "pc-3-port",
      portBId: "pc-4-port",
    });

    expect(manager.getDistanceViolations().map((link) => link.id)).toEqual(["long-link"]);
    expect(manager.getUnverifiedPhysicalLinks().map((link) => link.id)).toEqual(["unrouted-link"]);
  });

  test("connects matching optical ports and excludes fiber from the copper channel limit", () => {
    const first = new Switch({
      id: "sw-1",
      name: "Distribution switch",
      profileId: "catalyst-9200l-24t-4g",
    });
    const second = new Switch({
      id: "sw-2",
      name: "Core switch",
      profileId: "catalyst-9200l-24t-4g",
    });
    const portA = [...first.ports.values()].find(({ media }) => media === "fiber");
    const portB = [...second.ports.values()].find(({ media }) => media === "fiber");
    const manager = new NetworkManager(new NetworkTopology({ devices: [first, second] }));

    const link = manager.connectEthernet({
      id: "fiber-link",
      portAId: portA.id,
      portBId: portB.id,
      cableType: "om3",
      routePoints: [[0, 0, 0], [150, 0, 0]],
    });

    expect(link).toMatchObject({
      media: "fiber",
      cableType: "om3",
      negotiatedSpeedMbps: 1000,
      distanceComplianceStatus: "not-applicable",
    });
    const fiberInterface = [...first.interfaces.values()].find(
      (networkInterface) => networkInterface.physicalPortId === portA.id
    );
    expect(fiberInterface.isOperational(portA)).toBe(true);
  });

  test("enforces the configured PoE budget and IEEE standard limit", () => {
    const poe = new PoeManager({ budgetWatts: 30, standard: "802.3at" });
    poe.allocate("ap-1", 15);
    expect(poe.availableWatts).toBe(15);
    expect(() => poe.allocate("ap-2", 16)).toThrow("budget exceeded");
    expect(() => poe.allocate("ap-3", 31)).toThrow("supports at most 30 W");
    expect(poe.release("ap-1")).toBe(true);
    expect(poe.availableWatts).toBe(30);
  });

  test("requires a PoE-capable switch port and respects its per-port ceiling", () => {
    const accessSwitch = new Switch({ id: "sw-1", name: "Access switch", poeBudgetWatts: 60 });
    accessSwitch.addPort(new PhysicalPort({
      id: "poe-port",
      name: "GigabitEthernet1/0/1",
      poe: { standard: "802.3at", maxWatts: 30 },
    }));
    accessSwitch.addPort(new PhysicalPort({ id: "plain-port", name: "GigabitEthernet1/0/2" }));

    accessSwitch.allocatePoe("poe-port", "ap-1", 25);
    expect(accessSwitch.poeManager.availableWatts).toBe(35);
    expect(() => accessSwitch.allocatePoe("plain-port", "ap-2", 10)).toThrow("does not support PoE");
    expect(() => accessSwitch.allocatePoe("poe-port", "ap-3", 31)).toThrow("supports at most 30 W");
    expect(accessSwitch.releasePoe("ap-1")).toBe(true);
  });

  test("validates access and trunk VLAN configuration against the switch database", () => {
    const accessSwitch = new Switch({ id: "sw-1", name: "Access switch" });
    accessSwitch.addPort(new PhysicalPort({ id: "port-1", name: "GigabitEthernet1/0/1" }));
    accessSwitch.addVlan(20, "users");
    accessSwitch.configureAccessPort("port-1", 20);
    expect(accessSwitch.portModes.get("port-1")).toEqual({ mode: "access", accessVlan: 20 });
    expect(() => accessSwitch.configureTrunkPort("port-1", [1, 20, 999], 1)).toThrow("VLAN 999 is not defined");
  });
});
