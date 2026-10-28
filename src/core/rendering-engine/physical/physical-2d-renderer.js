export class Physical2DRenderer {
  constructor(canvas) {
    if (!canvas?.getContext) throw new TypeError("Physical2DRenderer requires a canvas element.");
    this.canvas = canvas;
  }

  render({ floorplanImage = null, devices = [], links = [], transform }) {
    if (!transform || typeof transform.toViewport !== "function") {
      throw new TypeError("Physical2DRenderer requires a floorplan transform.");
    }
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas context is unavailable.");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (floorplanImage) {
      const source = transform.source;
      const [left, top] = transform.toViewport([source.x, source.y]);
      const [right, bottom] = transform.toViewport([
        source.x + source.width,
        source.y + source.height,
      ]);
      context.drawImage(floorplanImage, left, top, right - left, bottom - top);
    }

    for (const link of links) {
      if (!Array.isArray(link.floorplanPoints) || link.floorplanPoints.length < 2) continue;
      context.beginPath();
      link.floorplanPoints.forEach((point, index) => {
        const [x, y] = transform.toViewport(point);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = link.status === "up" ? "#0284c7" : "#94a3b8";
      context.lineWidth = 2;
      context.stroke();
    }

    for (const device of devices) {
      if (!Array.isArray(device.floorplanPosition)) continue;
      const [x, y] = transform.toViewport(device.floorplanPosition);
      context.fillStyle = "#1d4ed8";
      context.fillRect(x - 7, y - 7, 14, 14);
      context.fillStyle = "#0f172a";
      context.font = "12px sans-serif";
      context.textAlign = "left";
      context.fillText(device.name ?? device.id, x + 10, y + 4);
    }
  }
}
