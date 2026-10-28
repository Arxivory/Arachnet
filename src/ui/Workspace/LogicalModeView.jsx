import { useEffect, useRef, useState } from "react";
import { computeGridLayout, LogicalRenderer } from "../../core/rendering-engine";

export default function LogicalModeView({ devices, links }) {
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
        const topology = {
          devices: new Map(devices.map((device) => [device.id, device])),
          links: new Map(links.map((link) => [link.id, link])),
        };
        new LogicalRenderer(canvas).render(computeGridLayout(topology, { width, height, margin: 92 }));
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
    <div className="render-surface logical-surface">
      <canvas ref={canvasRef} className="render-canvas" aria-label="Logical network topology" />
      {renderError && <p className="render-error" role="status">Logical view could not render: {renderError}</p>}
    </div>
  );
}
