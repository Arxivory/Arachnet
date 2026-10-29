import { fireEvent, render, screen } from "@testing-library/react";
import PropertiesPanel from "./PropertiesPanel";
import { ApplicationStateManager } from "./state/application-state-manager";

test("configures a live interface and sends an ICMP ping through the emulated link", () => {
  const stateManager = new ApplicationStateManager({ seedDemoTopology: false });
  const source = stateManager.addDeviceFromProfile("generic-desktop-pc", "floor-1");
  const destination = stateManager.addDeviceFromProfile("generic-desktop-pc", "floor-1");
  const sourceInterface = [...source.interfaces.values()][0];
  const destinationInterface = [...destination.interfaces.values()][0];

  stateManager.connectEthernet(
    [...source.ports.values()][0].id,
    [...destination.ports.values()][0].id
  );
  stateManager.configureInterface(destination.id, destinationInterface.id, {
    ipv4Addresses: ["192.168.10.20/24"],
  });

  render(
    <PropertiesPanel
      device={source}
      floors={stateManager.floors}
      onApplyInterface={(deviceId, interfaceId, config) =>
        stateManager.configureInterface(deviceId, interfaceId, config)}
      onPing={(deviceId, interfaceId, destinationIp, options) =>
        stateManager.ping(deviceId, interfaceId, destinationIp, options)}
      pingResults={stateManager.getSnapshot().pingResults}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /configure device/i }));
  const dialog = screen.getByRole("dialog", { name: /configure device/i });
  expect(dialog).toBeInTheDocument();
  expect(dialog.parentElement.parentElement).toBe(document.body);

  fireEvent.change(screen.getByLabelText("IPv4 address"), {
    target: { value: "192.168.10.10" },
  });
  fireEvent.change(screen.getByLabelText("Prefix length"), { target: { value: "24" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply interface" }));
  expect(sourceInterface.ipv4Addresses).toEqual(["192.168.10.10/24"]);

  fireEvent.click(screen.getByRole("button", { name: "Ping" }));
  fireEvent.change(screen.getByLabelText("Destination IPv4"), {
    target: { value: "192.168.10.20" },
  });
  fireEvent.change(screen.getByLabelText("Count"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Send ping" }));

  expect(screen.getByText(/Reply from 192\.168\.10\.20: seq=1/)).toBeInTheDocument();
  expect(stateManager.getSnapshot().pingResults[0].status).toBe("reply");
});

test("shows validation errors and preserves invalid switch configuration", () => {
  const stateManager = new ApplicationStateManager({ seedDemoTopology: false });
  const networkSwitch = stateManager.addDeviceFromProfile("catalyst-9200l-24t-4g", "floor-1");
  const initialVlans = [...networkSwitch.vlans.keys()];

  render(
    <PropertiesPanel
      device={networkSwitch}
      floors={stateManager.floors}
      onApplySwitch={(deviceId, config) => stateManager.configureSwitch(deviceId, config)}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /configure device/i }));
  expect(screen.getByText("VLAN database")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("VLAN ID"), { target: { value: "4095" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply switch settings" }));

  expect(screen.getByRole("alert")).toHaveTextContent("VLANs require unique IDs");
  expect([...networkSwitch.vlans.keys()]).toEqual(initialVlans);
});
