import * as THREE from "three";

export const DEMO_FLOORS = [
  { id: "floor-1", label: "Floor 1", zMin: 0, zMax: 3.2 },
  { id: "floor-2", label: "Floor 2", zMin: 3.2, zMax: 6.4 },
  { id: "floor-3", label: "Floor 3", zMin: 6.4, zMax: 9.6 },
];

export const DEMO_DEVICE_SEEDS = [
  { id: "core-sw", name: "Core switch", kind: "switch", floorId: "floor-1", floorplanPosition: [230, 300], position: [4, 6, 0.4] },
  { id: "edge-rtr", name: "Edge router", kind: "router", floorId: "floor-1", floorplanPosition: [490, 190], position: [10, 8, 0.4] },
  { id: "ap-1", name: "Access point", kind: "wireless-ap", floorId: "floor-1", floorplanPosition: [730, 390], position: [15, 4, 2.8] },
  { id: "sw-2", name: "Access switch", kind: "switch", floorId: "floor-2", floorplanPosition: [270, 190], position: [5, 8, 0.4] },
  { id: "ap-2", name: "Access point", kind: "wireless-ap", floorId: "floor-2", floorplanPosition: [690, 300], position: [14, 6, 2.8] },
  { id: "pc-2", name: "Workstation", kind: "pc", floorId: "floor-2", floorplanPosition: [780, 430], position: [16, 3, 0.4] },
  { id: "sw-3", name: "Access switch", kind: "switch", floorId: "floor-3", floorplanPosition: [270, 300], position: [5, 6, 0.4] },
  { id: "server-3", name: "Server", kind: "server", floorId: "floor-3", floorplanPosition: [680, 190], position: [14, 8, 0.4] },
  { id: "ap-3", name: "Access point", kind: "wireless-ap", floorId: "floor-3", floorplanPosition: [710, 430], position: [15, 3, 2.8] },
];

export const DEMO_LINK_SEEDS = [
  { id: "link-core-router", deviceAId: "core-sw", deviceBId: "edge-rtr", status: "up" },
  { id: "link-core-ap", deviceAId: "core-sw", deviceBId: "ap-1", status: "up" },
  { id: "link-sw2-ap", deviceAId: "sw-2", deviceBId: "ap-2", status: "up" },
  { id: "link-sw2-pc", deviceAId: "sw-2", deviceBId: "pc-2", status: "down" },
  { id: "link-sw3-server", deviceAId: "sw-3", deviceBId: "server-3", status: "up" },
  { id: "link-sw3-ap", deviceAId: "sw-3", deviceBId: "ap-3", status: "up" },
];

const DEVICE_COLORS = {
  switch: 0x2563eb,
  router: 0x7c3aed,
  "wireless-ap": 0x0891b2,
  pc: 0x16a34a,
  server: 0xea580c,
};

function addBox(group, x, y, z, width, depth, height, color, material = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, depth, height),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...material })
  );
  mesh.position.set(x, y, z + height / 2);
  group.add(mesh);
  return mesh;
}

export function createDemoFloorModel(floorId, devices = DEMO_DEVICE_SEEDS) {
  const floor = DEMO_FLOORS.find((item) => item.id === floorId);
  if (!floor) throw new Error(`Unknown demo floor: ${floorId}`);
  const group = new THREE.Group();
  group.name = `${floor.label} demo geometry`;
  group.position.z = floor.zMin;

  addBox(group, 10, 6, 0, 20, 12, 0.15, 0xdbe4ec);
  const wallColor = 0xcbd5e1;
  addBox(group, 10, 0, 0, 20, 0.18, 3.2, wallColor);
  addBox(group, 10, 12, 0, 20, 0.18, 3.2, wallColor);
  addBox(group, 0, 6, 0, 0.18, 12, 3.2, wallColor);
  addBox(group, 20, 6, 0, 0.18, 12, 3.2, wallColor);
  addBox(group, 6, 4.1, 0, 0.12, 3.8, 3.2, wallColor);
  addBox(group, 14, 7.8, 0, 0.12, 4.2, 3.2, wallColor);

  for (const device of devices.filter((item) => item.floorId === floorId)) {
    const [x, y, z] = device.transform?.position ?? device.position;
    const wireless = device.kind === "wireless-ap";
    addBox(
      group,
      x,
      y,
      z,
      wireless ? 0.65 : 0.9,
      wireless ? 0.65 : 0.6,
      wireless ? 0.12 : 0.45,
      DEVICE_COLORS[device.kind]
    );
  }
  return group;
}
