import { useEffect, useMemo, useRef, useState } from "react";
import { FloorplanTransform, Physical2DRenderer } from "../../core/rendering-engine";
import DeviceNode from "./DeviceNode";
import usePanInteraction from "./usePanInteraction";

const PLAN_BOUNDS = { x: 0, y: 0, width: 1000, height: 600 };

export default function PhysicalModeView({ floor, devices, links, interactionMode = "select" }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");
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
    if (!Array.isArray(device.floorplanPosition)) return [];
    const [x, y] = transform.toViewport(device.floorplanPosition);
    return [{ device, x, y }];
  }), [devices, transform]);

  return (
    <div
      className={`render-surface physical-surface${interactionMode === "pan" ? " pan-enabled" : ""}${isPanning ? " is-panning" : ""}`}
      {...handlers}
    >
      <div className="physical-content" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <svg className="floorplan-underlay" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
          <rect x="48" y="46" width="904" height="508" rx="3" />
          <path d="M330 46V230H48M330 230H580V46M580 230V390H952M48 390H330V554M580 390V554" />
          <path d="M200 46V138M460 230V390M790 46V230M790 390V554" />
        </svg>
        <canvas ref={canvasRef} className="render-canvas" aria-label={`${floor.label} physical network plan`} />
        {positionedDevices.map(({ device, x, y }) => (
          <DeviceNode
            key={device.id}
            device={device}
            label={device.name}
            x={x}
            y={y}
          />
        ))}
      </div>
      {renderError && <p className="render-error" role="status">Physical view could not render: {renderError}</p>}
    </div>
  );
}
