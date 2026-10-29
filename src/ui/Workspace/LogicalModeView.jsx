import { useEffect, useMemo, useRef, useState } from "react";
import { computeGridLayout, LogicalRenderer } from "../../core/rendering-engine";
import DeviceNode from "./DeviceNode";
import { readDeviceProfileId } from "./device-drag-data";
import usePanInteraction from "./usePanInteraction";

const EMPTY_PLACEMENTS = {};

export default function LogicalModeView({
  devices,
  links,
  placements = EMPTY_PLACEMENTS,
  selectedDeviceId,
  interactionMode = "select",
  onSelectDevice,
  onMoveDevice,
  onAddDevice,
}) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");
  const [interactionError, setInteractionError] = useState("");
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
        layout.nodes = layout.nodes.map((node) => ({
          ...node,
          ...(placements[node.id]?.logicalPosition
            ? {
              x: placements[node.id].logicalPosition[0],
              y: placements[node.id].logicalPosition[1],
            }
            : {}),
        }));
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
  }, [devices, links, placements]);

  function handleDrop(event) {
    event.preventDefault();
    try {
      const profileId = readDeviceProfileId(event.dataTransfer);
      if (!profileId) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      onAddDevice?.(profileId, {
        logicalPosition: [
          event.clientX - bounds.left - offset.x,
          event.clientY - bounds.top - offset.y,
        ],
      });
      setInteractionError("");
    } catch (error) {
      setInteractionError(error.message);
    }
  }

  return (
    <div
      className={`render-surface logical-surface${interactionMode === "pan" ? " pan-enabled" : ""}${isPanning ? " is-panning" : ""}`}
      style={{ "--grid-x": `${offset.x}px`, "--grid-y": `${offset.y}px` }}
      {...handlers}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
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
              selected={selectedDeviceId === node.id}
              interactionMode={interactionMode}
              onSelect={onSelectDevice}
              onMove={(deviceId, position) => onMoveDevice?.(deviceId, "logical-2d", position)}
            />
          );
        })}
      </div>
      {renderError && <p className="render-error" role="status">Logical view could not render: {renderError}</p>}
      {interactionError && <p className="render-error" role="status">{interactionError}</p>}
    </div>
  );
}
