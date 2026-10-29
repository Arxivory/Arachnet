import { EthernetFrame, ETHER_TYPE } from "../definitions/frame";
import { IPv4Packet, IP_PROTOCOL } from "../definitions/packet";
import { RouterEngine } from "../core/router-engine";
import { SwitchEngine } from "../core/switch-engine";
import { ArpCache } from "../state/arp-cache";
import { ICMP_TYPE, Icmp } from "../protocols/l3/icmp";
import { ipv4PrefixContains, ipv4ToInt } from "../utils/ipv4";

const BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";
const MAX_HOPS_PER_SIMULATION = 512;

export class NetworkEmulator {
  constructor(networkManager) {
    this.networkManager = networkManager;
    this.switchEngine = new SwitchEngine();
    this.routerEngine = new RouterEngine();
    this.endpointArp = new Map();
    this.clock = () => Date.now();
  }

  ping(deviceId, interfaceId, destinationIp, { ttl = 64, sequence = 1 } = {}) {
    const device = this.requireDevice(deviceId);
    const networkInterface = device.interfaces.get(interfaceId);
    if (!networkInterface) throw new Error(`Unknown network interface ${interfaceId} on ${device.name}.`);
    const sourceAddress = networkInterface.ipv4Addresses[0]?.split("/")[0];
    if (!sourceAddress) throw new Error(`Interface ${networkInterface.name} has no IPv4 address.`);
    const port = device.ports.get(networkInterface.physicalPortId);
    if (!networkInterface.isOperational(port)) {
      return {
        status: "unreachable",
        sourceIp: sourceAddress,
        destinationIp,
        sequence,
        roundTripTimeMs: null,
        reason: "interface-down",
        transmissions: 0,
      };
    }
    if (device.kind === "router") {
      this.routerEngine.refreshRoutes(device);
      if (!device.fib.lookup(destinationIp)) {
        return {
          status: "unreachable",
          sourceIp: sourceAddress,
          destinationIp,
          sequence,
          roundTripTimeMs: null,
          reason: "no-route",
          transmissions: 0,
        };
      }
    }

    const startedAt = performance.now();
    const packet = new IPv4Packet({
      sourceIp: sourceAddress,
      destinationIp,
      protocol: IP_PROTOCOL.ICMP,
      ttl,
      payload: {
        type: ICMP_TYPE.ECHO_REQUEST,
        code: 0,
        identifier: 1,
        sequence,
      },
    });
    const result = device.kind === "router"
      ? this.sendRouterIpv4(device, packet)
      : this.sendIpv4(deviceId, interfaceId, packet);
    const finishedAt = performance.now();
    const response = result.delivered.find(({ deviceId: recipientId, packet }) =>
      recipientId === deviceId &&
      packet.protocol === IP_PROTOCOL.ICMP &&
      [ICMP_TYPE.ECHO_REPLY, ICMP_TYPE.DESTINATION_UNREACHABLE, ICMP_TYPE.TIME_EXCEEDED]
        .includes(packet.payload?.type)
    );

    if (!response) {
      return {
        status: "timeout",
        sourceIp: sourceAddress,
        destinationIp,
        sequence,
        roundTripTimeMs: null,
        reason: result.dropped[0]?.reason ?? "no-icmp-response",
        transmissions: result.transmissions,
      };
    }

    const { type, code } = response.packet.payload;
    return {
      status: type === ICMP_TYPE.ECHO_REPLY
        ? "reply"
        : type === ICMP_TYPE.TIME_EXCEEDED
          ? "time-exceeded"
          : "unreachable",
      sourceIp: sourceAddress,
      destinationIp,
      sequence,
      roundTripTimeMs: Math.max(0, finishedAt - startedAt),
      code: type === ICMP_TYPE.ECHO_REPLY ? 0 : code,
      responderIp: response.packet.sourceIp,
      transmissions: result.transmissions,
    };
  }

