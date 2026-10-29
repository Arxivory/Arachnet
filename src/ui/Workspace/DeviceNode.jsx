import {
  Laptop,
  Monitor,
  Network,
  Router,
  Server,
  Wifi,
} from "lucide-react";

const DEVICE_ICONS = {
  switch: Network,
  router: Router,
  "wireless-ap": Wifi,
  pc: Monitor,
  laptop: Laptop,
  server: Server,
};

export default function DeviceNode({ device, label, x, y }) {
  const Icon = DEVICE_ICONS[device.kind] ?? Network;
  const model = device.model ?? label ?? device.name ?? device.id;

  return (
    <div
      className="network-device-node device-tile"
      style={{ left: x, top: y }}
      role="img"
      aria-label={`${model} network device`}
      title={model}
    >
      <span className="device-icon" aria-hidden="true">
        <Icon size={24} strokeWidth={2} />
      </span>
      <span className="device-type">{model}</span>
    </div>
  );
}
