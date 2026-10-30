import { useEffect, useMemo, useRef, useState } from "react";
import { FloorplanTransform, Physical2DRenderer } from "../../core/rendering-engine";
import DeviceNode from "./DeviceNode";
import { readDeviceProfileId } from "./device-drag-data";
import usePanInteraction from "./usePanInteraction";

const PLAN_BOUNDS = { x: 0, y: 0, width: 1000, height: 600 };
const EMPTY_PLACEMENTS = {};

export default function PhysicalModeView({
  floor,
  devices,
  links,
  placements = EMPTY_PLACEMENTS,
  crossFloorConnections = EMPTY_PLACEMENTS,
  selectedDeviceId,
  interactionMode = "select",
  onSelectDevice,
  onMoveDevice,
  onAddDevice,
  onShowCrossFloorConnections,
}) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");
  const [interactionError, setInteractionError] = useState("");
  const [viewport, setViewport] = useState({ width: 900, height: 560 });
  const { offset, isPanning, handlers } = usePanInteraction(interactionMode);
  const transform = useMemo(() => new FloorplanTransform(
    PLAN_BOUNDS,
    { x: 0, y: 0, width: viewport.width, height: viewport.height },
    { preserveAspectRatio: false }
  ), [viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const surface = canvas.parentElement;
    if (!surface) return undefined;
    const measure = () => {
      const bounds = surface.getBoundingClientRect();
      const nextViewport = {
        width: Math.max(1, bounds.width || 900),
        height: Math.max(1, bounds.height || 560),
      };
      setViewport((current) => (
        current.width === nextViewport.width && current.height === nextViewport.height
          ? current
          : nextViewport
      ));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(surface);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) return;
    try {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      new Physical2DRenderer(canvas).render(
        { links, transform },
        { pixelRatio: ratio, renderDevices: false }
      );
      setRenderError("");
    } catch (error) {
      setRenderError(error.message);
    }
  }, [links, transform, viewport]);

  const positionedDevices = useMemo(() => devices.flatMap((device) => {
    const floorplanPosition = placements[device.id]?.floorplanPosition;
    if (!Array.isArray(floorplanPosition)) return [];
    const [x, y] = transform.toViewport(floorplanPosition);
    return [{ device, x, y }];
  }), [devices, placements, transform]);

  function handleDrop(event) {
    event.preventDefault();
    try {
      const profileId = readDeviceProfileId(event.dataTransfer);
      if (!profileId) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const viewportPoint = [
        event.clientX - bounds.left - offset.x,
        event.clientY - bounds.top - offset.y,
      ];
      onAddDevice?.(profileId, {
        floorplanPosition: transform.toFloorplan(viewportPoint),
      });
      setInteractionError("");
    } catch (error) {
      setInteractionError(error.message);
    }
  }

  function handleWorkspaceClick(event) {
    if (interactionMode !== "select") return;
    if (event.target.closest(".network-device-node, .cross-floor-device-indicator")) return;
    onSelectDevice?.(null);
  }

  return (
    <div
      className={`render-surface physical-surface${interactionMode === "pan" ? " pan-enabled" : ""}${isPanning ? " is-panning" : ""}`}
      {...handlers}
      onClick={handleWorkspaceClick}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="physical-content" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        {!floor.isBimImported && (
          <svg className="floorplan-underlay" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
            <rect x="48" y="46" width="904" height="508" rx="3" />
            <path d="M330 46V230H48M330 230H580V46M580 230V390H952M48 390H330V554M580 390V554" />
            <path d="M200 46V138M460 230V390M790 46V230M790 390V554" />
          </svg>
        )}
        <canvas ref={canvasRef} className="render-canvas" aria-label={`${floor.label} physical network plan`} />
        {floor.isBimImported && (
          <p className="bim-floorplan-notice" role="status">
            IFC floor-plan projection is not available yet. View the imported geometry in 3D.
          </p>
        )}
        {positionedDevices.map(({ device, x, y }) => (
          <DeviceNode
            key={device.id}
            device={device}
            crossFloorConnections={crossFloorConnections[device.id]}
            label={device.name}
            x={x}
            y={y}
            selected={selectedDeviceId === device.id}
            interactionMode={interactionMode}
            onSelect={onSelectDevice}
            onMove={(deviceId, position) => onMoveDevice?.(
              deviceId,
              "floorplan-2d",
              transform.toFloorplan(position)
            )}
            onShowCrossFloorConnections={onShowCrossFloorConnections}
          />
        ))}
      </div>
      {renderError && <p className="render-error" role="status">Physical view could not render: {renderError}</p>}
      {interactionError && <p className="render-error" role="status">{interactionError}</p>}
    </div>
  );
}
