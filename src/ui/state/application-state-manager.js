import {
  DeviceCatalog,
  EthernetInterface,
  Laptop,
  NetworkManager,
  NetworkTopology,
  PC,
  PhysicalPort,
  Router,
  Server,
  Switch,
  WirelessAP,
} from "../../core/networking-system";
import {
  DEMO_DEVICE_SEEDS,
  DEMO_FLOORS,
  DEMO_LINK_SEEDS,
} from "../Workspace/demo-data";

const DEVICE_CLASSES = {
  switch: Switch,
  router: Router,
  "wireless-ap": WirelessAP,
  pc: PC,
  laptop: Laptop,
  server: Server,
};

const DEMO_PROFILE_IDS = {
  "core-sw": "catalyst-9200l-24t-4g",
  "edge-rtr": "isr-4331",
  "ap-1": "generic-access-point",
  "sw-2": "catalyst-9300-48t",
  "ap-2": "generic-access-point",
  "pc-2": "generic-desktop-pc",
  "sw-3": "catalyst-2924-xl",
  "server-3": "generic-server",
  "ap-3": "generic-access-point",
};

function simulatedMacAddress(deviceId) {
  let hash = 2166136261;
  for (let index = 0; index < deviceId.length; index += 1) {
    hash = Math.imul(hash ^ deviceId.charCodeAt(index), 16777619);
  }
  const suffix = (hash >>> 0).toString(16).padStart(8, "0").slice(-8);
  return `02:00:${suffix.slice(0, 2)}:${suffix.slice(2, 4)}:${suffix.slice(4, 6)}:${suffix.slice(6, 8)}`;
}

function addDefaultEthernetPort(device) {
  if (device.ports.size > 0) return;
  const portId = `${device.id}-port-1`;
  device.addPort(new PhysicalPort({
    id: portId,
    name: "GigabitEthernet0/0",
    supportedSpeedsMbps: [10, 100, 1000],
    supportedDuplexModes: ["full"],
  }));
  device.addInterface(new EthernetInterface({
    id: `${device.id}-interface-1`,
    name: "GigabitEthernet0/0",
    physicalPortId: portId,
    macAddress: simulatedMacAddress(device.id),
  }));
}

function createInstance(profileId, options) {
  const profile = DeviceCatalog.getProfile(profileId);
  const DeviceClass = DEVICE_CLASSES[profile.kind];
  if (!DeviceClass) throw new TypeError(`Unsupported device kind in profile ${profileId}.`);
  return new DeviceClass({ ...options, profileId });
}

function validateViewPosition(position, field) {
  if (!Array.isArray(position) || position.length !== 2 ||
    position.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`${field} must be a finite [x, y] pair.`);
  }
  return [...position];
}

