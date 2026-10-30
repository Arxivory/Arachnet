import * as THREE from "three";

export const DEMO_FLOORS = [
  { id: "floor-1", label: "Floor 1", zMin: 0, zMax: 3.2 },
  { id: "floor-2", label: "Floor 2", zMin: 3.2, zMax: 6.4 },
  { id: "floor-3", label: "Floor 3", zMin: 6.4, zMax: 9.6 },
];

export const DEMO_FLOORPLAN_PIXELS_PER_METER = 50;

const TRAY_X = [1, 6, 10, 14, 19];
const TRAY_Y = [1, 6, 11];

export function createDemoConduitNetwork(floors = DEMO_FLOORS) {
  const junctions = [];
  const segments = [];

  floors.forEach((floor, floorIndex) => {
    const ceilingZ = floor.zMin + 2.9;
    for (const x of TRAY_X) {
      for (const y of TRAY_Y) {
        junctions.push({
          id: `${floor.id}-tray-${x}-${y}`,
          kind: x === 1 && y === 1 ? "riser-drop" : "tray-intersection",
          floorId: floor.id,
          position: [x, y, ceilingZ],
        });
      }
    }

    for (const x of TRAY_X) {
      for (let index = 0; index < TRAY_Y.length - 1; index += 1) {
        segments.push({
          id: `${floor.id}-tray-y-${x}-${TRAY_Y[index]}-${TRAY_Y[index + 1]}`,
          startJunctionId: `${floor.id}-tray-${x}-${TRAY_Y[index]}`,
          endJunctionId: `${floor.id}-tray-${x}-${TRAY_Y[index + 1]}`,
          conduitType: "metal-tray",
          capacityMm2: 10000,
          maxFillRatio: 0.4,
        });
      }
    }
    for (const y of TRAY_Y) {
      for (let index = 0; index < TRAY_X.length - 1; index += 1) {
        segments.push({
          id: `${floor.id}-tray-x-${TRAY_X[index]}-${TRAY_X[index + 1]}-${y}`,
          startJunctionId: `${floor.id}-tray-${TRAY_X[index]}-${y}`,
          endJunctionId: `${floor.id}-tray-${TRAY_X[index + 1]}-${y}`,
          conduitType: "metal-tray",
          capacityMm2: 10000,
          maxFillRatio: 0.4,
        });
      }
    }

    const riserBaseId = `${floor.id}-riser-base`;
    const trayRiserId = `${floor.id}-tray-1-1`;
    junctions.push({
      id: riserBaseId,
      kind: "riser-drop",
      floorId: floor.id,
      position: [1, 1, floor.zMin + 0.2],
    });
    segments.push({
      id: `${floor.id}-riser`,
      startJunctionId: riserBaseId,
      endJunctionId: trayRiserId,
      conduitType: "riser",
      capacityMm2: 10000,
      maxFillRatio: 0.4,
    });

    if (floorIndex > 0) {
      const previousFloor = floors[floorIndex - 1];
      segments.push({
        id: `${previousFloor.id}-${floor.id}-vertical-riser`,
        startJunctionId: `${previousFloor.id}-riser-base`,
        endJunctionId: riserBaseId,
        conduitType: "riser",
        capacityMm2: 10000,
        maxFillRatio: 0.4,
      });
    }
  });

  return { junctions, segments };
}

