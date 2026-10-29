import { fireEvent, render, screen } from "@testing-library/react";
import ConnectionsPanel from "./ConnectionsPanel";
import { ApplicationStateManager } from "../state/application-state-manager";
import useApplicationState from "../state/useApplicationState";

let stateManager;

function ConnectedPanelHarness() {
  const state = useApplicationState(stateManager);
  return (
    <ConnectionsPanel
      devices={state.devices}
      links={state.links}
      onConnect={(portAId, portBId, options) =>
        stateManager.connectEthernet(portAId, portBId, options)}
      onDisconnect={(linkId) => stateManager.disconnectEthernet(linkId)}
      onSetLinkStatus={(linkId, status) =>
        stateManager.setEthernetLinkStatus(linkId, status)}
    />
  );
}

beforeEach(() => {
  stateManager = new ApplicationStateManager({ seedDemoTopology: false });
  const first = stateManager.addDeviceFromProfile("generic-desktop-pc", "floor-1");
  stateManager.addDeviceFromProfile("generic-desktop-pc", "floor-1");
  stateManager.selectDevice(first.id);
});

test("connects selected physical ports, toggles link state, and disconnects the cable", () => {
  render(<ConnectedPanelHarness />);
  fireEvent.click(screen.getByRole("button", { name: /Links/ }));

  expect(screen.getByText(/2D: flat straight-line baseline/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Connect ports" }));

  const link = stateManager.getSnapshot().links[0];
  const first = stateManager.getSnapshot().devices[0];
  const firstPort = [...first.ports.values()][0];
  const firstInterface = [...first.interfaces.values()][0];

  expect(link).toMatchObject({
    status: "up",
    routingAlgorithm: "astar-3d",
    distanceComplianceStatus: expect.any(String),
  });
  expect(firstPort.linkId).toBe(link.id);
  expect(firstInterface.isOperational(firstPort)).toBe(true);
  expect(screen.getByText("Cable connected")).toBeInTheDocument();
  expect(link.planarLengthMeters).not.toBe(link.routedLengthMeters);
  expect(screen.getByLabelText("Port A")).not.toHaveValue(firstPort.id);

  fireEvent.click(screen.getByRole("button", {
    name: "Disable link between Desktop PC and Desktop PC 2",
  }));
  expect(stateManager.getSnapshot().links[0].status).toBe("down");
  expect(firstInterface.isOperational(firstPort)).toBe(false);

  fireEvent.click(screen.getByRole("button", {
    name: "Disconnect Desktop PC from Desktop PC 2",
  }));
  expect(stateManager.getSnapshot().links).toHaveLength(0);
  expect(firstPort.linkId).toBeNull();
});

test("offers fiber cable types only after selecting matching optical ports", () => {
  stateManager = new ApplicationStateManager({ seedDemoTopology: false });
  const first = stateManager.addDeviceFromProfile("catalyst-9200l-24t-4g", "floor-1");
  const second = stateManager.addDeviceFromProfile("catalyst-9200l-24t-4g", "floor-1");
  render(<ConnectedPanelHarness />);
  fireEvent.click(screen.getByRole("button", { name: /Links/ }));

  const portA = [...first.ports.values()].find(({ media }) => media === "fiber");
  const portB = [...second.ports.values()].find(({ media }) => media === "fiber");
  fireEvent.change(screen.getByLabelText("Port A"), { target: { value: portA.id } });
  fireEvent.change(screen.getByLabelText("Port B"), { target: { value: portB.id } });
  expect(screen.getByRole("option", { name: "OM3" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Connect ports" }));

  expect(stateManager.getSnapshot().links[0]).toMatchObject({
    media: "fiber",
    cableType: "om3",
    distanceComplianceStatus: "not-applicable",
  });
});
