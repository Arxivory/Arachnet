import { useEffect, useRef, useState } from "react";
import { Cad3DRenderer } from "../../core/rendering-engine";
import { createDemoFloorModel } from "./demo-data";

export default function CadModeView({ floor }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let renderer;
    try {
      renderer = new Cad3DRenderer(canvasRef.current);
      renderer.setFloor(floor.id, [{ floorId: floor.id, object3D: createDemoFloorModel(floor.id) }]);
      setRenderError("");
    } catch (error) {
      setRenderError(error.message);
    }
    return () => {
      renderer?.dispose();
    };
  }, [floor]);

  return (
    <div className="render-surface cad-surface">
      <canvas
        ref={canvasRef}
        className="render-canvas cad-orbit-canvas"
        aria-label={`${floor.label} 3D CAD view`}
        title="Drag to orbit · Scroll to zoom · Right-drag to pan"
      />
      {renderError && <p className="render-error" role="status">3D view unavailable: {renderError}</p>}
    </div>
  );
}
