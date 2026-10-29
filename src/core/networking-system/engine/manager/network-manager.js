import { EthernetLink } from "../definitions/ethernet-link";
import { EventBus } from "./event-bus";
import { NetworkEmulator } from "./network-emulator";

export class NetworkTopology {
  constructor({ devices = [], links = [] } = {}) {
    this.devices = new Map();
    this.links = new Map();
    devices.forEach((device) => this.addDevice(device));
    links.forEach((link) => this.addLink(link));
  }

  addDevice(device) {
    if (!device?.id || this.devices.has(device.id)) {
      throw new Error(`Invalid or duplicate network device id: ${device?.id}`);
    }
    const existingPortIds = new Set(
      [...this.devices.values()].flatMap((existing) => [...existing.ports.keys()])
    );
    for (const portId of device.ports.keys()) {
      if (existingPortIds.has(portId)) {
        throw new Error(`Physical port ids must be unique across the topology: ${portId}`);
      }
    }
    this.devices.set(device.id, device);
    return device;
  }

  addLink(link) {
    if (!link?.id || this.links.has(link.id)) {
      throw new Error(`Invalid or duplicate network link id: ${link?.id}`);
    }
    const portA = this.findPort(link.portAId);
    const portB = this.findPort(link.portBId);
    if (portA === portB) throw new Error("A network link must connect two different physical ports.");
    if ((portA.linkId && portA.linkId !== link.id) || (portB.linkId && portB.linkId !== link.id)) {
      throw new Error("A physical port can connect to only one cable.");
    }
    if (!portA.linkId) portA.attachLink(link.id);
    if (!portB.linkId) portB.attachLink(link.id);
    this.links.set(link.id, link);
    return link;
  }

  findPort(portId) {
    for (const device of this.devices.values()) {
      const port = device.ports.get(portId);
      if (port) return port;
    }
    throw new Error(`Network link references unknown physical port: ${portId}`);
  }

  findDeviceForPort(portId) {
    for (const device of this.devices.values()) {
      if (device.ports.has(portId)) return device;
    }
    throw new Error(`Unknown physical port: ${portId}`);
  }

  toJSON() {
    return {
      devices: [...this.devices.values()].map((device) => device.toJSON()),
      links: [...this.links.values()].map((link) => link.toJSON()),
    };
  }
}

export class NetworkManager {
  constructor(topology = new NetworkTopology()) {
    this.topology = topology;
    this.eventBus = new EventBus();
    this.emulator = new NetworkEmulator(this);
    for (const link of topology.links.values()) {
      this.reconcilePortLink(this.findPort(link.portAId), link.status === "up");
      this.syncInterfaceState(this.findPort(link.portAId));
      this.syncInterfaceState(this.findPort(link.portBId));
    }
  }

  addDevice(device) {
    const added = this.topology.addDevice(device);
    this.emit("device-added", { device: added });
    return added;
  }

  connectEthernet({
    id,
    portAId,
    portBId,
    cableType = "cat6",
    routePoints = [],
    junctionIds = [],
    conduitSegmentIds = [],
    routingAlgorithm = null,
    cableAreaMm2 = 0,
    patchCordLengthMeters = 0,
  }) {
    const portA = this.findPort(portAId);
    const portB = this.findPort(portBId);
    if (portA === portB) throw new Error("An Ethernet link must connect two different ports.");
    if (portA.linkId || portB.linkId) throw new Error("A physical port can connect to only one cable.");
    if (portA.media !== portB.media || !["copper", "fiber"].includes(portA.media)) {
      throw new Error("Ethernet links require ports with matching copper or fiber media.");
    }
    const copperCable = ["cat5e", "cat6", "cat6a"].includes(cableType);
    const fiberCable = ["om3", "om4", "os2"].includes(cableType);
    if ((portA.media === "copper" && !copperCable) ||
      (portA.media === "fiber" && !fiberCable)) {
      throw new Error(`Cable type ${cableType} is not compatible with ${portA.media} ports.`);
    }
    if (!portA.enabled || !portB.enabled) {
      throw new Error("Both physical ports must be enabled before connecting a cable.");
    }

    const sharedSpeeds = portA.supportedSpeedsMbps.filter((speed) => portB.supportedSpeedsMbps.includes(speed));
    const sharedDuplex = portA.supportedDuplexModes.filter((mode) => portB.supportedDuplexModes.includes(mode));
    if (!sharedSpeeds.length || !sharedDuplex.length) {
      throw new Error("The ports have no compatible Ethernet speed and duplex mode.");
    }
    const negotiatedSpeedMbps = Math.max(...sharedSpeeds);
    const negotiatedDuplex = sharedDuplex.includes("full") ? "full" : sharedDuplex[0];
    const link = new EthernetLink({
      id,
      portAId,
      portBId,
      cableType,
      routePoints,
      junctionIds,
      conduitSegmentIds,
      routingAlgorithm,
      cableAreaMm2,
      patchCordLengthMeters,
      status: "up",
      negotiatedSpeedMbps,
      negotiatedDuplex,
    });

    if (this.topology.links.has(link.id)) {
      throw new Error(`Network link ${link.id} already exists.`);
    }
    this.topology.addLink(link);
    this.syncInterfaceState(portA);
    this.syncInterfaceState(portB);
    this.emit("link-connected", { link });
    return link;
  }

