import { useState } from "react";
import Topbar from "./Topbar";
import Toolbar from "./Toolbar/Toolbar";
import ObjectLibrary from "./ObjectLibrary";
import Workspace from "./Workspace/Workspace";
import HierarchyPanel from "./HierarchyPanel";
import PropertiesPanel from "./PropertiesPanel";
import ConsoleSimulationLogs from "./logs/ConsoleSimulationLogs";
import { ViewController } from "../core/rendering-engine";
import { DEMO_FLOORS } from "./Workspace/demo-data";
import { ApplicationStateManager } from "./state/application-state-manager";
import useApplicationState from "./state/useApplicationState";
import { useViewState } from "./Workspace/useViewState";

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

  return (
    <div className="app">
      <Topbar />
      <Toolbar
        viewController={viewController}
        interactionMode={interactionMode}
        onInteractionModeChange={setInteractionMode}
      />
      <div className="main-layout">
        <ObjectLibrary/>
        <div className="workspace-column">
          <Workspace
            viewController={viewController}
            interactionMode={interactionMode}
            devices={applicationState.devices}
            links={applicationState.links}
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
            floors={stateManager.floors}
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
          />
        </div>
      </div>
    </div>
  );
}