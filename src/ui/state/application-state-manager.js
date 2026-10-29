import {
  DeviceCatalog,
  ConduitRouter,
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
import { createDemoConduitNetwork, DEMO_FLOORPLAN_PIXELS_PER_METER } from "../Workspace/demo-data";

const DEMO_CABLE_DIAMETER_MM = 6.5;

function cableAreaMm2(diameterMm) {
  if (!Number.isFinite(diameterMm) || diameterMm <= 0) {
    throw new TypeError("Cable diameter must be a positive number of millimeters.");
  }
  return Math.PI * (diameterMm / 2) ** 2;
}

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
    this.conduitRouter = new ConduitRouter(createDemoConduitNetwork(this.floors));
    this.placements = new Map();
    this.listeners = new Set();
    this.selectedDeviceId = null;
    this.nextDeviceNumber = 1;
    this.nextLinkNumber = 1;
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
      const link = this.createPlannedLink({
        id: seedLink.id,
        portAId: portA.id,
        portBId: portB.id,
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
      const floorplanPoints = floorId && positionA && positionB
        ? [[...positionA], [...positionB]]
        : [];
      const portA = this.networkManager.findPort(link.portAId);
      const portB = this.networkManager.findPort(link.portBId);
      const planarLengthMeters = floorplanPoints.length === 2
        ? Math.hypot(
          (positionB[0] - positionA[0]) / DEMO_FLOORPLAN_PIXELS_PER_METER,
          (positionB[1] - positionA[1]) / DEMO_FLOORPLAN_PIXELS_PER_METER
        )
        : null;
      const maxConduitFillRatio = link.conduitSegmentIds.length > 0
        ? Math.max(...link.conduitSegmentIds.map((id) =>
          this.conduitRouter.getSegmentFillRatio(id)
        ))
        : null;
      return {
        ...link,
        floorId,
        floorplanPoints,
        planarLengthMeters,
        planarDistanceUnit: planarLengthMeters === null ? null : "m",
        routedLengthMeters: link.routedLengthMeters,
        channelLengthMeters: link.channelLengthMeters,
        distanceComplianceStatus: link.distanceComplianceStatus,
        maxConduitFillRatio,
        endpointA: {
          deviceId: deviceA.id,
          deviceName: deviceA.name,
          portId: portA.id,
          portName: portA.name,
          interfaceName: [...deviceA.interfaces.values()]
            .find((networkInterface) => networkInterface.physicalPortId === portA.id)?.name ?? null,
        },
        endpointB: {
          deviceId: deviceB.id,
          deviceName: deviceB.name,
          portId: portB.id,
          portName: portB.name,
          interfaceName: [...deviceB.interfaces.values()]
            .find((networkInterface) => networkInterface.physicalPortId === portB.id)?.name ?? null,
        },
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

  worldPosition(device) {
    const floor = this.floorById.get(device.floorId);
    if (!floor) throw new Error(`Device ${device.id} has no known floor for spatial routing.`);
    const [x, y, z] = device.transform.position;
    return [x, y, z + floor.zMin];
  }

  createPlannedLink({
    id,
    portAId,
    portBId,
    cableType = "cat6",
    cableDiameterMm = DEMO_CABLE_DIAMETER_MM,
    status = "up",
  }) {
    const deviceA = this.networkManager.findDeviceForPort(portAId);
    const deviceB = this.networkManager.findDeviceForPort(portBId);
    const area = cableAreaMm2(cableDiameterMm);
    const route = this.conduitRouter.route(
      this.worldPosition(deviceA),
      this.worldPosition(deviceB),
      { cableAreaMm2: area }
    );
    this.conduitRouter.reserveRoute(id, route, area);
    try {
      const link = this.networkManager.connectEthernet({
        id,
        portAId,
        portBId,
        cableType,
        routePoints: route.routePoints,
        junctionIds: route.junctionIds,
        conduitSegmentIds: route.segmentIds,
        routingAlgorithm: route.algorithm,
        cableAreaMm2: area,
      });
      if (status === "down") this.networkManager.setPortStatus(portAId, "down");
      return link;
    } catch (error) {
      this.conduitRouter.releaseRoute(id);
      throw error;
    }
  }

  connectEthernet(portAId, portBId, { cableType = "cat6", cableDiameterMm = DEMO_CABLE_DIAMETER_MM } = {}) {
    const id = `link-${this.nextLinkNumber}`;
    const link = this.createPlannedLink({ id, portAId, portBId, cableType, cableDiameterMm });
    this.nextLinkNumber += 1;
    this.publish();
    return link;
  }

  disconnectEthernet(linkId) {
    const link = this.networkManager.disconnectEthernet(linkId);
    this.conduitRouter.releaseRoute(linkId);
    this.publish();
    return link;
  }

  setEthernetLinkStatus(linkId, status) {
    const link = this.networkManager.topology.links.get(linkId);
    if (!link) throw new Error(`Unknown network link: ${linkId}`);
    this.networkManager.setPortStatus(link.portAId, status);
    this.publish();
    return link;
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
    const spatialPosition = this.nextSpatialPosition(floorId);
    const device = createInstance(profileId, {
      id,
      name,
      floorId,
      position: spatialPosition,
    });

    this.networkManager.addDevice(device);
    this.placements.set(device.id, {
      floorplanPosition: floorplanPosition
        ? floorplanPosition
        : this.nextFloorplanPosition(spatialPosition),
      logicalPosition,
    });
    this.selectedDeviceId = device.id;
    this.publish();
    return device;
  }

  nextFloorplanPosition(spatialPosition) {
    return [
      spatialPosition[0] * DEMO_FLOORPLAN_PIXELS_PER_METER,
      spatialPosition[1] * DEMO_FLOORPLAN_PIXELS_PER_METER,
    ];
  }

  nextSpatialPosition(floorId) {
    const count = [...this.networkManager.topology.devices.values()]
      .filter((device) => device.floorId === floorId).length;
    return [3 + (count % 4) * 4, 3 + Math.floor(count / 4) * 3, 0.4];
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
    const previousPosition = [...device.transform.position];
    device.transform.position[axis] = value;
    try {
      this.rerouteLinksForDevice(deviceId);
    } catch (error) {
      device.transform.position = previousPosition;
      throw error;
    }
    this.publish();
  }

  setInterfaceAdminEnabled(deviceId, interfaceId, enabled) {
    const networkInterface = this.networkManager.setInterfaceAdminEnabled(
      deviceId,
      interfaceId,
      enabled
    );
    this.publish();
    return networkInterface;
  }

  rerouteLinksForDevice(deviceId) {
    const connectedLinks = [...this.networkManager.topology.links.values()].filter((link) =>
      this.networkManager.findDeviceForPort(link.portAId).id === deviceId ||
      this.networkManager.findDeviceForPort(link.portBId).id === deviceId
    );
    if (connectedLinks.length === 0) return;

    const previousRoutes = connectedLinks.map((link) => ({
      link,
      routePoints: link.routePoints.map((point) => [...point]),
      junctionIds: [...link.junctionIds],
      conduitSegmentIds: [...link.conduitSegmentIds],
      routingAlgorithm: link.routingAlgorithm,
    }));
    connectedLinks.forEach(({ id }) => this.conduitRouter.releaseRoute(id));

    try {
      for (const link of connectedLinks) {
        const deviceA = this.networkManager.findDeviceForPort(link.portAId);
        const deviceB = this.networkManager.findDeviceForPort(link.portBId);
        const route = this.conduitRouter.route(
          this.worldPosition(deviceA),
          this.worldPosition(deviceB),
          { cableAreaMm2: link.cableAreaMm2 }
        );
        this.conduitRouter.reserveRoute(link.id, route, link.cableAreaMm2);
        link.routePoints = route.routePoints;
        link.junctionIds = route.junctionIds;
        link.conduitSegmentIds = route.segmentIds;
        link.routingAlgorithm = route.algorithm;
      }
    } catch (error) {
      connectedLinks.forEach(({ id }) => this.conduitRouter.releaseRoute(id));
      for (const previous of previousRoutes) {
        previous.link.routePoints = previous.routePoints;
        previous.link.junctionIds = previous.junctionIds;
        previous.link.conduitSegmentIds = previous.conduitSegmentIds;
        previous.link.routingAlgorithm = previous.routingAlgorithm;
        this.conduitRouter.reserveRoute(
          previous.link.id,
          { segmentIds: previous.conduitSegmentIds },
          previous.link.cableAreaMm2
        );
      }
      throw error;
    }
  }
}