export class ApplicationStateManager {
  constructor({ floors = DEMO_FLOORS, seedDemoTopology = true } = {}) {
    this.floors = floors.map((floor) => ({ ...floor }));
    this.floorById = new Map(this.floors.map((floor) => [floor.id, floor]));
    this.networkManager = new NetworkManager(new NetworkTopology());
    this.placements = new Map();
    this.listeners = new Set();
    this.selectedDeviceId = null;
    this.nextDeviceNumber = 1;
    this.snapshot = null;

    if (seedDemoTopology) this.loadDemoTopology();
    this.publish();
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  loadDemoTopology() {
    for (const seed of DEMO_DEVICE_SEEDS) {
      const profileId = DEMO_PROFILE_IDS[seed.id];
      let device;
      if (profileId) {
        device = createInstance(profileId, {
          id: seed.id,
          name: seed.name,
          floorId: seed.floorId,
          position: seed.position,
        });
      } else {
        const DeviceClass = DEVICE_CLASSES[seed.kind];
        if (!DeviceClass) throw new TypeError(`Unsupported demo device kind: ${seed.kind}.`);
        device = new DeviceClass({
          id: seed.id,
          name: seed.name,
          floorId: seed.floorId,
          position: seed.position,
        });
        addDefaultEthernetPort(device);
      }
      this.networkManager.addDevice(device);
      this.placements.set(device.id, {
        floorplanPosition: [...seed.floorplanPosition],
        logicalPosition: null,
      });
    }

    const nextPortByDeviceId = new Map();
    for (const seedLink of DEMO_LINK_SEEDS) {
      const deviceA = this.networkManager.topology.devices.get(seedLink.deviceAId);
      const deviceB = this.networkManager.topology.devices.get(seedLink.deviceBId);
      if (!deviceA || !deviceB) {
        throw new Error(`Demo link ${seedLink.id} references an unknown device.`);
      }
      const portA = this.getNextAvailablePort(deviceA, nextPortByDeviceId);
      const portB = this.getNextAvailablePort(deviceB, nextPortByDeviceId);
      const link = this.networkManager.connectEthernet({
        id: seedLink.id,
        portAId: portA.id,
        portBId: portB.id,
        routePoints: [
          [...deviceA.transform.position],
          [...deviceB.transform.position],
        ],
      });
      if (seedLink.status === "down") this.networkManager.setPortStatus(portA.id, "down");
      if (link.status !== seedLink.status && seedLink.status !== "down") {
        throw new Error(`Unable to initialize demo link ${seedLink.id}.`);
      }
    }
  }

  getNextAvailablePort(device, nextPortByDeviceId) {
    let portIndex = nextPortByDeviceId.get(device.id) ?? 0;
    const ports = [...device.ports.values()];
    while (portIndex < ports.length && ports[portIndex].linkId) portIndex += 1;
    if (portIndex >= ports.length) {
      throw new Error(`Demo topology requires another Ethernet port on ${device.name}.`);
    }
    nextPortByDeviceId.set(device.id, portIndex + 1);
    return ports[portIndex];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  publish() {
    const devices = [...this.networkManager.topology.devices.values()];
    const links = [...this.networkManager.topology.links.values()].map((link) => {
      const deviceA = this.networkManager.findDeviceForPort(link.portAId);
      const deviceB = this.networkManager.findDeviceForPort(link.portBId);
      const positionA = this.placements.get(deviceA.id)?.floorplanPosition;
      const positionB = this.placements.get(deviceB.id)?.floorplanPosition;
      const floorId = deviceA.floorId === deviceB.floorId ? deviceA.floorId : null;
      return {
        ...link,
        floorId,
        floorplanPoints: floorId && positionA && positionB
          ? [[...positionA], [...positionB]]
          : [],
      };
    });

    this.snapshot = {
      devices,
      links,
      placements: Object.fromEntries([...this.placements].map(([id, placement]) => [
        id,
        {
          floorplanPosition: placement.floorplanPosition
            ? [...placement.floorplanPosition]
            : null,
          logicalPosition: placement.logicalPosition
            ? [...placement.logicalPosition]
            : null,
        },
      ])),
      selectedDeviceId: this.selectedDeviceId,
    };
    this.listeners.forEach((listener) => listener());
  }

  selectDevice(deviceId) {
    if (deviceId !== null && !this.networkManager.topology.devices.has(deviceId)) {
      throw new Error(`Unknown network device: ${deviceId}`);
    }
    if (this.selectedDeviceId === deviceId) return;
    this.selectedDeviceId = deviceId;
    this.publish();
  }

  addDeviceFromProfile(profileId, floorId, placement = {}) {
    if (!this.floorById.has(floorId)) throw new Error(`Unknown floor: ${floorId}`);
    const profile = DeviceCatalog.getProfile(profileId);
    const floorplanPosition = placement.floorplanPosition
      ? validateViewPosition(placement.floorplanPosition, "Floorplan placement")
      : null;
    const logicalPosition = placement.logicalPosition
      ? validateViewPosition(placement.logicalPosition, "Logical placement")
      : null;
    const number = this.nextDeviceNumber;
    const id = `device-${number}`;
    this.nextDeviceNumber += 1;
    const existingModelCount = [...this.networkManager.topology.devices.values()]
      .filter((device) => device.model === profile.model).length;
    const name = existingModelCount > 0
      ? `${profile.model} ${existingModelCount + 1}`
      : profile.model;
    const device = createInstance(profileId, {
      id,
      name,
      floorId,
      position: [4, 4, 0.4],
    });

    this.networkManager.addDevice(device);
    this.placements.set(device.id, {
      floorplanPosition: floorplanPosition
        ? floorplanPosition
        : this.nextFloorplanPosition(floorId),
      logicalPosition,
    });
    this.selectedDeviceId = device.id;
    this.publish();
    return device;
  }

  nextFloorplanPosition(floorId) {
    const count = [...this.networkManager.topology.devices.values()]
      .filter((device) => device.floorId === floorId).length - 1;
    return [180 + (count % 3) * 280, 150 + Math.floor(count / 3) * 190];
  }

  moveDeviceInView(deviceId, coordinateSpace, position) {
    const placement = this.placements.get(deviceId);
    if (!placement) throw new Error(`Unknown network device: ${deviceId}`);
    if (!["logical-2d", "floorplan-2d"].includes(coordinateSpace)) {
      throw new TypeError(`Unsupported 2D coordinate space: ${coordinateSpace}`);
    }
    if (!Array.isArray(position) || position.length !== 2 ||
      position.some((value) => !Number.isFinite(value))) {
      throw new TypeError("Device view position must be a finite [x, y] pair.");
    }
    if (coordinateSpace === "logical-2d") placement.logicalPosition = [...position];
    else placement.floorplanPosition = [...position];
    this.publish();
  }

  renameDevice(deviceId, name) {
    const device = this.networkManager.topology.devices.get(deviceId);
    if (!device) throw new Error(`Unknown network device: ${deviceId}`);
    const normalizedName = name.trim();
    if (!normalizedName) throw new TypeError("Device name cannot be empty.");
    if (device.name === normalizedName) return;
    device.name = normalizedName;
    this.publish();
  }

  setDevicePosition(deviceId, axis, value) {
    const device = this.networkManager.topology.devices.get(deviceId);
    if (!device) throw new Error(`Unknown network device: ${deviceId}`);
    if (!Number.isInteger(axis) || axis < 0 || axis > 2 || !Number.isFinite(value)) {
      throw new TypeError("Device position requires a valid axis and finite value.");
    }
    if (device.transform.position[axis] === value) return;
    device.transform.position[axis] = value;
    this.publish();
  }
}
