const NODE_COLORS = Object.freeze({
  switch: "#2563eb",
  router: "#7c3aed",
  "wireless-ap": "#0891b2",
  pc: "#16a34a",
  laptop: "#16a34a",
  server: "#ea580c",
});

export class LogicalRenderer {
  constructor(canvas) {
    if (!canvas?.getContext) throw new TypeError("LogicalRenderer requires a canvas element.");
    this.canvas = canvas;
  }

  render(layout) {
    if (layout.coordinateSpace !== "logical-2d") {
      throw new TypeError("LogicalRenderer only accepts logical-2d layouts.");
    }
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas context is unavailable.");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    for (const edge of layout.edges) {
      const source = nodes.get(edge.sourceId);
      const target = nodes.get(edge.targetId);
      if (!source || !target) continue;
      context.beginPath();
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.strokeStyle = edge.status === "up" ? "#64748b" : "#cbd5e1";
      context.lineWidth = 2;
      context.stroke();
    }
    for (const node of layout.nodes) {
      context.beginPath();
      context.arc(node.x, node.y, 22, 0, Math.PI * 2);
      context.fillStyle = NODE_COLORS[node.kind] ?? "#475569";
      context.fill();
      context.fillStyle = "#0f172a";
      context.font = "12px sans-serif";
      context.textAlign = "center";
      context.fillText(node.label, node.x, node.y + 40);
      context.fillStyle = "#ffffff";
      context.font = "10px sans-serif";
      context.fillText(String(node.portCount), node.x, node.y + 4);
    }
  }

  clear() {
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas context is unavailable.");
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
