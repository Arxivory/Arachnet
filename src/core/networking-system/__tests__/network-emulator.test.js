import {
  EthernetInterface,
  IPv4Packet,
  IP_PROTOCOL,
  NetworkManager,
  NetworkTopology,
  PC,
  PhysicalPort,
  Router,
  Switch,
  ICMP_TYPE,
} from "..";

function addEthernetEndpoint(device, {
  portId,
  interfaceId,
  macAddress,
  address,
  defaultGateway = null,
  portName = "GigabitEthernet0/0",
}) {
  device.addPort(new PhysicalPort({
    id: portId,
    name: portName,
    supportedSpeedsMbps: [1000],
    supportedDuplexModes: ["full"],
  }));
  device.addInterface(new EthernetInterface({
    id: interfaceId,
    name: portName,
    physicalPortId: portId,
    macAddress,
    ipv4Addresses: address ? [address] : [],
    defaultGateway,
  }));
}

function makeHost(id, address, macAddress, defaultGateway = null) {
  const host = new PC({ id, name: id });
  addEthernetEndpoint(host, {
    portId: `${id}-port`,
    interfaceId: `${id}-interface`,
    macAddress,
    address,
    defaultGateway,
    portName: "Ethernet0",
  });
  return host;
}

function makeSwitch(id, portIds) {
  const networkSwitch = new Switch({ id, name: id });
  for (const [index, portId] of portIds.entries()) {
    networkSwitch.addPort(new PhysicalPort({
      id: portId,
      name: `GigabitEthernet1/0/${index + 1}`,
      supportedSpeedsMbps: [1000],
      supportedDuplexModes: ["full"],
    }));
  }
  return networkSwitch;
}

function makePing(sourceIp, destinationIp, ttl = 64) {
  return new IPv4Packet({
    sourceIp,
    destinationIp,
    protocol: IP_PROTOCOL.ICMP,
    ttl,
    payload: { type: ICMP_TYPE.ECHO_REQUEST, code: 0, identifier: 17, sequence: 1 },
  });
}

describe("Layer 2 forwarding", () => {
  test("learns MAC addresses and delivers an ARP-resolved ICMP exchange", () => {
    const hostA = makeHost("pc-a", "192.168.10.10/24", "00:00:00:00:10:0a");
    const hostB = makeHost("pc-b", "192.168.10.20/24", "00:00:00:00:10:0b");
    const networkSwitch = makeSwitch("sw-1", ["sw-a", "sw-b"]);
    const manager = new NetworkManager(new NetworkTopology({ devices: [hostA, hostB, networkSwitch] }));
    manager.connectEthernet({ id: "cable-a", portAId: "pc-a-port", portBId: "sw-a" });
    manager.connectEthernet({ id: "cable-b", portAId: "pc-b-port", portBId: "sw-b" });

    const result = manager.sendIpv4("pc-a", "pc-a-interface", makePing("192.168.10.10", "192.168.10.20"));

    expect(result.delivered.map(({ deviceId }) => deviceId)).toEqual(["pc-b", "pc-a"]);
    expect(hostB.receivedFrames[0].packet.payload.type).toBe(ICMP_TYPE.ECHO_REQUEST);
    expect(hostA.receivedFrames[0].packet.payload.type).toBe(ICMP_TYPE.ECHO_REPLY);
    expect(networkSwitch.camTable.lookup(1, "00:00:00:00:10:0a")).toBe("sw-a");
    expect(networkSwitch.camTable.lookup(1, "00:00:00:00:10:0b")).toBe("sw-b");
  });

  test("keeps broadcasts inside the ingress access VLAN", () => {
    const hostA = makeHost("pc-a", "192.168.10.10/24", "00:00:00:00:10:0a");
    const hostB = makeHost("pc-b", "192.168.20.20/24", "00:00:00:00:20:0b");
    const networkSwitch = makeSwitch("sw-1", ["sw-a", "sw-b"]);
    networkSwitch.addVlan(10, "users-10");
    networkSwitch.addVlan(20, "users-20");
    networkSwitch.configureAccessPort("sw-a", 10);
    networkSwitch.configureAccessPort("sw-b", 20);
    const manager = new NetworkManager(new NetworkTopology({ devices: [hostA, hostB, networkSwitch] }));
    manager.connectEthernet({ id: "cable-a", portAId: "pc-a-port", portBId: "sw-a" });
    manager.connectEthernet({ id: "cable-b", portAId: "pc-b-port", portBId: "sw-b" });

    manager.sendIpv4(
      "pc-a",
      "pc-a-interface",
      makePing("192.168.10.10", "192.168.20.20"),
      { nextHopIp: "192.168.20.20" }
    );

    expect(hostB.receivedFrames).toHaveLength(0);
    expect(networkSwitch.camTable.lookup(10, "00:00:00:00:10:0a")).toBe("sw-a");
    expect(networkSwitch.camTable.lookup(20, "00:00:00:00:10:0a")).toBeNull();
  });
});

