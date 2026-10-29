import { useEffect, useMemo, useRef, useState } from "react";
import { computeGridLayout, LogicalRenderer } from "../../core/rendering-engine";
import DeviceNode from "./DeviceNode";
import usePanInteraction from "./usePanInteraction";

export default function LogicalModeView({ devices, links, interactionMode = "select" }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");
  const [nodes, setNodes] = useState([]);
  const { offset, isPanning, handlers } = usePanInteraction(interactionMode);
  const devicesById = useMemo(
    () => new Map(devices.map((device) => [device.id, device])),
    [devices]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const draw = () => {
      try {
        const bounds = canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, bounds.width || 900);
        const height = Math.max(1, bounds.height || 560);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const topology = {
          devices: new Map(devices.map((device) => [device.id, device])),
          links: new Map(links.map((link) => [link.id, link])),
        };
        const layout = computeGridLayout(topology, { width, height, margin: 92 });
        new LogicalRenderer(canvas).render(layout, { pixelRatio: ratio, renderNodes: false });
        setNodes(layout.nodes);
        setRenderError("");
      } catch (error) {
        setRenderError(error.message);
      }
    };
    draw();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    window.addEventListener("resize", draw);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [devices, links]);

  return (
    <div
      className={`render-surface logical-surface${interactionMode === "pan" ? " pan-enabled" : ""}${isPanning ? " is-panning" : ""}`}
      style={{ "--grid-x": `${offset.x}px`, "--grid-y": `${offset.y}px` }}
      {...handlers}
    >
      <div className="logical-content" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <canvas ref={canvasRef} className="render-canvas" aria-label="Logical network topology" />
        {nodes.map((node) => {
          const device = devicesById.get(node.id);
          if (!device) return null;
          return (
            <DeviceNode
              key={node.id}
              device={device}
              label={node.label}
              x={node.x}
              y={node.y}
            />
          );
        })}
      </div>
      {renderError && <p className="render-error" role="status">Logical view could not render: {renderError}</p>}
    </div>
  );
}
