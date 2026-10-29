import { EthernetFrame, ETHER_TYPE } from "../definitions/frame";
import { IP_PROTOCOL, IPv4Packet } from "../definitions/packet";
import { Icmp, ICMP_TYPE } from "../protocols/l3/icmp";
import { interfaceAddresses, ipv4PrefixContains, ipv4ToInt } from "../utils/ipv4";

const BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";

export class RouterEngine {
  processIngress(router, ingressPortId, frame) {
    const ingressInterface = this.interfaceForPort(router, ingressPortId);
    if (!ingressInterface || !ingressInterface.isOperational(router.ports.get(ingressPortId))) {
      return { outputs: [], dropped: true, reason: "router-ingress-down" };
    }

    if (frame.etherType === ETHER_TYPE.ARP) {
      return this.processArp(router, ingressInterface, frame);
    }
    if (frame.etherType !== ETHER_TYPE.IPV4 || !(frame.payload instanceof IPv4Packet)) {
      return { outputs: [], dropped: true, reason: "unsupported-ether-type" };
    }
    if (frame.destinationMac !== ingressInterface.macAddress?.toLowerCase()) {
      return { outputs: [], dropped: true, reason: "not-addressed-to-router" };
    }

    const packet = frame.payload;
    const localInterface = this.interfaceForIp(router, packet.destinationIp);
    if (localInterface) {
      if (packet.protocol === IP_PROTOCOL.ICMP && packet.payload?.type === ICMP_TYPE.ECHO_REQUEST) {
        return this.routePacket(router, Icmp.echoReply(packet, packet.destinationIp));
      }
      return {
        outputs: [],
        dropped: false,
        reason: "packet-delivered-to-router",
        deliveredPacket: packet,
      };
    }
    this.refreshRoutes(router);
    if (!router.fib.lookup(packet.destinationIp)) {
      if (this.isIcmpError(packet)) {
        return { outputs: [], dropped: true, reason: "no-route", packet };
      }
      return this.routePacket(
        router,
        Icmp.destinationUnreachable(packet, this.firstAddress(ingressInterface))
      );
    }
    if (packet.ttl <= 1) {
      if (this.isIcmpError(packet)) {
        return { outputs: [], dropped: true, reason: "ttl-expired", packet };
      }
      return this.routePacket(router, Icmp.timeExceeded(packet, this.firstAddress(ingressInterface)));
    }
    return this.routePacket(router, packet.with({ ttl: packet.ttl - 1 }));
  }

  refreshRoutes(router) {
    router.rib.routes = router.rib.routes.filter((route) => route.type !== "connected");
    for (const networkInterface of router.interfaces.values()) {
      if (!networkInterface.adminEnabled || networkInterface.lineStatus !== "up") continue;
      const port = router.ports.get(networkInterface.physicalPortId);
      if (!port || port.status !== "up") continue;
      for (const address of interfaceAddresses(networkInterface)) {
        if (address.prefixLength === 32) continue;
        router.rib.add({
          destination: `${address.address}/${address.prefixLength}`,
          interfaceId: networkInterface.id,
          nextHop: null,
          administrativeDistance: 0,
          metric: 0,
          type: "connected",
        });
      }
    }
    router.fib.replaceRoutes(router.rib.getRoutes());
  }