  sendRouterIpv4(router, packet) {
    const routed = this.routerEngine.routePacket(router, packet);
    const result = { delivered: [], dropped: [], transmissions: 0 };
    if (routed.dropped) result.dropped.push({ reason: routed.reason });
    for (const output of routed.outputs) {
      const transmission = this.sendFrame(output.portId, output.frame);
      result.delivered.push(...transmission.delivered);
      result.dropped.push(...transmission.dropped);
      result.transmissions += transmission.transmissions;
    }
    return result;
  }

  sendIpv4(deviceId, interfaceId, packet, { nextHopIp = null } = {}) {
    const device = this.requireDevice(deviceId);
    const networkInterface = device.interfaces.get(interfaceId);
    if (!networkInterface || !networkInterface.physicalPortId) {
      throw new Error(`Unknown physical interface ${interfaceId} on ${device.name}.`);
    }
    if (!(packet instanceof IPv4Packet)) throw new TypeError("sendIpv4 requires an IPv4Packet.");
    const sourceAddress = networkInterface.ipv4Addresses.find(
      (value) => value.split("/")[0] === packet.sourceIp
    );
    if (!sourceAddress) throw new Error(`${packet.sourceIp} is not configured on ${networkInterface.name}.`);
    const port = device.ports.get(networkInterface.physicalPortId);
    if (!networkInterface.isOperational(port)) throw new Error(`Interface ${networkInterface.name} is down.`);
    nextHopIp = this.resolveNextHop(networkInterface, packet.destinationIp, nextHopIp);
    const arpCache = this.getEndpointArp(device.id, interfaceId);
    const destinationMac = arpCache.lookup(nextHopIp);
    if (destinationMac) {
      return this.sendFrame(port.id, new EthernetFrame({
        sourceMac: networkInterface.macAddress,
        destinationMac,
        etherType: ETHER_TYPE.IPV4,
        payload: packet,
      }));
    }

    arpCache.queue(nextHopIp, { packet, interfaceId });
    const attempt = arpCache.recordRequest(nextHopIp);
    if (attempt.exhausted) {
      this.networkManager.emit("packet-dropped", { deviceId, reason: "arp-retry-exhausted", packet });
      return { delivered: [], dropped: [{ reason: "arp-retry-exhausted" }], transmissions: 0 };
    }
    return this.sendFrame(port.id, this.createArpRequest(networkInterface, nextHopIp));
  }

  resolveNextHop(networkInterface, destinationIp, requestedNextHop = null) {
    if (requestedNextHop) {
      ipv4ToInt(requestedNextHop);
      return requestedNextHop;
    }
    if (networkInterface.ipv4Addresses.some((cidr) => ipv4PrefixContains(cidr, destinationIp))) {
      return destinationIp;
    }
    if (networkInterface.defaultGateway) {
      ipv4ToInt(networkInterface.defaultGateway);
      return networkInterface.defaultGateway;
    }
    throw new Error(`No route to ${destinationIp} on interface ${networkInterface.name}.`);
  }

  sendIpv4FromEndpoint(context, device, networkInterface, packet) {
    const nextHopIp = this.resolveNextHop(networkInterface, packet.destinationIp);
    const interfaceId = networkInterface.id;
    const arpCache = this.getEndpointArp(device.id, interfaceId);
    const destinationMac = arpCache.lookup(nextHopIp);
    if (destinationMac) {
      this.enqueueFromPort(context, networkInterface.physicalPortId, new EthernetFrame({
        sourceMac: networkInterface.macAddress,
        destinationMac,
        etherType: ETHER_TYPE.IPV4,
        payload: packet,
      }));
      return;
    }

    arpCache.queue(nextHopIp, { packet, interfaceId });
    const attempt = arpCache.recordRequest(nextHopIp);
    if (attempt.exhausted) return;
    this.enqueueFromPort(context, networkInterface.physicalPortId, this.createArpRequest(networkInterface, nextHopIp));
  }

