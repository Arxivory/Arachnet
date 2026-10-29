import { Device, DeviceCatalog, Router, Switch } from "..";

describe("Cisco hardware device catalog", () => {
  test.each([
    ["catalyst-2924-xl", Switch, 24, "FastEthernet0/1", "FastEthernet0/24"],
    ["catalyst-9200l-24t-4g", Switch, 28, "GigabitEthernet1/0/1", "GigabitEthernet1/1/4"],
    ["catalyst-9300-48t", Switch, 48, "GigabitEthernet1/0/1", "GigabitEthernet1/0/48"],
    ["isr-4331", Router, 3, "GigabitEthernet0/0/0", "GigabitEthernet0/0/2"],
    ["cisco-1941", Router, 2, "GigabitEthernet0/0", "GigabitEthernet0/1"],
  ])("loads %s inventory into the matching device class", (profileId, DeviceClass, portCount, firstName, lastName) => {
    const device = new DeviceClass({
      id: `${profileId}-instance`,
      name: profileId,
      profileId,
    });
    const ports = [...device.ports.values()];
    const interfaces = [...device.interfaces.values()];

    expect(device.profileId).toBe(profileId);
    expect(device.model).toBe(Device.loadHardwareProfile(profileId).model);
    expect(ports).toHaveLength(portCount);
    expect(ports[0].name).toBe(firstName);
    expect(ports[ports.length - 1].name).toBe(lastName);
    expect(interfaces).toHaveLength(portCount);
    expect(interfaces.every((networkInterface) =>
      device.ports.has(networkInterface.physicalPortId) &&
      networkInterface.macAddress.startsWith("02:")
    )).toBe(true);
    expect(new Set(interfaces.map(({ macAddress }) => macAddress)).size).toBe(portCount);
    expect(device.toJSON().hardwareProfile.id).toBe(profileId);
  });

  test("loads SFP uplinks and hardware capabilities without treating modules as installed", () => {
    const switchDevice = new Switch({
      id: "closet-sw",
      name: "Closet switch",
      profileId: "catalyst-9200l-24t-4g",
    });
    const uplink = [...switchDevice.ports.values()][27];

    expect(switchDevice.switchingMode).toBe("layer2");
    expect(uplink.name).toBe("GigabitEthernet1/1/4");
    expect(uplink.media).toBe("fiber");
    expect(uplink.connector).toBe("SFP");
    expect(switchDevice.hardwareProfile.capabilities.layer3).toBe(true);
  });

  test("lists catalog profiles and returns independent profile data", () => {
    const profile = DeviceCatalog.getProfile("catalyst-9300-48t");
    profile.portGroups[0].count = 1;

    expect(DeviceCatalog.getProfile("catalyst-9300-48t").portGroups[0].count).toBe(48);
    expect(DeviceCatalog.listProfiles({ kind: "router" }).map(({ id }) => id)).toEqual([
      "isr-4331",
      "cisco-1941",
    ]);
  });

  test("rejects unknown and incompatible profiles while preserving generic devices", () => {
    expect(() => Device.loadHardwareProfile("unknown-device")).toThrow("Unknown hardware profile");
    expect(() => new Switch({ id: "bad", name: "Bad", profileId: "isr-4331" })).toThrow("is for router");
    const genericSwitch = new Switch({ id: "generic", name: "Generic switch" });
    expect(genericSwitch.model).toBe("generic");
    expect(genericSwitch.ports.size).toBe(0);
  });
});
