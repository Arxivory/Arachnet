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
  StaticRoute,
  Switch,
  WirelessAP,
} from "../../core/networking-system";
import { ipv4PrefixContains, ipv4ToInt, parseIpv4Cidr } from "../../core/networking-system/engine/utils/ipv4";
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
    this.nextPingSequence = 1;
    this.pingResults = [];
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
          floorId: deviceA.floorId,
          portId: portA.id,
          portName: portA.name,
          interfaceName: [...deviceA.interfaces.values()]
            .find((networkInterface) => networkInterface.physicalPortId === portA.id)?.name ?? null,
        },
        endpointB: {
          deviceId: deviceB.id,
          deviceName: deviceB.name,
          floorId: deviceB.floorId,
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
      pingResults: this.pingResults.map((result) => ({ ...result })),
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

  configureInterface(deviceId, interfaceId, { ipv4Addresses, defaultGateway = "" }) {
    const device = this.networkManager.topology.devices.get(deviceId);
    if (!device) throw new Error(`Unknown network device: ${deviceId}`);
    const networkInterface = device.interfaces.get(interfaceId);
    if (!networkInterface) throw new Error(`Unknown network interface: ${interfaceId}`);
    if (!Array.isArray(ipv4Addresses)) {
      throw new TypeError("IPv4 addresses must be provided as a list of CIDR prefixes.");
    }

    const normalizedAddresses = ipv4Addresses.map((address) => {
      const parsed = parseIpv4Cidr(address.trim());
      return `${parsed.address}/${parsed.prefixLength}`;
    });
    if (new Set(normalizedAddresses.map((address) => address.split("/")[0])).size !==
      normalizedAddresses.length) {
      throw new TypeError("An interface cannot have duplicate IPv4 addresses.");
    }

    const gateway = defaultGateway.trim() || null;
    if (device.kind === "router" && gateway) {
      throw new TypeError("Configure router gateways as static routes, not interface default gateways.");
    }
    if (gateway) {
      ipv4ToInt(gateway);
      if (!normalizedAddresses.some((address) => ipv4PrefixContains(address, gateway))) {
        throw new TypeError("The default gateway must be on a configured interface network.");
      }
    }

    const configuredAddresses = new Set(normalizedAddresses.map((address) => address.split("/")[0]));
    for (const otherDevice of this.networkManager.topology.devices.values()) {
      for (const otherInterface of otherDevice.interfaces.values()) {
        if (otherInterface === networkInterface) continue;
        if (otherInterface.ipv4Addresses.some((address) =>
          configuredAddresses.has(address.split("/")[0])
        )) {
          throw new TypeError("An IPv4 address is already configured on another interface.");
        }
      }
    }

    networkInterface.ipv4Addresses = normalizedAddresses;
    networkInterface.defaultGateway = gateway;
    this.networkManager.emit("interface-addresses-changed", { device, networkInterface });
    this.publish();
    return networkInterface;
  }

  configureSwitch(deviceId, { vlans, portModes, sviAddresses = [], stpPriority }) {
    const device = this.networkManager.topology.devices.get(deviceId);
    if (!device) throw new Error(`Unknown network device: ${deviceId}`);
    if (device.kind !== "switch") throw new TypeError("VLAN and STP settings require a switch.");
    if (!Array.isArray(vlans) || !Array.isArray(portModes)) {
      throw new TypeError("Switch configuration requires VLAN and port-mode lists.");
    }
    if (!Number.isInteger(stpPriority) || stpPriority < 0 || stpPriority > 61440 ||
      stpPriority % 4096 !== 0) {
      throw new RangeError("STP priority must be a multiple of 4096 from 0 through 61440.");
    }

    const vlanMap = new Map();
    for (const vlan of vlans) {
      if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094 ||
        typeof vlan.name !== "string" || !vlan.name.trim() || vlanMap.has(vlan.id)) {
        throw new TypeError("VLANs require unique IDs from 1 through 4094 and non-empty names.");
      }
      vlanMap.set(vlan.id, { id: vlan.id, name: vlan.name.trim() });
    }
    if (!vlanMap.has(1)) throw new TypeError("VLAN 1 must remain configured.");

    const sviMap = new Map();
    for (const setting of sviAddresses) {
      if (!vlanMap.has(setting.vlanId) || sviMap.has(setting.vlanId)) {
        throw new TypeError(`Invalid or duplicate SVI VLAN: ${setting.vlanId}`);
      }
      if (!setting.address) continue;
      const parsedAddress = parseIpv4Cidr(setting.address);
      if (parsedAddress.prefixLength === 0) {
        throw new TypeError("An SVI prefix length must be from 1 through 32.");
      }
      sviMap.set(setting.vlanId, `${parsedAddress.address}/${parsedAddress.prefixLength}`);
    }
    const sviIps = new Set([...sviMap.values()].map((address) => address.split("/")[0]));
    if (sviIps.size !== sviMap.size) {
      throw new TypeError("Switch SVIs cannot have duplicate IPv4 addresses.");
    }
    for (const otherDevice of this.networkManager.topology.devices.values()) {
      for (const networkInterface of otherDevice.interfaces.values()) {
        if (otherDevice === device && networkInterface.vlanId != null) continue;
        if (networkInterface.ipv4Addresses.some((address) => sviIps.has(address.split("/")[0]))) {
          throw new TypeError("An IPv4 address is already configured on another interface.");
        }
      }
    }

    const modeMap = new Map();
    if (portModes.length !== device.ports.size) {
      throw new TypeError("Every switch port must have a VLAN mode configured.");
    }
    for (const setting of portModes) {
      if (!device.ports.has(setting.portId) || modeMap.has(setting.portId)) {
        throw new TypeError(`Invalid or duplicate switch port: ${setting.portId}`);
      }
      if (setting.mode === "access") {
        if (!vlanMap.has(setting.accessVlan)) {
          throw new TypeError(`Access VLAN ${setting.accessVlan} is not defined.`);
        }
        modeMap.set(setting.portId, { mode: "access", accessVlan: setting.accessVlan });
      } else if (setting.mode === "trunk") {
        if (!Array.isArray(setting.allowedVlans) ||
          !setting.allowedVlans.includes(setting.nativeVlan) ||
          setting.allowedVlans.some((vlanId) => !vlanMap.has(vlanId))) {
          throw new TypeError("A trunk must allow its native VLAN and only configured VLANs.");
        }
        modeMap.set(setting.portId, {
          mode: "trunk",
          allowedVlans: [...new Set(setting.allowedVlans)].sort((a, b) => a - b),
          nativeVlan: setting.nativeVlan,
        });
      } else {
        throw new TypeError(`Unsupported switch port mode: ${setting.mode}`);
      }
    }

    for (const vlanId of device.vlans.keys()) {
      if (!vlanMap.has(vlanId)) device.removeVlan(vlanId);
    }
    for (const vlan of vlanMap.values()) {
      device.vlans.set(vlan.id, vlan);
      device.ensureVlanInterface(vlan.id);
      device.configureSvi(vlan.id, sviMap.get(vlan.id) ?? "");
    }
    device.vlans = vlanMap;
    device.portModes = modeMap;
    for (const vlanId of device.vlanInterfaces.keys()) device.syncVlanInterfaceState(vlanId);
    device.spanningTree.priority = stpPriority;
    device.spanningTree.recomputeRoot();
    this.networkManager.emit("switch-configuration-changed", { device });
    this.publish();
    return device;
  }

  configureStaticRoutes(deviceId, routes) {
    const device = this.networkManager.topology.devices.get(deviceId);
    if (!device) throw new Error(`Unknown network device: ${deviceId}`);
    if (device.kind !== "router") throw new TypeError("Static routes require a router.");
    if (!Array.isArray(routes)) throw new TypeError("Static routes must be provided as a list.");

    const configuredRoutes = routes.map((route) => {
      const configured = new StaticRoute(route);
      if (configured.interfaceId && !device.interfaces.has(configured.interfaceId)) {
        throw new TypeError(`Unknown route interface: ${configured.interfaceId}`);
      }
      return configured;
    });
    const staticEntries = configuredRoutes.map((route) => ({ ...route, type: "static" }));
    device.staticRoutes = configuredRoutes;
    device.rib.routes = [
      ...device.rib.routes.filter((route) => route.type === "connected"),
      ...staticEntries,
    ];
    device.fib.replaceRoutes(device.rib.getRoutes());
    this.publish();
    return configuredRoutes;
  }

  ping(deviceId, interfaceId, destinationIp, { count = 4, ttl = 64 } = {}) {
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      throw new RangeError("Ping count must be an integer from 1 through 10.");
    }
    ipv4ToInt(destinationIp);
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255) {
      throw new RangeError("Ping TTL must be an integer from 1 through 255.");
    }

    const results = [];
    for (let index = 0; index < count; index += 1) {
      const sequence = this.nextPingSequence;
      this.nextPingSequence += 1;
      try {
        results.push(this.networkManager.ping(deviceId, interfaceId, destinationIp, {
          ttl,
          sequence,
        }));
      } catch (error) {
        if (error.message.startsWith("No route to ")) {
          const device = this.networkManager.topology.devices.get(deviceId);
          const networkInterface = device?.interfaces.get(interfaceId);
          results.push({
            status: "unreachable",
            sourceIp: networkInterface?.ipv4Addresses[0]?.split("/")[0] ?? null,
            destinationIp,
            sequence,
            roundTripTimeMs: null,
            reason: "no-route",
            transmissions: 0,
          });
        } else {
          throw error;
        }
      }
    }
    this.pingResults = [...results, ...this.pingResults].slice(0, 50);
    this.publish();
    return results;
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