  sendFrame(sourcePortId, frame) {
    const context = {
      queue: [],
      visited: new Set(),
      delivered: [],
      dropped: [],
      transmissions: 0,
    };
    this.enqueueFromPort(context, sourcePortId, frame);
    while (context.queue.length && context.transmissions < MAX_HOPS_PER_SIMULATION) {
      const current = context.queue.shift();
      const visitKey = `${current.device.id}:${current.portId}:${current.frame.etherType}:${current.frame.sourceMac}:${current.frame.destinationMac}`;
      if (context.visited.has(visitKey)) {
        context.dropped.push({ reason: "loop-prevented", deviceId: current.device.id, portId: current.portId });
        continue;
      }
      context.visited.add(visitKey);
      context.transmissions += 1;
      this.networkManager.emit("frame-received", {
        deviceId: current.device.id,
        portId: current.portId,
        frame: current.frame,
      });

      if (current.device.kind === "switch") {
        const result = this.switchEngine.processIngress(current.device, current.portId, current.frame);
        if (result.dropped) {
          context.dropped.push({ deviceId: current.device.id, portId: current.portId, reason: result.reason });
        }
        for (const output of result.outputs) this.enqueueFromPort(context, output.portId, output.frame);
      } else if (current.device.kind === "router") {
        const result = this.routerEngine.processIngress(current.device, current.portId, current.frame);
        if (result.dropped) {
          context.dropped.push({ deviceId: current.device.id, portId: current.portId, reason: result.reason });
          this.networkManager.emit("packet-dropped", {
            deviceId: current.device.id,
            reason: result.reason,
            packet: result.packet,
          });
        }
        if (result.deliveredPacket) {
          context.delivered.push({ deviceId: current.device.id, packet: result.deliveredPacket });
        }
        for (const output of result.outputs) this.enqueueFromPort(context, output.portId, output.frame);
      } else {
        this.processEndpoint(context, current.device, current.portId, current.frame);
      }
    }

    if (context.queue.length) {
      context.dropped.push({ reason: "simulation-hop-limit" });
      this.networkManager.emit("packet-dropped", { reason: "simulation-hop-limit" });
    }
    return {
      delivered: context.delivered,
      dropped: context.dropped,
      transmissions: context.transmissions,
    };
  }

  retryArp() {
    const results = [];
    for (const device of this.networkManager.topology.devices.values()) {
      if (device.kind === "router") {
        for (const ipAddress of device.arpCache.dueRequests()) {
          const queued = device.arpCache.pending.get(ipAddress);
          const networkInterface = device.interfaces.get(queued?.packets[0]?.interfaceId);
          if (!networkInterface) continue;
          const attempt = device.arpCache.recordRequest(ipAddress);
          if (attempt.exhausted) {
            this.networkManager.emit("arp-failed", { deviceId: device.id, ipAddress });
            results.push({ deviceId: device.id, ipAddress, failed: true });
          } else {
            results.push(this.sendFrame(
              networkInterface.physicalPortId,
              this.createArpRequest(networkInterface, ipAddress)
            ));
          }
        }
      }
      for (const networkInterface of device.interfaces.values()) {
        const cache = this.getEndpointArp(device.id, networkInterface.id);
        for (const ipAddress of cache.dueRequests()) {
          const attempt = cache.recordRequest(ipAddress);
          if (attempt.exhausted) {
            this.networkManager.emit("arp-failed", { deviceId: device.id, ipAddress });
            results.push({ deviceId: device.id, ipAddress, failed: true });
          } else {
            results.push(this.sendFrame(
              networkInterface.physicalPortId,
              this.createArpRequest(networkInterface, ipAddress)
            ));
          }
        }
      }
    }
    return results;
  }

  enqueueFromPort(context, portId, frame) {
    const sourcePort = this.networkManager.findPort(portId);
    const link = this.networkManager.topology.links.get(sourcePort.linkId);
    if (!link || link.status !== "up") {
      context.dropped.push({ portId, reason: "link-down" });
      return;
    }
    const peerPortId = link.portAId === portId ? link.portBId : link.portAId;
    const peerPort = this.networkManager.findPort(peerPortId);
    if (peerPort.status !== "up") {
      context.dropped.push({ portId: peerPortId, reason: "peer-port-down" });
      return;
    }
    const device = this.networkManager.findDeviceForPort(peerPortId);
    context.queue.push({ device, portId: peerPortId, frame });
  }

