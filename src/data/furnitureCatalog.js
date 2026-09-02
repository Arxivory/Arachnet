const furnitures = {
  "desk": {
    modelId: "desk",
    displayName: "Desk",
    family: "furniture",
    model3D: "objects/furnitures/desk.glb",
  },
  "chair": {
    modelId: "chair",
    displayName: "Chair",
    family: "furniture",
    model3D: "objects/furnitures/chair.glb",
  },
  "rack": {
    modelId: "rack",
    displayName: "Rack",
    family: "furniture",
    model3D: "objects/furnitures/network-rack.glb",
  },
  "closed-rack": {
    modelId: "closed-rack",
    displayName: "Closed Rack",
    family: "furniture",
    model3D: "objects/furnitures/server-rack.glb",
  }
};

export function createFurnitureInstance(catalogId, position = { x: 0, y: 0, z: 0 }, opts = {}) {
  const catalogEntry = furnitures[catalogId];
  if (!catalogEntry) {
    throw new Error(`Unknown catalogId: ${catalogId}`);
  }

  const id = `dev_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
  const name = opts.name || catalogEntry.displayName;

  return {
    id,
    catalogId: catalogEntry.modelId,
    type: catalogEntry.family,
    name,
    position,
    rotation: opts.rotation || 0,
    properties: Object.assign({}, catalogEntry.defaults || {}, opts.properties || {}),
    modeCreatedIn: opts.modeCreatedIn || 'logical'
  };
}

const furnitureCatalog = {
    furnitures
}

export default furnitureCatalog;