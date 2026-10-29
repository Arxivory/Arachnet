import { useMemo } from "react";
import { VIEW_MODES } from "../../core/rendering-engine";
import FloorNavigator from "./FloorNavigator";
import LogicalModeView from "./LogicalModeView";
import PhysicalModeView from "./PhysicalModeView";
import CadModeView from "./CadModeView";
import InteractiveModeView from "./InteractiveModeView";
import { DEMO_DEVICES, DEMO_FLOORS, DEMO_LINKS } from "./demo-data";
import { useViewState } from "./useViewState";

export default function Workspace({ viewController, interactionMode = "select" }) {
  const viewState = useViewState(viewController);
  const floor = DEMO_FLOORS.find(({ id }) => id === viewState.floorId) ?? DEMO_FLOORS[0];
  const floorDevices = useMemo(
    () => DEMO_DEVICES.filter((device) => device.floorId === floor.id),
    [floor.id]
  );
  const floorDeviceIds = new Set(floorDevices.map(({ id }) => id));
  const deviceByPortId = new Map(
    DEMO_DEVICES.map((device) => [`${device.id}-port`, device.id])
  );
  const floorLinks = DEMO_LINKS.filter((link) =>
    link.floorId === floor.id &&
    floorDeviceIds.has(deviceByPortId.get(link.portAId)) &&
    floorDeviceIds.has(deviceByPortId.get(link.portBId))
  );

  let modeContent;
  switch (viewState.mode) {
    case VIEW_MODES.LOGICAL:
      modeContent = (
        <LogicalModeView
          devices={floorDevices}
          links={floorLinks}
          interactionMode={interactionMode}
        />
      );
      break;
    case VIEW_MODES.PHYSICAL:
      modeContent = (
        <PhysicalModeView
          floor={floor}
          devices={floorDevices}
          links={floorLinks}
          interactionMode={interactionMode}
        />
      );
      break;
    case VIEW_MODES.CAD:
      modeContent = <CadModeView floor={floor} />;
      break;
    case VIEW_MODES.INTERACTIVE:
      modeContent = <InteractiveModeView />;
      break;
    default:
      modeContent = <p role="status">Unsupported rendering mode.</p>;
  }

  return (
    <main className="workspace" aria-label={`${viewState.mode} workspace`}>
      <section className="workspace-viewport" aria-live="polite">
        {modeContent}
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
