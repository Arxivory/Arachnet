import { useState } from "react";
import { Cable, Power, Unplug } from "lucide-react";

function availablePorts(device, media = null) {
  if (!device) return [];
  return [...device.ports.values()].filter((port) =>
    (!media || port.media === media) &&
    port.enabled &&
    !port.linkId &&
    [...device.interfaces.values()].some((networkInterface) =>
      networkInterface.physicalPortId === port.id
    )
  );
}

export default function ConnectionsPanel({
  devices,
  links,
  onConnect,
  onDisconnect,
  onSetLinkStatus,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceDeviceId, setSourceDeviceId] = useState(devices[0]?.id ?? "");
  const [targetDeviceId, setTargetDeviceId] = useState(devices[1]?.id ?? "");
  const [sourcePortId, setSourcePortId] = useState("");
  const [targetPortId, setTargetPortId] = useState("");
  const [cableType, setCableType] = useState("cat6");
  const [cableDiameterMm, setCableDiameterMm] = useState("6.5");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const sourceDevice = devices.find(({ id }) => id === sourceDeviceId) ?? devices[0] ?? null;
  const targetDevice = devices.find(({ id }) => id === targetDeviceId) ??
    devices.find(({ id }) => id !== sourceDevice?.id) ??
    sourceDevice;
  const sourcePorts = availablePorts(sourceDevice);
  const activeSourcePortId = sourcePorts.some(({ id }) => id === sourcePortId)
    ? sourcePortId
    : sourcePorts[0]?.id ?? "";
  const activeSourcePort = sourcePorts.find(({ id }) => id === activeSourcePortId);
  const targetPorts = availablePorts(targetDevice, activeSourcePort?.media ?? null);
  const activeTargetPortId = targetPorts.some(({ id }) => id === targetPortId)
    ? targetPortId
    : targetPorts[0]?.id ?? "";
  const hasFreePorts = sourcePorts.length > 0 && targetPorts.length > 0;
  const canConnect = Boolean(
    sourceDevice &&
    targetDevice &&
    sourceDevice.id !== targetDevice.id &&
    activeSourcePortId &&
    activeTargetPortId
  );
  const cableTypes = activeSourcePort?.media === "fiber"
    ? ["om3", "om4", "os2"]
    : ["cat5e", "cat6", "cat6a"];
  const activeCableType = cableTypes.includes(cableType) ? cableType : cableTypes[0];

  function handleSubmit(event) {
    event.preventDefault();
    try {
      onConnect?.(activeSourcePortId, activeTargetPortId, {
        cableType: activeCableType,
        cableDiameterMm: Number(cableDiameterMm),
      });
      setError("");
      setNotice("Cable connected");
    } catch (connectError) {
      setNotice("");
      setError(connectError.message);
    }
  }

  function handleDisconnect(linkId) {
    try {
      onDisconnect?.(linkId);
      setError("");
      setNotice("Cable disconnected");
    } catch (disconnectError) {
      setNotice("");
      setError(disconnectError.message);
    }
  }

  function handleToggleLink(link) {
    try {
      onSetLinkStatus?.(link.id, link.status === "up" ? "down" : "up");
      setError("");
      setNotice(link.status === "up" ? "Link disabled" : "Link enabled");
    } catch (statusError) {
      setNotice("");
      setError(statusError.message);
    }
  }

  return (
    <section className={`connections-panel${isOpen ? " is-open" : ""}`} aria-label="Network connections">
      <button
        className="connections-toggle"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Cable size={15} aria-hidden="true" />
        <span>Links</span>
        <span className="connections-count">{links.length}</span>
      </button>
      {isOpen && (
        <div className="connections-content">
          <form onSubmit={handleSubmit}>
            <label>
              <span>Device A</span>
              <select
                value={sourceDevice?.id ?? ""}
                onChange={(event) => {
                  setSourceDeviceId(event.target.value);
                  setSourcePortId("");
                  setNotice("");
                }}
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>{device.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Port A</span>
              <select
                value={activeSourcePortId}
                onChange={(event) => setSourcePortId(event.target.value)}
                disabled={sourcePorts.length === 0}
              >
                {sourcePorts.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
              </select>
            </label>
            <label>
              <span>Device B</span>
              <select
                value={targetDevice?.id ?? ""}
                onChange={(event) => {
                  setTargetDeviceId(event.target.value);
                  setTargetPortId("");
                  setNotice("");
                }}
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>{device.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Port B</span>
              <select
                value={activeTargetPortId}
                onChange={(event) => setTargetPortId(event.target.value)}
                disabled={targetPorts.length === 0}
              >
                {targetPorts.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
              </select>
            </label>
            <div className="connection-cable-options">
              <label>
                <span>Cable</span>
                <select value={activeCableType} onChange={(event) => setCableType(event.target.value)}>
                  {cableTypes.map((type) => (
                    <option key={type} value={type}>{type.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Diameter (mm)</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={cableDiameterMm}
                  onChange={(event) => setCableDiameterMm(event.target.value)}
                  required
                />
              </label>
            </div>
            <button type="submit" className="connection-submit" disabled={!canConnect}>
              <Cable size={14} aria-hidden="true" /> Connect ports
            </button>
            {!hasFreePorts && devices.length > 1 && (
              <p className="connection-hint">Choose devices with free, media-compatible ports and Ethernet interfaces.</p>
            )}
          </form>

          <div className="connection-list" aria-label="Connected cables">
            <p className="connection-method-note">
              2D: flat straight-line baseline (demo scale 50 px/m). 3D: conduit/riser A* route.
            </p>
            {links.map((link) => (
              <div className="connection-row" key={link.id}>
                <span className={`connection-status status-${link.status}`} aria-label={`Link ${link.status}`} />
                <div className="connection-description">
                  <span>{link.endpointA?.deviceName} · {link.endpointA?.portName}</span>
                  <span>{link.endpointB?.deviceName} · {link.endpointB?.portName}</span>
                  <small>
                    2D {link.planarLengthMeters === null ? "n/a" : `${link.planarLengthMeters.toFixed(1)} m`}
                    {" · "}
                    3D {link.routedLengthMeters.toFixed(1)} m
                    {" · "}
                    {link.negotiatedSpeedMbps ?? "—"} Mbps
                    {" · "}
                    fill {link.maxConduitFillRatio === null
                      ? "n/a"
                      : `${(link.maxConduitFillRatio * 100).toFixed(1)}%`}
                  </small>
                </div>
                <button
                  type="button"
                  className="connection-remove"
                  aria-label={`${link.status === "up" ? "Disable" : "Enable"} link between ${link.endpointA?.deviceName} and ${link.endpointB?.deviceName}`}
                  title={link.status === "up" ? "Disable link" : "Enable link"}
                  onClick={() => handleToggleLink(link)}
                >
                  <Power size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="connection-remove"
                  aria-label={`Disconnect ${link.endpointA?.deviceName} from ${link.endpointB?.deviceName}`}
                  title="Disconnect cable"
                  onClick={() => handleDisconnect(link.id)}
                >
                  <Unplug size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {error && <p className="connection-message error" role="alert">{error}</p>}
          {notice && <p className="connection-message" role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}
