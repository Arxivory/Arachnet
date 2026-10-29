import { Laptop, Monitor, Network, Router, Server, Wifi } from "lucide-react";

const DEVICE_ICONS = {
  switch: Network,
  router: Router,
  "wireless-ap": Wifi,
  pc: Monitor,
  laptop: Laptop,
  server: Server,
};

export default function HierarchyPanel({
  devices = [],
  floors = [],
  groupByFloor = false,
  selectedDeviceId = null,
  onSelectDevice,
}) {
  const groupedDevices = groupByFloor
    ? floors.map((floor) => ({
      floor,
      devices: devices.filter((device) => device.floorId === floor.id),
    })).filter(({ devices: floorDevices }) => floorDevices.length > 0)
    : [{ floor: null, devices }];

  return (
    <section className="hierarchy-panel" aria-label="Hierarchy">
      <h3>Hierarchy</h3>
      <hr className="header-separator" />
      {devices.length === 0 ? (
        <p className="hierarchy-empty">No network devices</p>
      ) : (
        groupedDevices.map(({ floor, devices: floorDevices }) => (
          <div className="hierarchy-floor-group" key={floor?.id ?? "active-floor"}>
            {floor && <h4 className="hierarchy-floor-title">{floor.label}</h4>}
            <ul className="hierarchy-device-list">
              {floorDevices.map((device) => {
                const Icon = DEVICE_ICONS[device.kind] ?? Network;
                const model = device.model !== "generic" ? device.model : device.name;
                return (
                  <li key={device.id} className="hierarchy-device-item">
                    <button
                      type="button"
                      className={`tree-item-row${selectedDeviceId === device.id ? " selected-bg" : ""}`}
                      aria-pressed={selectedDeviceId === device.id}
                      onClick={() => onSelectDevice?.(device.id)}
                    >
                      <Icon className="tree-icon" size={14} aria-hidden="true" />
                      <span>{model}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
