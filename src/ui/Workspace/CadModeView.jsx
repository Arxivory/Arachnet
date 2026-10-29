import { useEffect, useMemo, useRef, useState } from "react";
import { Cad3DRenderer } from "../../core/rendering-engine";
import { createDemoFloorModel } from "./demo-data";

function disposeObject(object) {
  object?.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material?.dispose?.();
  });
}

function captureCamera(renderer) {
  return {
    position: renderer.camera.position.toArray(),
    target: renderer.controls.target.toArray(),
    zoom: renderer.camera.zoom,
  };
}

function restoreCamera(renderer, state) {
  renderer.camera.position.fromArray(state.position);
  renderer.controls.target.fromArray(state.target);
  renderer.camera.zoom = state.zoom;
  renderer.camera.updateProjectionMatrix();
  renderer.controls.update();
  renderer.render();
}

export default function CadModeView({ floor, devices }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const currentFloorId = useRef(null);
  const cameraByFloor = useRef(new Map());
  const modelRef = useRef(null);
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const [renderError, setRenderError] = useState("");
  const deviceGeometryKey = useMemo(() => JSON.stringify(devices.map((device) => ({
    id: device.id,
    kind: device.kind,
    floorId: device.floorId,
    position: device.transform?.position ?? device.position,
  }))), [devices]);

  useEffect(() => {
    try {
      rendererRef.current = new Cad3DRenderer(canvasRef.current);
      setRenderError("");
    } catch (error) {
      setRenderError(error.message);
    }

    return () => {
      disposeObject(modelRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (currentFloorId.current) {
      cameraByFloor.current.set(currentFloorId.current, captureCamera(renderer));
    }

    const previousModel = modelRef.current;
    const model = createDemoFloorModel(floor.id, devicesRef.current);
    renderer.setFloor(floor.id, [{ floorId: floor.id, object3D: model }], { frame: false });
    const savedCamera = cameraByFloor.current.get(floor.id);
    if (savedCamera) restoreCamera(renderer, savedCamera);
    else renderer.frameFloor();
    modelRef.current = model;
    currentFloorId.current = floor.id;
    disposeObject(previousModel);
    setRenderError("");
  }, [deviceGeometryKey, floor]);

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
