function values(collection) {
  return collection instanceof Map ? [...collection.values()] : [...(collection ?? [])];
}

export function computeGridLayout(topology, { width = 1000, height = 700, columns = null, margin = 64 } = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new TypeError("Logical layout width and height must be positive.");
  }
  const devices = values(topology.devices);
  if (devices.length === 0) return { coordinateSpace: "logical-2d", width, height, nodes: [], edges: [] };
  const columnCount = columns ?? Math.ceil(Math.sqrt(devices.length));
  if (!Number.isInteger(columnCount) || columnCount < 1) {
    throw new TypeError("Logical layout columns must be a positive integer.");
  }
  const rowCount = Math.ceil(devices.length / columnCount);
  const usableWidth = Math.max(0, width - margin * 2);
  const usableHeight = Math.max(0, height - margin * 2);
  const deviceByPort = new Map();
  const nodes = devices.map((device, index) => {
    for (const portId of device.ports.keys()) deviceByPort.set(portId, device);
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    return {
      id: device.id,
      label: device.model && device.model !== "generic" ? device.model : device.name,
      kind: device.kind ?? "device",
      portCount: device.ports.size,
      x: columnCount === 1 ? width / 2 : margin + (column * usableWidth) / (columnCount - 1),
      y: rowCount === 1 ? height / 2 : margin + (row * usableHeight) / (rowCount - 1),
    };
  });
  const edges = values(topology.links)
    .map((link) => ({
      id: link.id,
      sourceId: deviceByPort.get(link.portAId)?.id,
      targetId: deviceByPort.get(link.portBId)?.id,
      status: link.status,
    }))
    .filter((edge) => edge.sourceId && edge.targetId);
  return { coordinateSpace: "logical-2d", width, height, nodes, edges };
}
