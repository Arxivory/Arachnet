import { ApplicationStateManager } from "./application-state-manager";

describe("ApplicationStateManager", () => {
  test("seeds the workspace with real networking devices and links", () => {
    const state = new ApplicationStateManager();
    const snapshot = state.getSnapshot();

    expect(snapshot.devices).toHaveLength(9);
    expect(snapshot.links).toHaveLength(6);
    expect(snapshot.devices.find(({ id }) => id === "core-sw")).toMatchObject({
      kind: "switch",
      profileId: "catalyst-9200l-24t-4g",
    });
    expect(snapshot.devices.find(({ id }) => id === "core-sw").ports.size).toBe(28);
    expect(snapshot.devices.find(({ id }) => id === "edge-rtr").interfaces.size).toBe(3);
    expect(snapshot.links.every((link) => link.kind === "ethernet")).toBe(true);
    expect(snapshot.links.find(({ id }) => id === "link-core-router").floorId).toBe("floor-1");
    expect(snapshot.links.find(({ id }) => id === "link-sw2-pc").status).toBe("down");
    expect(snapshot.links.every((link) => link.routingAlgorithm === "astar-3d")).toBe(true);
    expect(snapshot.links.every((link) => link.conduitSegmentIds.length > 0)).toBe(true);
    expect(snapshot.links.every((link) =>
      link.maxConduitFillRatio > 0 && link.maxConduitFillRatio <= 0.4
    )).toBe(true);
    expect(snapshot.links.find(({ id }) => id === "link-core-router").planarLengthMeters)
      .toBeLessThan(snapshot.links.find(({ id }) => id === "link-core-router").routedLengthMeters);
  });

  test("adds profile-backed devices and publishes changes to subscribers", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const listener = jest.fn();
    const unsubscribe = state.subscribe(listener);

    const device = state.addDeviceFromProfile("catalyst-9300-48t", "floor-2", {
      floorplanPosition: [425, 280],
    });

    expect(device.profileId).toBe("catalyst-9300-48t");
    expect(device.ports.size).toBe(48);
    expect(state.getSnapshot()).toMatchObject({
      selectedDeviceId: device.id,
      placements: {
        [device.id]: {
          floorplanPosition: [425, 280],
          logicalPosition: null,
        },
      },
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    state.selectDevice(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("tracks selection, 2D placement, renaming, and spatial transform edits", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const device = state.addDeviceFromProfile("isr-4331", "floor-1");
    const listener = jest.fn();
    state.subscribe(listener);

    state.moveDeviceInView(device.id, "logical-2d", [120, 240]);
    state.moveDeviceInView(device.id, "floorplan-2d", [400, 310]);
    state.renameDevice(device.id, "North Wing Router");
    state.setDevicePosition(device.id, 2, 5.2);
    state.selectDevice(device.id);

    expect(state.getSnapshot().placements[device.id]).toEqual({
      floorplanPosition: [400, 310],
      logicalPosition: [120, 240],
    });
    expect(device.name).toBe("North Wing Router");
    expect(device.transform.position).toEqual([3, 3, 5.2]);
    expect(state.getSnapshot().selectedDeviceId).toBe(device.id);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  test("connects actual ports and interfaces, computes separate 2D and routed 3D lengths, and releases reservations", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const first = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const second = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const portA = [...first.ports.values()][0];
    const portB = [...second.ports.values()][0];
    const link = state.connectEthernet(portA.id, portB.id);
    const firstInterface = [...first.interfaces.values()][0];

    expect(link.routingAlgorithm).toBe("astar-3d");
    expect(link.routePoints).toHaveLength(link.junctionIds.length + 2);
    expect(portA.linkId).toBe(link.id);
    expect(firstInterface.isOperational(portA)).toBe(true);
    expect(state.getSnapshot().links[0]).toMatchObject({
      floorId: "floor-1",
      planarDistanceUnit: "m",
      endpointA: { deviceId: first.id, portId: portA.id },
    });
    expect(state.getSnapshot().links[0].planarLengthMeters)
      .not.toBe(state.getSnapshot().links[0].routedLengthMeters);

    state.setEthernetLinkStatus(link.id, "down");
    expect(firstInterface.isOperational(portA)).toBe(false);
    state.setEthernetLinkStatus(link.id, "up");
    expect(firstInterface.isOperational(portA)).toBe(true);

    state.disconnectEthernet(link.id);
    expect(portA.linkId).toBeNull();
    expect(firstInterface.isOperational(portA)).toBe(false);
    expect(state.conduitRouter.reservations.has(link.id)).toBe(false);
    expect(state.getSnapshot().links).toHaveLength(0);
  });

  test("applies interface addressing and switch VLAN settings to the forwarding devices", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const source = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const destination = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const networkSwitch = state.addDeviceFromProfile("catalyst-9200l-24t-4g", "floor-1");
    const sourceInterface = [...source.interfaces.values()][0];
    const destinationInterface = [...destination.interfaces.values()][0];
    const switchPorts = [...networkSwitch.ports.values()];
    state.connectEthernet([...source.ports.values()][0].id, switchPorts[0].id);
    state.connectEthernet([...destination.ports.values()][0].id, switchPorts[1].id);

    state.configureInterface(source.id, sourceInterface.id, {
      ipv4Addresses: ["192.168.10.10/24"],
    });
    state.configureInterface(destination.id, destinationInterface.id, {
      ipv4Addresses: ["192.168.10.20/24"],
    });
    const portModes = [...networkSwitch.ports.keys()].map((portId) => ({
      portId,
      mode: "access",
      accessVlan: 1,
    }));
    portModes[0].accessVlan = 10;
    portModes[1].accessVlan = 10;
    state.configureSwitch(networkSwitch.id, {
      vlans: [{ id: 1, name: "default" }, { id: 10, name: "users" }],
      portModes,
      stpPriority: 4096,
    });

    const result = state.ping(source.id, sourceInterface.id, "192.168.10.20", { count: 1 });
    expect(result[0].status).toBe("reply");
    expect(sourceInterface.ipv4Addresses).toEqual(["192.168.10.10/24"]);
    expect(networkSwitch.portModes.get(switchPorts[0].id)).toEqual({
      mode: "access",
      accessVlan: 10,
    });
    expect(networkSwitch.spanningTree.priority).toBe(4096);

    portModes[1].accessVlan = 1;
    state.configureSwitch(networkSwitch.id, {
      vlans: [{ id: 1, name: "default" }, { id: 10, name: "users" }],
      portModes,
      stpPriority: 4096,
    });
    expect(state.ping(source.id, sourceInterface.id, "192.168.10.20", { count: 1 })[0].status)
      .toBe("timeout");
  });

  test("validates IP configuration and installs router static routes in the FIB", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const pc = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const router = state.addDeviceFromProfile("isr-4331", "floor-1");
    const pcInterface = [...pc.interfaces.values()][0];
    const routerInterface = [...router.interfaces.values()][0];

    state.configureInterface(pc.id, pcInterface.id, {
      ipv4Addresses: ["10.0.0.2/24"],
      defaultGateway: "10.0.0.1",
    });
    expect(() => state.configureInterface(router.id, routerInterface.id, {
      ipv4Addresses: ["10.0.0.2/24"],
    })).toThrow(/already configured/);
    expect(() => state.configureInterface(pc.id, pcInterface.id, {
      ipv4Addresses: ["10.0.0.2/24"],
      defaultGateway: "192.0.2.1",
    })).toThrow(/on a configured interface network/);

    state.configureStaticRoutes(router.id, [{
      destination: "192.0.2.0/24",
      nextHop: "10.0.0.2",
      interfaceId: routerInterface.id,
    }]);
    expect(router.fib.lookup("192.0.2.10")).toMatchObject({
      type: "static",
      interfaceId: routerInterface.id,
    });
  });

  test("reports an unreachable ping when the source has no route", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const pc = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const networkSwitch = state.addDeviceFromProfile("catalyst-9200l-24t-4g", "floor-1");
    const networkInterface = [...pc.interfaces.values()][0];
    state.connectEthernet(
      [...pc.ports.values()][0].id,
      [...networkSwitch.ports.values()][0].id
    );
    state.configureInterface(pc.id, networkInterface.id, {
      ipv4Addresses: ["10.0.0.2/24"],
    });

    expect(state.ping(pc.id, networkInterface.id, "203.0.113.1", { count: 1 })[0])
      .toMatchObject({ status: "unreachable", reason: "no-route" });
  });

  test("routes cross-floor links through a riser and reroutes when a device moves in 3D", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const first = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const second = state.addDeviceFromProfile("generic-desktop-pc", "floor-3");
    const portA = [...first.ports.values()][0];
    const portB = [...second.ports.values()][0];
    const link = state.connectEthernet(portA.id, portB.id);
    const originalRoute = link.routePoints.map((point) => [...point]);

    expect(link.conduitSegmentIds.some((id) => id.includes("vertical-riser"))).toBe(true);
    expect(state.getSnapshot().links[0].planarLengthMeters).toBeNull();

    state.setDevicePosition(first.id, 0, 8);

    expect(link.routePoints[0]).toEqual([8, 3, 0.4]);
    expect(link.routePoints).not.toEqual(originalRoute);
  });

  test("rejects unknown profiles, floors, devices, and invalid placements", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });

    expect(() => state.addDeviceFromProfile("invalid", "floor-1")).toThrow(/Unknown hardware profile/);
    expect(() => state.addDeviceFromProfile("isr-4331", "invalid-floor")).toThrow(/Unknown floor/);
    expect(() => state.selectDevice("missing")).toThrow(/Unknown network device/);
    expect(() => state.moveDeviceInView("missing", "logical-2d", [0, 0])).toThrow(/Unknown network device/);
    expect(() => state.moveDeviceInView(
      state.addDeviceFromProfile("isr-4331", "floor-1").id,
      "logical-2d",
      [Number.NaN, 0]
    )).toThrow(/finite/);
  });
});