describe("Layer 3 forwarding", () => {
  test("routes between connected networks, resolves ARP, and returns TTL exceeded", () => {
    const hostA = makeHost("pc-a", "10.0.1.10/24", "00:00:00:00:01:0a", "10.0.1.1");
    const hostB = makeHost("pc-b", "10.0.2.20/24", "00:00:00:00:02:0b", "10.0.2.1");
    const router = new Router({ id: "r1", name: "Router" });
    addEthernetEndpoint(router, {
      portId: "r1-port-a",
      interfaceId: "r1-interface-a",
      macAddress: "00:00:00:00:01:01",
      address: "10.0.1.1/24",
      portName: "GigabitEthernet0/0",
    });
    addEthernetEndpoint(router, {
      portId: "r1-port-b",
      interfaceId: "r1-interface-b",
      macAddress: "00:00:00:00:02:01",
      address: "10.0.2.1/24",
      portName: "GigabitEthernet0/1",
    });
    const manager = new NetworkManager(new NetworkTopology({ devices: [hostA, hostB, router] }));
    manager.connectEthernet({ id: "cable-a", portAId: "pc-a-port", portBId: "r1-port-a" });
    manager.connectEthernet({ id: "cable-b", portAId: "pc-b-port", portBId: "r1-port-b" });

    const pingResult = manager.sendIpv4(
      "pc-a",
      "pc-a-interface",
      makePing("10.0.1.10", "10.0.2.20")
    );

    expect(pingResult.delivered.map(({ deviceId }) => deviceId)).toEqual(["pc-b", "pc-a"]);
    expect(hostB.receivedFrames[0].packet.ttl).toBe(63);
    expect(router.fib.lookup("10.0.2.20").type).toBe("connected");
    expect(router.arpCache.lookup("10.0.2.20")).toBe("00:00:00:00:02:0b");

    const expiredResult = manager.sendIpv4(
      "pc-a",
      "pc-a-interface",
      makePing("10.0.1.10", "10.0.2.20", 1)
    );
    expect(expiredResult.delivered.map(({ deviceId }) => deviceId)).toEqual(["pc-a"]);
    expect(hostA.receivedFrames.at(-1).packet.payload.type).toBe(ICMP_TYPE.TIME_EXCEEDED);

    const unreachableResult = manager.sendIpv4(
      "pc-a",
      "pc-a-interface",
      makePing("10.0.1.10", "203.0.113.9")
    );
    expect(unreachableResult.delivered.map(({ deviceId }) => deviceId)).toEqual(["pc-a"]);
    expect(hostA.receivedFrames.at(-1).packet.payload.type).toBe(ICMP_TYPE.DESTINATION_UNREACHABLE);
  });

  test("uses static routes with longest-prefix selection", () => {
    const router = new Router({ id: "r1", name: "Router" });
    router.addStaticRoute({
      destination: "0.0.0.0/0",
      nextHop: "10.0.0.1",
      interfaceId: "uplink",
    });
    router.addStaticRoute({
      destination: "172.16.0.0/16",
      nextHop: "10.0.0.2",
      interfaceId: "specific",
    });
    router.fib.replaceRoutes(router.rib.getRoutes());

    expect(router.fib.lookup("172.16.2.3").interfaceId).toBe("specific");
    expect(router.fib.lookup("8.8.8.8").interfaceId).toBe("uplink");
  });
});
