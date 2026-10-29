import { useState } from "react";
import { Cable, Power, Unplug } from "lucide-react";

export default function ConnectionsPanel({ links, onDisconnect, onSetLinkStatus }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
          <div className="connection-list" aria-label="Floor links">
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
            {!links.length && <p className="connection-hint">No links on this floor.</p>}
          </div>
          {error && <p className="connection-message error" role="alert">{error}</p>}
          {notice && <p className="connection-message" role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}
