import { useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar/Toolbar";
import ObjectLibrary from "./ObjectLibrary";
import Workspace from "./Workspace/Workspace";
import HierarchyPanel from "./HierarchyPanel";
import PropertiesPanel from "./PropertiesPanel";
import ConsoleSimulationLogs from "./logs/ConsoleSimulationLogs";
import { VIEW_MODES, ViewController } from "../core/rendering-engine";
import { DEMO_FLOORS } from "./Workspace/demo-data";
import { ApplicationStateManager } from "./state/application-state-manager";
import useApplicationState from "./state/useApplicationState";
import { useViewState } from "./Workspace/useViewState";
import { pythonServices } from "../services/python-services";

function parseGlb(data) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(data, "", resolve, reject);
  });
}

export default function App() {
  const [stateManager] = useState(() => new ApplicationStateManager());
  const applicationState = useApplicationState(stateManager);
  const [viewController] = useState(
    () => new ViewController({ floorId: DEMO_FLOORS[0].id })
  );
  const viewState = useViewState(viewController);
  const visibleDevices = viewState.mode === "interactive"
    ? applicationState.devices
    : applicationState.devices.filter((device) => device.floorId === viewState.floorId);
  const selectedDevice = visibleDevices.find(
    ({ id }) => id === applicationState.selectedDeviceId
  ) ?? null;
  const [interactionMode, setInteractionMode] = useState("select");
  const [importedModels, setImportedModels] = useState([]);

  async function importBim(file, { signal, onJobUpdate } = {}) {
    const result = await pythonServices.bimIngestion.uploadIfc(file, { signal, onJobUpdate });
    const sourceFloors = [...(result.job.metadata.floors ?? result.manifest.floors ?? [])];
    if (result.models.some((model) => !model.floor_id)) {
      sourceFloors.push({
        id: "__unassigned__",
        name: "Unassigned geometry",
        elevation_m: 0,
      });
    }
    const floorIdBySourceId = new Map(sourceFloors.map((floor) => [
      floor.id,
      `bim-${result.job.id}-${floor.id}`,
    ]));
    const importedFloors = sourceFloors.map((floor, index) => {
      const zMin = floor.elevation_m ?? index * 3.2;
      return {
        id: floorIdBySourceId.get(floor.id),
        sourceFloorId: floor.id,
        label: floor.name || `Floor ${index + 1}`,
        zMin,
        zMax: zMin + 3.2,
        isBimImported: true,
      };
    });
    const loadedModels = await Promise.all(result.models.map(async (model) => {
      const gltf = await parseGlb(model.data);
      return {
        id: `${result.job.id}-${model.filename}`,
        floorId: floorIdBySourceId.get(model.floor_id ?? "__unassigned__") ?? null,
        object3D: gltf.scene,
      };
    }));
    stateManager.addBimImport({
      id: result.job.id,
      sourceFilename: result.job.source_filename,
      floors: importedFloors,
      graph: result.graph,
      diagnostics: result.job.diagnostics,
    });
    setImportedModels((current) => [...current, ...loadedModels]);
    if (importedFloors.length > 0) {
      viewController.setMode(VIEW_MODES.CAD, { floorId: importedFloors[0].id });
    }
    return {
      floorCount: importedFloors.length,
      nodeCount: result.graph.nodes.length,
      edgeCount: result.graph.edges.length,
      unassignedModelCount: result.models.filter((model) => !model.floor_id).length,
    };
  }

  return (
    <div className="app">
      <Topbar />
      <Toolbar
        viewController={viewController}
        interactionMode={interactionMode}
        onInteractionModeChange={setInteractionMode}
        onImportBim={importBim}
      />
      <div className="main-layout">
        <ObjectLibrary/>
        <div className="workspace-column">
          <Workspace
            viewController={viewController}
            floors={applicationState.floors}
            interactionMode={interactionMode}
            devices={applicationState.devices}
            links={applicationState.links}
            importedModels={importedModels}
            placements={applicationState.placements}
            selectedDeviceId={applicationState.selectedDeviceId}
            onSelectDevice={(deviceId) => stateManager.selectDevice(deviceId)}
            onMoveDevice={(deviceId, coordinateSpace, position) =>
              stateManager.moveDeviceInView(deviceId, coordinateSpace, position)}
            onAddDevice={(profileId, floorId, placement) =>
              stateManager.addDeviceFromProfile(profileId, floorId, placement)}
            onConnectEthernet={(portAId, portBId, options) =>
              stateManager.connectEthernet(portAId, portBId, options)}
            onDisconnectEthernet={(linkId) => stateManager.disconnectEthernet(linkId)}
            onSetLinkStatus={(linkId, status) =>
              stateManager.setEthernetLinkStatus(linkId, status)}
          />
          <ConsoleSimulationLogs />
        </div>
        <div className="right-panel">
          <HierarchyPanel
            devices={visibleDevices}
            floors={applicationState.floors}
            groupByFloor={viewState.mode === "interactive"}
            selectedDeviceId={applicationState.selectedDeviceId}
            onSelectDevice={(deviceId) => stateManager.selectDevice(deviceId)}
          />
          <PropertiesPanel
            device={selectedDevice}
            floors={stateManager.floors}
            links={applicationState.links}
            onRename={(deviceId, name) => stateManager.renameDevice(deviceId, name)}
            onPositionChange={(deviceId, axis, value) =>
              stateManager.setDevicePosition(deviceId, axis, value)}
            onInterfaceAdminChange={(deviceId, interfaceId, enabled) =>
              stateManager.setInterfaceAdminEnabled(deviceId, interfaceId, enabled)}
            onApplyInterface={(deviceId, interfaceId, config) =>
              stateManager.configureInterface(deviceId, interfaceId, config)}
            onApplySwitch={(deviceId, config) =>
              stateManager.configureSwitch(deviceId, config)}
            onApplyRoutes={(deviceId, routes) =>
              stateManager.configureStaticRoutes(deviceId, routes)}
            onPing={(deviceId, interfaceId, destinationIp, options) =>
              stateManager.ping(deviceId, interfaceId, destinationIp, options)}
            pingResults={applicationState.pingResults}
          />
        </div>
      </div>
    </div>
  );
}