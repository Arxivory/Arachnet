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
    expect(device.transform.position).toEqual([4, 4, 5.2]);
    expect(state.getSnapshot().selectedDeviceId).toBe(device.id);
    expect(listener).toHaveBeenCalledTimes(4);
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
