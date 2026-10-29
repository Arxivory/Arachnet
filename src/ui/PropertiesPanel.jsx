import { useEffect, useState } from "react";

export default function PropertiesPanel({
  device = null,
  floors = [],
  links = [],
  onRename,
  onPositionChange,
  onInterfaceAdminChange,
}) {
  const [nameError, setNameError] = useState("");
  const [draftName, setDraftName] = useState(device?.name ?? "");
  const [interfaceError, setInterfaceError] = useState("");

  useEffect(() => {
    setDraftName(device?.name ?? "");
    setNameError("");
    setInterfaceError("");
  }, [device?.id, device?.name]);

  if (!device) {
    return (
      <section className="properties-panel" aria-label="Properties">
        <h3>Properties</h3>
        <hr className="header-separator" />
        <p className="properties-empty">Select a network device to inspect it.</p>
      </section>
    );
  }

  const floor = floors.find(({ id }) => id === device.floorId);
  const model = device.model !== "generic" ? device.model : device.kind;
  const ports = [...device.ports.values()];

  return (
    <section className="properties-panel" aria-label="Properties">
      <h3>Properties</h3>
      <hr className="header-separator" />
      <div className="properties-group device-properties">
        <label htmlFor="device-name">Name</label>
        <input
          id="device-name"
          type="text"
          value={draftName}
          onChange={(event) => {
            setDraftName(event.target.value);
            setNameError("");
          }}
          onBlur={() => {
            try {
              onRename?.(device.id, draftName);
            } catch (error) {
              setDraftName(device.name);
              setNameError(error.message);
            }
          }}
        />
        <span className="property-detail">Model: {model}</span>
        <span className="property-detail">Floor: {floor?.label ?? "Unassigned"}</span>
        <span className="property-detail">Physical ports: {device.ports.size}</span>
        {nameError && <p className="property-error" role="status">{nameError}</p>}
      </div>
      <hr className="header-separator" />
      <h3>Position (meters)</h3>
      <div className="transform-header"><span></span><span>X</span><span>Y</span><span>Z</span></div>
      <div className="transform-grid">
        <label htmlFor="position-x">Position</label>
        {device.transform.position.map((value, axis) => (
          <input
            key={axis}
            id={`position-${"xyz"[axis]}`}
            aria-label={`Position ${"XYZ"[axis]}`}
            type="number"
            step="0.1"
            value={value}
            onChange={(event) => {
              if (event.target.value === "") return;
              onPositionChange?.(device.id, axis, Number(event.target.value));
            }}
          />
        ))}
      </div>
      <details className="port-inventory">
        <summary>Ports and interfaces ({ports.length})</summary>
        <ul>
          {ports.map((port) => {
            const networkInterface = [...device.interfaces.values()].find(
              (item) => item.physicalPortId === port.id
            );
            const link = links.find(
              (item) => item.portAId === port.id || item.portBId === port.id
            );
            const peer = link?.portAId === port.id ? link.endpointB : link?.endpointA;
            return (
              <li key={port.id}>
                <strong>{port.name}</strong>
                <span>
                  Port: {port.status} · {port.media}
                  {port.linkId ? " · occupied" : " · free"}
                </span>
                {networkInterface ? (
                  <>
                    <span>Interface: {networkInterface.lineStatus} · {networkInterface.macAddress ?? "No MAC"}</span>
                    <label className="interface-admin-toggle">
                      <input
                        type="checkbox"
                        checked={networkInterface.adminEnabled}
                        onChange={(event) => {
                          try {
                            onInterfaceAdminChange?.(
                              device.id,
                              networkInterface.id,
                              event.target.checked
                            );
                            setInterfaceError("");
                          } catch (error) {
                            setInterfaceError(error.message);
                          }
                        }}
                      />
                      Admin enabled
                    </label>
                  </>
                ) : <span>No bound interface</span>}
                {link && (
                  <span>
                    {peer?.deviceName} · {peer?.portName} · {link.negotiatedSpeedMbps} Mbps
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {interfaceError && <p className="property-error" role="alert">{interfaceError}</p>}
      </details>
    </section>
  );
}