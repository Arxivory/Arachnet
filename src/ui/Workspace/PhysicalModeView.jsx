import { useEffect, useRef, useState } from "react";
import { FloorplanTransform, Physical2DRenderer } from "../../core/rendering-engine";

const PLAN_BOUNDS = { x: 0, y: 0, width: 1000, height: 600 };

export default function PhysicalModeView({ floor, devices, links }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const draw = () => {
      try {
        const bounds = canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round((bounds.width || 900) * ratio));
        const height = Math.max(1, Math.round((bounds.height || 560) * ratio));
        canvas.width = width;
        canvas.height = height;
        const transform = new FloorplanTransform(PLAN_BOUNDS, {
          x: 0,
          y: 0,
          width,
          height,
        }, { preserveAspectRatio: false });
        new Physical2DRenderer(canvas).render({ devices, links, transform });
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
    <div className="render-surface physical-surface">
      <svg className="floorplan-underlay" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <rect x="48" y="46" width="904" height="508" rx="3" />
        <path d="M330 46V230H48M330 230H580V46M580 230V390H952M48 390H330V554M580 390V554" />
        <path d="M200 46V138M460 230V390M790 46V230M790 390V554" />
      </svg>
      <canvas ref={canvasRef} className="render-canvas" aria-label={`${floor.label} physical network plan`} />
      {renderError && <p className="render-error" role="status">Physical view could not render: {renderError}</p>}
    </div>
  );
}
