function validateFloor(floor) {
  if (!floor?.id || !Number.isFinite(floor.zMin) || !Number.isFinite(floor.zMax) ||
    floor.zMin > floor.zMax) {
    throw new TypeError("A floor requires an id and valid zMin/zMax bounds.");
  }
  return { ...floor };
}

function entityFloorBounds(entity) {
  const bounds = entity.spatialBounds ?? entity.bounds;
  if (bounds?.min && bounds?.max) {
    return { min: bounds.min[2], max: bounds.max[2] };
  }
  const position = entity.position ?? entity.transform?.position;
  if (Array.isArray(position) && Number.isFinite(position[2])) {
    return { min: position[2], max: position[2] };
  }
  return null;
}

export class FloorManager {
  constructor(floors = []) {
    this.floors = new Map();
    this.setFloors(floors);
  }

  setFloors(floors) {
    if (!Array.isArray(floors)) throw new TypeError("Floors must be provided as an array.");
    const nextFloors = new Map();
    for (const item of floors) {
      const floor = validateFloor(item);
      if (nextFloors.has(floor.id)) throw new Error(`Duplicate floor id: ${floor.id}`);
      nextFloors.set(floor.id, floor);
    }
    this.floors = nextFloors;
  }

  getFloor(floorId) {
    const floor = this.floors.get(floorId);
    if (!floor) throw new Error(`Unknown floor: ${floorId}`);
    return floor;
  }

  filterForFloor(entities, floorId) {
    if (!Array.isArray(entities)) throw new TypeError("Floor entities must be provided as an array.");
    const floor = this.getFloor(floorId);
    return entities.filter((entity) => {
      if (entity.floorId !== null && entity.floorId !== undefined) {
        return entity.floorId === floorId;
      }
      const bounds = entityFloorBounds(entity);
      return bounds !== null && bounds.min <= floor.zMax && bounds.max >= floor.zMin;
    });
  }

  filterTopology(topology, floorId) {
    const devices = this.filterForFloor([...topology.devices.values()], floorId);
    const portOwners = new Map();
    for (const device of devices) {
      for (const portId of device.ports.keys()) portOwners.set(portId, device.id);
    }
    const links = [...topology.links.values()].filter((link) =>
      link.floorId === floorId ||
      (portOwners.has(link.portAId) && portOwners.has(link.portBId))
    );
    return { devices, links };
  }
}