  processEndpoint(context, device, ingressPortId, frame) {
    const networkInterface = [...device.interfaces.values()].find(
      (item) => item.physicalPortId === ingressPortId
    );
    if (!networkInterface || !networkInterface.isOperational(device.ports.get(ingressPortId))) {
      context.dropped.push({ deviceId: device.id, reason: "endpoint-interface-down" });
      return;
    }
    const arpCache = this.getEndpointArp(device.id, networkInterface.id);
    if (frame.etherType === ETHER_TYPE.ARP) {
      const arp = frame.payload;
      if (!arp || !["request", "reply"].includes(arp.operation)) {
        context.dropped.push({ deviceId: device.id, reason: "invalid-arp-payload" });
        return;
      }
      const pending = arpCache.learn(arp.senderIp, arp.senderMac);
      for (const item of pending) {
        const iface = device.interfaces.get(item.interfaceId);
        const destinationMac = arpCache.lookup(arp.senderIp);
        if (!iface || !destinationMac) continue;
        this.enqueueFromPort(context, iface.physicalPortId, new EthernetFrame({
          sourceMac: iface.macAddress,
          destinationMac,
          etherType: ETHER_TYPE.IPV4,
          payload: item.packet,
        }));
      }
      if (arp.operation === "request" && this.interfaceHasIp(networkInterface, arp.targetIp)) {
        this.enqueueFromPort(context, ingressPortId, new EthernetFrame({
          sourceMac: networkInterface.macAddress,
          destinationMac: arp.senderMac,
          etherType: ETHER_TYPE.ARP,
          vlanId: frame.vlanId,
          payload: {
            operation: "reply",
            senderIp: arp.targetIp,
            senderMac: networkInterface.macAddress,
            targetIp: arp.senderIp,
            targetMac: arp.senderMac,
          },
        }));
      }
      return;
    }
    if (frame.etherType !== ETHER_TYPE.IPV4 || !(frame.payload instanceof IPv4Packet)) {
      context.dropped.push({ deviceId: device.id, reason: "unsupported-ether-type" });
      return;
    }
    const packet = frame.payload;
    if (!this.interfaceHasIp(networkInterface, packet.destinationIp)) {
      context.dropped.push({ deviceId: device.id, reason: "not-local-destination", packet });
      return;
    }

    const received = { frame, portId: ingressPortId, packet, receivedAt: Date.now() };
    device.receivedFrames.push(received);
    context.delivered.push({ deviceId: device.id, packet });
    this.networkManager.emit("packet-delivered", received);

    if (packet.protocol === IP_PROTOCOL.ICMP && packet.payload?.type === ICMP_TYPE.ECHO_REQUEST) {
      const reply = Icmp.echoReply(packet, packet.destinationIp);
      this.sendIpv4FromEndpoint(context, device, networkInterface, reply);
    }
  }

  createArpRequest(networkInterface, targetIp) {
    return new EthernetFrame({
      sourceMac: networkInterface.macAddress,
      destinationMac: BROADCAST_MAC,
      etherType: ETHER_TYPE.ARP,
      payload: {
        operation: "request",
        senderIp: networkInterface.ipv4Addresses[0].split("/")[0],
        senderMac: networkInterface.macAddress,
        targetIp,
        targetMac: null,
      },
    });
  }

  interfaceHasIp(networkInterface, ipAddress) {
    return networkInterface.ipv4Addresses.some((value) => value.split("/")[0] === ipAddress);
  }

  getEndpointArp(deviceId, interfaceId) {
    const key = `${deviceId}:${interfaceId}`;
    if (!this.endpointArp.has(key)) this.endpointArp.set(key, new ArpCache());
    return this.endpointArp.get(key);
  }

  requireDevice(deviceId) {
    const device = this.networkManager.topology.devices.get(deviceId);
    if (!device) throw new Error(`Unknown network device: ${deviceId}`);
    return device;
  }
}