export const DEMO_DEVICE_SEEDS = [
  { id: "core-sw", name: "Core switch", kind: "switch", floorId: "floor-1", floorplanPosition: [200, 300], position: [4, 6, 0.4] },
  { id: "edge-rtr", name: "Edge router", kind: "router", floorId: "floor-1", floorplanPosition: [500, 400], position: [10, 8, 0.4] },
  { id: "ap-1", name: "Access point", kind: "wireless-ap", floorId: "floor-1", floorplanPosition: [750, 200], position: [15, 4, 2.8] },
  { id: "sw-2", name: "Access switch", kind: "switch", floorId: "floor-2", floorplanPosition: [250, 400], position: [5, 8, 0.4] },
  { id: "ap-2", name: "Access point", kind: "wireless-ap", floorId: "floor-2", floorplanPosition: [700, 300], position: [14, 6, 2.8] },
  { id: "pc-2", name: "Workstation", kind: "pc", floorId: "floor-2", floorplanPosition: [800, 150], position: [16, 3, 0.4] },
  { id: "sw-3", name: "Access switch", kind: "switch", floorId: "floor-3", floorplanPosition: [250, 300], position: [5, 6, 0.4] },
  { id: "server-3", name: "Server", kind: "server", floorId: "floor-3", floorplanPosition: [700, 400], position: [14, 8, 0.4] },
  { id: "ap-3", name: "Access point", kind: "wireless-ap", floorId: "floor-3", floorplanPosition: [750, 150], position: [15, 3, 2.8] },
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

const LINK_COLORS = {
  up: 0x0284c7,
  down: 0x94a3b8,
  "err-disabled": 0xdc2626,
};

function clippedSegment(start, end, lowerZ, upperZ) {
  const deltaZ = end[2] - start[2];
  if (Math.abs(deltaZ) < 1e-9) {
    return start[2] < lowerZ || start[2] > upperZ ? null : [start, end];
  }
  const firstT = (lowerZ - start[2]) / deltaZ;
  const secondT = (upperZ - start[2]) / deltaZ;
  const t0 = Math.max(0, Math.min(firstT, secondT));
  const t1 = Math.min(1, Math.max(firstT, secondT));
  if (t0 > t1) return null;
  const pointAt = (t) => [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
    start[2] + deltaZ * t,
  ];
  return [pointAt(t0), pointAt(t1)];
}

function addFloorCableRoutes(group, floor, links) {
  for (const link of links) {
    if (!Array.isArray(link.routePoints) || link.routePoints.length < 2) continue;
    const points = [];
    for (let index = 0; index < link.routePoints.length - 1; index += 1) {
      const segment = clippedSegment(
        link.routePoints[index],
        link.routePoints[index + 1],
        floor.zMin,
        floor.zMax
      );
      if (!segment) continue;
      for (const [x, y, z] of segment) points.push(new THREE.Vector3(x, y, z - floor.zMin));
    }
    if (points.length < 2) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: LINK_COLORS[link.status] ?? LINK_COLORS.down,
      linewidth: 2,
    });
    const cable = new THREE.LineSegments(geometry, material);
    cable.name = `cable:${link.id}`;
    group.add(cable);
  }
}

export function createDemoLinkModel(links = []) {
  const group = new THREE.Group();
  group.name = "network cable routes";
  for (const link of links) {
    if (!Array.isArray(link.routePoints) || link.routePoints.length < 2) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(
      link.routePoints.map((point) => new THREE.Vector3(...point))
    );
    const material = new THREE.LineBasicMaterial({
      color: LINK_COLORS[link.status] ?? LINK_COLORS.down,
      linewidth: 2,
    });
    const cable = new THREE.Line(geometry, material);
    cable.name = `cable:${link.id}`;
    group.add(cable);
  }
  return group;
}

export function createDemoFloorModel(
  floorId,
  devices = DEMO_DEVICE_SEEDS,
  links = [],
  floors = DEMO_FLOORS
) {
  const floor = floors.find((item) => item.id === floorId);
  if (!floor) throw new Error(`Unknown floor: ${floorId}`);
  const group = new THREE.Group();
  group.name = `${floor.label} network overlay`;
  group.position.z = floor.zMin;

  if (DEMO_FLOORS.some((item) => item.id === floorId)) {
    addBox(group, 10, 6, 0, 20, 12, 0.15, 0xdbe4ec);
    const wallColor = 0xcbd5e1;
    addBox(group, 10, 0, 0, 20, 0.18, 3.2, wallColor);
    addBox(group, 10, 12, 0, 20, 0.18, 3.2, wallColor);
    addBox(group, 0, 6, 0, 0.18, 12, 3.2, wallColor);
    addBox(group, 20, 6, 0, 0.18, 12, 3.2, wallColor);
    addBox(group, 6, 4.1, 0, 0.12, 3.8, 3.2, wallColor);
    addBox(group, 14, 7.8, 0, 0.12, 4.2, 3.2, wallColor);
  }

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
  addFloorCableRoutes(group, floor, links);
  return group;
}
