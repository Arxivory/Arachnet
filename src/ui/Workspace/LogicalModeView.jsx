import { useEffect, useMemo, useRef, useState } from "react";
import { Cable, X } from "lucide-react";
import { computeGridLayout, LogicalRenderer } from "../../core/rendering-engine";
import DeviceNode from "./DeviceNode";
import { readDeviceProfileId } from "./device-drag-data";
import usePanInteraction from "./usePanInteraction";

const EMPTY_PLACEMENTS = {};

function getAvailablePorts(device, media = null) {
  if (!device) return [];
  return [...device.ports.values()].filter((port) =>
    (!media || port.media === media) &&
    port.enabled &&
    !port.linkId &&
    [...device.interfaces.values()].some((networkInterface) =>
      networkInterface.physicalPortId === port.id
    )
  );
}

export default function LogicalModeView({
  devices,
  allDevices = devices,
  links,
  placements = EMPTY_PLACEMENTS,
  crossFloorConnections = EMPTY_PLACEMENTS,
  selectedDeviceId,
  interactionMode = "select",
  onSelectDevice,
  onMoveDevice,
  onAddDevice,
  onConnectEthernet,
  onShowCrossFloorConnections,
}) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [nodes, setNodes] = useState([]);
  const [surfaceSize, setSurfaceSize] = useState({ width: 1, height: 1 });
  const [cableMode, setCableMode] = useState(false);
  const [pendingEndpoint, setPendingEndpoint] = useState(null);
  const [portPickerDeviceId, setPortPickerDeviceId] = useState(null);
  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const { offset, isPanning, handlers } = usePanInteraction(interactionMode);
  const devicesById = useMemo(
    () => new Map(allDevices.map((device) => [device.id, device])),
    [allDevices]
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
        setSurfaceSize((size) =>
          size.width === width && size.height === height ? size : { width, height }
        );
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

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  function handleCableDevicePick(deviceId) {
    onSelectDevice?.(deviceId);
    setInteractionError("");
    if (!pendingEndpoint) {
      setPortPickerDeviceId(deviceId);
      return;
    }
    if (pendingEndpoint.deviceId === deviceId) {
      setInteractionError("Choose a different device for the other end of the cable.");
      return;
    }
    setPortPickerDeviceId(deviceId);
  }

  function chooseCablePort(deviceId, portId) {
    if (!pendingEndpoint) {
      setPendingEndpoint({ deviceId, portId });
      setPortPickerDeviceId(null);
      setInteractionError("Cable endpoint selected. Click another device and choose its port.");
      return;
    }
    try {
      const sourcePort = devicesById.get(pendingEndpoint.deviceId)?.ports.get(pendingEndpoint.portId);
      const cableType = sourcePort?.media === "fiber" ? "om3" : "cat6";
      if (!onConnectEthernet) {
        throw new Error("Cable connection is unavailable.");
      }
      onConnectEthernet(pendingEndpoint.portId, portId, {
        cableType,
        cableDiameterMm: 6.5,
      });
      setPendingEndpoint(null);
      setPortPickerDeviceId(null);
      setInteractionError("Cable connected.");
    } catch (error) {
      setInteractionError(error.message);
    }
  }

  function toggleCableMode() {
    setCableMode((active) => !active);
    setPendingEndpoint(null);
    setPortPickerDeviceId(null);
    setInteractionError("");
  }

  const pickerDevice = devicesById.get(portPickerDeviceId) ?? null;
  const pickerNode = nodeById.get(portPickerDeviceId);
  const pendingDevice = pendingEndpoint
    ? devicesById.get(pendingEndpoint.deviceId)
    : null;
  const pendingPort = pendingDevice?.ports.get(pendingEndpoint?.portId);
  const pickerPorts = getAvailablePorts(
    pickerDevice,
    pendingPort?.media ?? null
  );

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

  function handleWorkspaceClick(event) {
    if (interactionMode !== "select") return;
    if (event.target.closest(
      ".network-device-node, .cross-floor-device-indicator, .logical-cable-tool, .logical-port-picker, .logical-links-overlay"
    )) return;
    onSelectDevice?.(null);
  }

  return (
    <div
      className={`render-surface logical-surface${interactionMode === "pan" ? " pan-enabled" : ""}${isPanning ? " is-panning" : ""}${cableMode ? " cable-mode-active" : ""}`}
      style={{ "--grid-x": `${offset.x}px`, "--grid-y": `${offset.y}px` }}
      {...handlers}
      onClick={handleWorkspaceClick}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="logical-content" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <canvas ref={canvasRef} className="render-canvas" aria-label="Logical network topology" />
        <svg
          className="logical-links-overlay"
          viewBox={`0 0 ${surfaceSize.width} ${surfaceSize.height}`}
          role="img"
          aria-label="Logical network links"
        >
          {links.map((link) => {
            const nodeA = nodeById.get(link.endpointA?.deviceId);
            const nodeB = nodeById.get(link.endpointB?.deviceId);
            if (!nodeA || !nodeB) return null;
            const hovered = hoveredLinkId === link.id;
            const middleX = (nodeA.x + nodeB.x) / 2;
            const middleY = (nodeA.y + nodeB.y) / 2;
            return (
              <g key={link.id} className="logical-link-overlay">
                <line
                  x1={nodeA.x}
                  y1={nodeA.y}
                  x2={nodeB.x}
                  y2={nodeB.y}
                  stroke="transparent"
                  strokeWidth="18"
                  pointerEvents="stroke"
                  onMouseEnter={() => setHoveredLinkId(link.id)}
                  onMouseLeave={() => setHoveredLinkId(null)}
                  aria-label={`${link.endpointA?.portName} to ${link.endpointB?.portName}`}
                >
                  <title>{`${link.endpointA?.deviceName} ${link.endpointA?.portName} ↔ ${link.endpointB?.deviceName} ${link.endpointB?.portName}`}</title>
                </line>
                {hovered && (
                  <>
                    <circle cx={nodeA.x} cy={nodeA.y} r="29" className="logical-link-port-indicator" />
                    <circle cx={nodeB.x} cy={nodeB.y} r="29" className="logical-link-port-indicator" />
                    <g className="logical-link-hover-label" transform={`translate(${middleX}, ${middleY})`}>
                      <rect x="-116" y="-18" width="232" height="36" rx="5" />
                      <text x="0" y="-3" textAnchor="middle">{`${link.endpointA?.portName} ↔ ${link.endpointB?.portName}`}</text>
                      <text x="0" y="10" textAnchor="middle">{link.status} · {link.negotiatedSpeedMbps} Mbps</text>
                    </g>
                  </>
                )}
              </g>
            );
          })}
        </svg>
        {nodes.map((node) => {
          const device = devicesById.get(node.id);
          if (!device) return null;
          return (
            <DeviceNode
              key={node.id}
              device={device}
              crossFloorConnections={crossFloorConnections[device.id]}
              label={node.label}
              x={node.x}
              y={node.y}
              selected={selectedDeviceId === node.id}
              interactionMode={cableMode ? "cable" : interactionMode}
              onSelect={onSelectDevice}
              onMove={(deviceId, position) => onMoveDevice?.(deviceId, "logical-2d", position)}
              onCablePick={handleCableDevicePick}
              onShowCrossFloorConnections={onShowCrossFloorConnections}
            />
          );
        })}
      </div>
      <div className="logical-cable-tool">
        <button
          type="button"
          className={cableMode ? "is-active" : ""}
          aria-pressed={cableMode}
          onClick={toggleCableMode}
        >
          {cableMode ? <X size={15} /> : <Cable size={15} />}
          {cableMode ? "Cancel cable" : "Cable"}
        </button>
        {cableMode && (
          <div className="logical-cable-status" role="status">
            {interactionError || (pendingEndpoint
              ? `Select a device port compatible with ${pendingPort?.name ?? "the selected port"}.`
              : "Click a device to select the first cable port.")}
          </div>
        )}
      </div>
      {cableMode && pickerDevice && pickerNode && (
        <div
          className="logical-port-picker"
          style={{ left: pickerNode.x + offset.x + 44, top: pickerNode.y + offset.y - 20 }}
          role="group"
          aria-label={`${pickerDevice.name} ports`}
        >
          <strong>{pickerDevice.name} · ports</strong>
          {pickerPorts.map((port) => (
            <button type="button" key={port.id} onClick={() => chooseCablePort(pickerDevice.id, port.id)}>
              {port.name} · {port.media}
            </button>
          ))}
          {!pickerPorts.length && <span>No compatible free ports</span>}
          <button type="button" className="logical-port-picker-close" onClick={() => setPortPickerDeviceId(null)}>
            Close
          </button>
        </div>
      )}
      {renderError && <p className="render-error" role="status">Logical view could not render: {renderError}</p>}
      {interactionError && <p className="render-error" role="status">{interactionError}</p>}
    </div>
  );
}
