import { useRef } from "react";
import {
  Laptop,
  Monitor,
  Network,
  Router,
  Server,
  Wifi,
} from "lucide-react";

const DEVICE_ICONS = {
  switch: Network,
  router: Router,
  "wireless-ap": Wifi,
  pc: Monitor,
  laptop: Laptop,
  server: Server,
};

export default function DeviceNode({
  device,
  label,
  x,
  y,
  crossFloorConnections = [],
  selected = false,
  interactionMode = "select",
  onSelect,
  onMove,
  onCablePick,
  onShowCrossFloorConnections,
}) {
  const Icon = DEVICE_ICONS[device.kind] ?? Network;
  const model = device.model && device.model !== "generic"
    ? device.model
    : label ?? device.name ?? device.id;
  const dragStart = useRef(null);

  function handlePointerDown(event) {
    if (interactionMode === "cable" && (event.button == null || event.button === 0)) {
      event.preventDefault();
      event.stopPropagation();
      onCablePick?.(device.id);
      return;
    }
    if (interactionMode !== "select" || (event.button != null && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(device.id);
    dragStart.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      x,
      y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const nextX = start.x + event.clientX - start.clientX;
    const nextY = start.y + event.clientY - start.clientY;
    onMove?.(device.id, [nextX, nextY]);
  }

  function handlePointerUp(event) {
    if (dragStart.current?.pointerId !== event.pointerId) return;
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(device.id);
    }
  }

  return (
    <div className="network-device-node-container" style={{ left: x, top: y }}>
      <button
        type="button"
        className={`network-device-node device-tile${selected ? " is-selected" : ""}`}
        aria-label={`${model} network device`}
        aria-pressed={selected}
        title={model}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
      >
        <span className="device-icon" aria-hidden="true">
          <Icon size={24} strokeWidth={2} />
        </span>
        <span className="device-type">{model}</span>
      </button>
      {crossFloorConnections.length > 0 && (
        <button
          type="button"
          className="cross-floor-device-indicator"
          aria-label={`${crossFloorConnections.length} other-floor connection${crossFloorConnections.length === 1 ? "" : "s"} for ${device.name}`}
          aria-haspopup="dialog"
          title="Connections to other floors"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onShowCrossFloorConnections?.(device.id);
          }}
        >
          ↗{crossFloorConnections.length}
        </button>
      )}
    </div>
  );
}
