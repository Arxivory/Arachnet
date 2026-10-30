import { useMemo, useState } from "react";
import { X } from "lucide-react";
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
  floors = DEMO_FLOORS,
  importedModels = [],
}) {
  const viewState = useViewState(viewController);
  const [crossFloorDeviceId, setCrossFloorDeviceId] = useState(null);
  const floor = floors.find(({ id }) => id === viewState.floorId) ?? floors[0];
  const floorDevices = useMemo(
    () => devices.filter((device) => device.floorId === floor.id),
    [devices, floor.id]
  );
  const floorLinks = useMemo(
    () => links.filter((link) =>
      link.floorId === floor.id ||
      link.endpointA?.floorId === floor.id ||
      link.endpointB?.floorId === floor.id
    ),
    [floor.id, links]
  );
  const crossFloorConnections = useMemo(() => {
    const connections = {};
    for (const link of links) {
      const endpointA = link.endpointA;
      const endpointB = link.endpointB;
      if (!endpointA || !endpointB || endpointA.floorId === endpointB.floorId) continue;

      for (const [local, remote] of [[endpointA, endpointB], [endpointB, endpointA]]) {
        if (local.floorId !== floor.id) continue;
        const remoteFloor = floors.find(({ id }) => id === remote.floorId);
        if (!remoteFloor) continue;
        connections[local.deviceId] ??= [];
        connections[local.deviceId].push({
          linkId: link.id,
          deviceId: remote.deviceId,
          deviceName: remote.deviceName,
          floorId: remote.floorId,
          floorLabel: remoteFloor.label,
          localPortName: local.portName,
          remotePortName: remote.portName,
        });
      }
    }
    return connections;
  }, [floor.id, floors, links]);
  const crossFloorDevice = devices.find(({ id }) => id === crossFloorDeviceId);
  const selectedCrossFloorConnections = crossFloorConnections[crossFloorDeviceId] ?? [];

  function navigateToConnectedDevice(connection) {
    viewController.setFloor(connection.floorId);
    onSelectDevice?.(connection.deviceId);
    setCrossFloorDeviceId(null);
  }

  return (
    <main className="workspace" aria-label={`${viewState.mode} workspace`}>
      <section className="workspace-viewport" aria-live="polite">
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.LOGICAL}>
          <LogicalModeView
            devices={floorDevices}
            allDevices={devices}
            links={floorLinks}
            placements={placements}
            crossFloorConnections={crossFloorConnections}
            selectedDeviceId={selectedDeviceId}
            interactionMode={interactionMode}
            onSelectDevice={onSelectDevice}
            onMoveDevice={onMoveDevice}
            onAddDevice={(profileId, placement) => onAddDevice(profileId, floor.id, placement)}
            onConnectEthernet={onConnectEthernet}
            onShowCrossFloorConnections={setCrossFloorDeviceId}
          />
        </div>
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.PHYSICAL}>
          <PhysicalModeView
            floor={floor}
            devices={floorDevices}
            links={floorLinks}
            placements={placements}
            crossFloorConnections={crossFloorConnections}
            selectedDeviceId={selectedDeviceId}
            interactionMode={interactionMode}
            onSelectDevice={onSelectDevice}
            onMoveDevice={onMoveDevice}
            onAddDevice={(profileId, placement) => onAddDevice(profileId, floor.id, placement)}
            onShowCrossFloorConnections={setCrossFloorDeviceId}
          />
        </div>
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.CAD}>
          <CadModeView
            floor={floor}
            devices={floorDevices}
            links={links}
            floors={floors}
            importedModels={importedModels}
            active={viewState.mode === VIEW_MODES.CAD}
          />
        </div>
        <div className="workspace-mode-container" hidden={viewState.mode !== VIEW_MODES.INTERACTIVE}>
          <InteractiveModeView
            devices={devices}
            links={links}
            floors={floors}
            importedModels={importedModels}
            active={viewState.mode === VIEW_MODES.INTERACTIVE}
          />
        </div>
        {viewState.floorBased && (
          <ConnectionsPanel
            links={floorLinks}
            onDisconnect={onDisconnectEthernet}
            onSetLinkStatus={onSetLinkStatus}
          />
        )}
        {viewState.floorBased && crossFloorDevice && selectedCrossFloorConnections.length > 0 && (
          <div className="cross-floor-dialog-backdrop">
            <section
              className="cross-floor-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cross-floor-dialog-title"
            >
              <header>
                <div>
                  <strong id="cross-floor-dialog-title">Other-floor links</strong>
                  <span>{crossFloorDevice.name}</span>
                </div>
                <button
                  type="button"
                  aria-label="Close other-floor links"
                  onClick={() => setCrossFloorDeviceId(null)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </header>
              <div className="cross-floor-dialog-list">
                {selectedCrossFloorConnections.map((connection) => (
                  <button
                    type="button"
                    key={connection.linkId}
                    onClick={() => navigateToConnectedDevice(connection)}
                  >
                    <span>{connection.deviceName}</span>
                    <small>
                      {connection.floorLabel} · {connection.localPortName} ↔ {connection.remotePortName}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
      {viewState.floorBased && (
        <FloorNavigator
          floors={floors}
          activeFloorId={floor.id}
          onSelect={(floorId) => viewController.setFloor(floorId)}
        />
      )}
    </main>
  );
}
