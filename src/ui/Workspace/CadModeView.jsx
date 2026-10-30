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

export default function CadModeView({
  floor,
  floors,
  devices,
  links = [],
  importedModels = [],
}) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const currentFloorId = useRef(null);
  const cameraByFloor = useRef(new Map());
  const modelRef = useRef(null);
  const devicesRef = useRef(devices);
  const linksRef = useRef(links);
  const floorsRef = useRef(floors);
  const importedModelsRef = useRef(importedModels);
  devicesRef.current = devices;
  linksRef.current = links;
  floorsRef.current = floors;
  importedModelsRef.current = importedModels;
  const [renderError, setRenderError] = useState("");
  const deviceGeometryKey = useMemo(() => JSON.stringify(devices.map((device) => ({
    id: device.id,
    kind: device.kind,
    floorId: device.floorId,
    position: device.transform?.position ?? device.position,
  }))), [devices]);
  const linkGeometryKey = useMemo(() => JSON.stringify(links.map((link) => ({
    id: link.id,
    status: link.status,
    routePoints: link.routePoints,
  }))), [links]);
  const importedGeometryKey = useMemo(() => JSON.stringify(
    importedModels.map(({ id, floorId }) => ({ id, floorId }))
  ), [importedModels]);

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
    const model = createDemoFloorModel(
      floor.id,
      devicesRef.current,
      linksRef.current,
      floorsRef.current
    );
    const importedFloorModels = importedModelsRef.current
      .filter((item) => item.floorId === floor.id)
      .map((item) => ({ floorId: floor.id, object3D: item.object3D.clone(true) }));
    renderer.setFloor(
      floor.id,
      [...importedFloorModels, { floorId: floor.id, object3D: model }],
      { frame: false }
    );
    const savedCamera = cameraByFloor.current.get(floor.id);
    if (savedCamera) restoreCamera(renderer, savedCamera);
    else renderer.frameFloor();
    modelRef.current = model;
    currentFloorId.current = floor.id;
    disposeObject(previousModel);
    setRenderError("");
  }, [
    deviceGeometryKey,
    floor.id,
    floor.label,
    floor.zMin,
    floor.zMax,
    importedGeometryKey,
    linkGeometryKey,
  ]);

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
