import { useMemo } from "react";
import { VIEW_MODES } from "../../core/rendering-engine";
import FloorNavigator from "./FloorNavigator";
import LogicalModeView from "./LogicalModeView";
import PhysicalModeView from "./PhysicalModeView";
import CadModeView from "./CadModeView";
import InteractiveModeView from "./InteractiveModeView";
import ConnectionsPanel from "./ConnectionsPanel";
import { DEMO_FLOORS } from "./demo-data";
import { useViewState } from "./useViewState";

const EMPTY_DEVICES = [];
const EMPTY_LINKS = [];
const EMPTY_PLACEMENTS = {};

export default function Workspace({
  viewController,
  interactionMode = "select",
  devices = EMPTY_DEVICES,
  links = EMPTY_LINKS,
  placements = EMPTY_PLACEMENTS,
  selectedDeviceId = null,
  onSelectDevice,
  onMoveDevice,
  onAddDevice,
  onConnectEthernet,
  onDisconnectEthernet,
  onSetLinkStatus,
}) {
  const viewState = useViewState(viewController);
  const floor = DEMO_FLOORS.find(({ id }) => id === viewState.floorId) ?? DEMO_FLOORS[0];
  const floorDevices = useMemo(
    () => devices.filter((device) => device.floorId === floor.id),
    [devices, floor.id]
  );
  const floorLinks = useMemo(
    () => links.filter((link) => link.floorId === floor.id),
    [floor.id, links]
  );

  return (
    <main className="workspace" aria-label={`${viewState.mode} workspace`}>
      <section className="workspace-viewport" aria-live="polite">
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.LOGICAL}>
          <LogicalModeView
            devices={floorDevices}
            links={floorLinks}
            placements={placements}
            selectedDeviceId={selectedDeviceId}
            interactionMode={interactionMode}
            onSelectDevice={onSelectDevice}
            onMoveDevice={onMoveDevice}
            onAddDevice={(profileId, placement) => onAddDevice(profileId, floor.id, placement)}
          />
        </div>
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.PHYSICAL}>
          <PhysicalModeView
            floor={floor}
            devices={floorDevices}
            links={floorLinks}
            placements={placements}
            selectedDeviceId={selectedDeviceId}
            interactionMode={interactionMode}
            onSelectDevice={onSelectDevice}
            onMoveDevice={onMoveDevice}
            onAddDevice={(profileId, placement) => onAddDevice(profileId, floor.id, placement)}
          />
        </div>
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.CAD}>
          <CadModeView
            floor={floor}
            devices={floorDevices}
            links={links}
            active={viewState.mode === VIEW_MODES.CAD}
          />
        </div>
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.INTERACTIVE}>
          <InteractiveModeView
            devices={devices}
            links={links}
            active={viewState.mode === VIEW_MODES.INTERACTIVE}
          />
        </div>
        <ConnectionsPanel
          devices={devices}
          links={links}
          onConnect={onConnectEthernet}
          onDisconnect={onDisconnectEthernet}
          onSetLinkStatus={onSetLinkStatus}
        />
      </section>
      {viewState.floorBased && (
        <FloorNavigator
          floors={DEMO_FLOORS}
          activeFloorId={floor.id}
          onSelect={(floorId) => viewController.setFloor(floorId)}
        />
      )}
    </main>
  );
}
