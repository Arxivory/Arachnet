function validateBounds(value, name) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) ||
    !Number.isFinite(value.width) || !Number.isFinite(value.height) ||
    value.width <= 0 || value.height <= 0) {
    throw new TypeError(`${name} requires finite x/y and positive width/height.`);
  }
  return value;
}

export class FloorplanTransform {
  constructor(sourceBounds, viewportBounds, { preserveAspectRatio = true } = {}) {
    this.source = validateBounds(sourceBounds, "Source bounds");
    this.viewport = validateBounds(viewportBounds, "Viewport bounds");
    let scaleX = viewportBounds.width / sourceBounds.width;
    let scaleY = viewportBounds.height / sourceBounds.height;
    if (preserveAspectRatio) scaleX = scaleY = Math.min(scaleX, scaleY);
    const offsetX = viewportBounds.x + (viewportBounds.width - sourceBounds.width * scaleX) / 2;
    const offsetY = viewportBounds.y + (viewportBounds.height - sourceBounds.height * scaleY) / 2;
    this.matrix = [
      scaleX,
      0,
      0,
      scaleY,
      offsetX - sourceBounds.x * scaleX,
      offsetY - sourceBounds.y * scaleY,
    ];
  }

  toViewport(point) {
    this.validatePoint(point);
    const [scaleX, , , scaleY, offsetX, offsetY] = this.matrix;
    return [scaleX * point[0] + offsetX, scaleY * point[1] + offsetY];
  }

  toFloorplan(point) {
    this.validatePoint(point);
    const [scaleX, , , scaleY, offsetX, offsetY] = this.matrix;
    return [(point[0] - offsetX) / scaleX, (point[1] - offsetY) / scaleY];
  }

  validatePoint(point) {
    if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isFinite(value))) {
      throw new TypeError("Floorplan coordinates must be finite [x, y] pairs.");
    }
  }
}