  disconnectEthernet(linkId) {
    const link = this.topology.links.get(linkId);
    if (!link) throw new Error(`Unknown network link: ${linkId}`);
    const portA = this.findPort(link.portAId);
    const portB = this.findPort(link.portBId);
    for (const port of [portA, portB]) {
      const owner = this.findDeviceForPort(port.id);
      if (owner.kind === "switch") {
        owner.camTable.removePort(port.id);
        owner.spanningTree.removePort(port.id);
      }
    }
    portA.detachLink();
    portB.detachLink();
    this.topology.links.delete(linkId);
    this.syncInterfaceState(portA);
    this.syncInterfaceState(portB);
    this.emit("link-disconnected", { link });
    return link;
  }

  findPort(portId) {
    for (const device of this.topology.devices.values()) {
      const port = device.ports.get(portId);
      if (port) return port;
    }
    throw new Error(`Unknown physical port: ${portId}`);
  }

  findDeviceForPort(portId) {
    return this.topology.findDeviceForPort(portId);
  }

  sendFrame(sourcePortId, frame) {
    return this.emulator.sendFrame(sourcePortId, frame);
  }

  sendIpv4(deviceId, interfaceId, packet, options) {
    return this.emulator.sendIpv4(deviceId, interfaceId, packet, options);
  }

  ping(deviceId, interfaceId, destinationIp, options) {
    return this.emulator.ping(deviceId, interfaceId, destinationIp, options);
  }

  retryArp() {
    return this.emulator.retryArp();
  }

  setPortEnabled(portId, enabled) {
    const port = this.findPort(portId);
    port.setEnabled(enabled);
    this.reconcilePortLink(port, Boolean(enabled));
    this.syncInterfaceState(port);
    return port;
  }

  setPortStatus(portId, status) {
    const port = this.findPort(portId);
    if (status === "up" && (!port.enabled || !port.linkId)) {
      throw new Error("An unconnected or disabled physical port cannot be set up.");
    }
    port.setStatus(status);
    this.reconcilePortLink(port, status === "up");
    this.syncInterfaceState(port);
    return port;
  }

  setInterfaceAdminEnabled(deviceId, interfaceId, enabled) {
    const device = this.topology.devices.get(deviceId);
    if (!device) throw new Error(`Unknown network device: ${deviceId}`);
    const networkInterface = device.interfaces.get(interfaceId);
    if (!networkInterface) throw new Error(`Unknown network interface: ${interfaceId}`);
    networkInterface.adminEnabled = Boolean(enabled);
    if (networkInterface.physicalPortId) {
      this.syncInterfaceState(this.findPort(networkInterface.physicalPortId));
    } else if (!networkInterface.adminEnabled) {
      networkInterface.lineStatus = "down";
    }
    this.emit("interface-admin-state-changed", { device, networkInterface });
    return networkInterface;
  }

  reconcilePortLink(port, allowLinkUp) {
    if (!port.linkId) return;
    const link = this.topology.links.get(port.linkId);
    if (!link) throw new Error(`Port ${port.name} references a missing network link.`);
    const peerPort = this.findPort(link.portAId === port.id ? link.portBId : link.portAId);
    if (port.status === "err-disabled" || peerPort.status === "err-disabled") {
      link.status = "err-disabled";
      if (peerPort.status !== "err-disabled") peerPort.setStatus("down");
    } else if (allowLinkUp && port.enabled && peerPort.enabled) {
      port.setStatus("up");
      peerPort.setStatus("up");
      link.status = "up";
    } else {
      port.setStatus("down");
      peerPort.setStatus("down");
      link.status = "down";
    }
    this.syncInterfaceState(peerPort);
  }

  syncInterfaceState(port) {
    for (const device of this.topology.devices.values()) {
      if (!device.ports.has(port.id)) continue;
      for (const networkInterface of device.interfaces.values()) {
        if (networkInterface.physicalPortId === port.id) {
          networkInterface.lineStatus = port.status === "up" && networkInterface.adminEnabled ? "up" : "down";
        }
      }
      return;
    }
  }

  getDistanceViolations() {
    return [...this.topology.links.values()].filter(
      (link) => link.kind === "ethernet" && link.distanceComplianceStatus === "violated"
    );
  }

  getUnverifiedPhysicalLinks() {
    return [...this.topology.links.values()].filter(
      (link) => link.kind === "ethernet" && link.distanceComplianceStatus === "unverified"
    );
  }

  on(eventName, listener) {
    return this.eventBus.on(eventName, listener);
  }

  emit(eventName, detail) {
    this.eventBus.emit(eventName, detail);
  }
}
