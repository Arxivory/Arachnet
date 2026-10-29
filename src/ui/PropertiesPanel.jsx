import { useEffect, useState } from "react";

export default function PropertiesPanel({
  device = null,
  floors = [],
  onRename,
  onPositionChange,
}) {
  const [nameError, setNameError] = useState("");
  const [draftName, setDraftName] = useState(device?.name ?? "");

  useEffect(() => {
    setDraftName(device?.name ?? "");
    setNameError("");
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
    </section>
  );
}