  routePacket(router, packet) {
    this.refreshRoutes(router);
    const route = router.fib.lookup(packet.destinationIp);
    if (!route) {
      return { outputs: [], dropped: true, reason: "no-route", packet };
    }
    const nextHop = route.nextHop || packet.destinationIp;
    const connectedNextHopRoute = route.interfaceId
      ? null
      : router.rib.getRoutes().find((candidate) =>
        candidate.type === "connected" && ipv4PrefixContains(candidate, nextHop)
      );
    const networkInterface = router.interfaces.get(route.interfaceId ?? connectedNextHopRoute?.interfaceId);
    if (!networkInterface || !networkInterface.adminEnabled || networkInterface.lineStatus !== "up") {
      return { outputs: [], dropped: true, reason: "route-interface-down", packet };
    }
    const port = router.ports.get(networkInterface.physicalPortId);
    if (!port || port.status !== "up") {
      return { outputs: [], dropped: true, reason: "route-port-down", packet };
    }

    const destinationMac = router.arpCache.lookup(nextHop);
    if (destinationMac) {
      return {
        outputs: [this.encapsulate(networkInterface, port.id, destinationMac, packet)],
        dropped: false,
      };
    }

    router.arpCache.queue(nextHop, {
      packet,
      interfaceId: networkInterface.id,
    });
    const attempt = router.arpCache.recordRequest(nextHop);
    if (attempt.exhausted) {
      return { outputs: [], dropped: true, reason: "arp-retry-exhausted", packet };
    }
    return {
      outputs: [this.arpRequest(networkInterface, port.id, nextHop)],
      dropped: false,
      reason: "arp-resolution-pending",
    };
  }

  processArp(router, networkInterface, frame) {
    const arp = frame.payload;
    if (!arp || !["request", "reply"].includes(arp.operation)) {
      return { outputs: [], dropped: true, reason: "invalid-arp-payload" };
    }
    const pending = router.arpCache.learn(arp.senderIp, arp.senderMac);

    if (arp.operation === "request" && this.interfaceForIp(router, arp.targetIp) === networkInterface) {
      const local = networkInterface;
      const port = router.ports.get(local.physicalPortId);
      const reply = new EthernetFrame({
        sourceMac: local.macAddress,
        destinationMac: arp.senderMac,
        etherType: ETHER_TYPE.ARP,
        vlanId: frame.vlanId,
        payload: {
          operation: "reply",
          senderIp: arp.targetIp,
          senderMac: local.macAddress,
          targetIp: arp.senderIp,
          targetMac: arp.senderMac,
        },
      });
      return { outputs: [{ portId: port.id, frame: reply }], dropped: false };
    }

    const outputs = [];
    for (const item of pending) {
      const iface = router.interfaces.get(item.interfaceId);
      const port = iface && router.ports.get(iface.physicalPortId);
      if (!iface || !port || port.status !== "up") continue;
      outputs.push(this.encapsulate(iface, port.id, arp.senderMac, item.packet));
    }
    return { outputs, dropped: false };
  }

  arpRequest(networkInterface, portId, targetIp) {
    const senderIp = this.firstAddress(networkInterface);
    return {
      portId,
      frame: new EthernetFrame({
        sourceMac: networkInterface.macAddress,
        destinationMac: BROADCAST_MAC,
        etherType: ETHER_TYPE.ARP,
        payload: {
          operation: "request",
          senderIp,
          senderMac: networkInterface.macAddress,
          targetIp,
          targetMac: null,
        },
      }),
    };
  }

  encapsulate(networkInterface, portId, destinationMac, packet) {
    return {
      portId,
      frame: new EthernetFrame({
        sourceMac: networkInterface.macAddress,
        destinationMac,
        etherType: ETHER_TYPE.IPV4,
        payload: packet,
      }),
    };
  }

  interfaceForPort(router, portId) {
    return [...router.interfaces.values()].find((item) => item.physicalPortId === portId) ?? null;
  }

  interfaceForIp(router, address) {
    return [...router.interfaces.values()].find((networkInterface) =>
      networkInterface.ipv4Addresses.some((cidr) => cidr.split("/")[0] === address)
    ) ?? null;
  }

  firstAddress(networkInterface) {
    const address = networkInterface.ipv4Addresses[0];
    if (!address) throw new Error(`Interface ${networkInterface.name} has no IPv4 address.`);
    ipv4ToInt(address.split("/")[0]);
    return address.split("/")[0];
  }

  isIcmpError(packet) {
    return packet.protocol === IP_PROTOCOL.ICMP &&
      [ICMP_TYPE.DESTINATION_UNREACHABLE, ICMP_TYPE.TIME_EXCEEDED].includes(packet.payload?.type);
  }
}