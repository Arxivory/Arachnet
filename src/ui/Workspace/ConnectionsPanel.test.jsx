import { fireEvent, render, screen } from "@testing-library/react";
import ConnectionsPanel from "./ConnectionsPanel";
import { ApplicationStateManager } from "../state/application-state-manager";
import useApplicationState from "../state/useApplicationState";

let stateManager;

function ConnectedPanelHarness() {
  const state = useApplicationState(stateManager);
  return (
    <ConnectionsPanel
      links={state.links}
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

test("lists floor links, toggles link state, and disconnects the cable", () => {
  const [source, destination] = stateManager.getSnapshot().devices;
  stateManager.connectEthernet([...source.ports.values()][0].id, [...destination.ports.values()][0].id);
  render(<ConnectedPanelHarness />);
  fireEvent.click(screen.getByRole("button", { name: /Links/ }));

  expect(screen.getByText(/2D: flat straight-line baseline/)).toBeInTheDocument();

  const link = stateManager.getSnapshot().links[0];
  const firstPort = [...source.ports.values()][0];
  const firstInterface = [...source.interfaces.values()][0];

  expect(link).toMatchObject({
    status: "up",
    routingAlgorithm: "astar-3d",
    distanceComplianceStatus: expect.any(String),
  });
  expect(firstPort.linkId).toBe(link.id);
  expect(firstInterface.isOperational(firstPort)).toBe(true);
  expect(link.planarLengthMeters).not.toBe(link.routedLengthMeters);

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

test("shows cable ports and route metrics for connected fiber links", () => {
  stateManager = new ApplicationStateManager({ seedDemoTopology: false });
  const first = stateManager.addDeviceFromProfile("catalyst-9200l-24t-4g", "floor-1");
  const second = stateManager.addDeviceFromProfile("catalyst-9200l-24t-4g", "floor-1");
  const portA = [...first.ports.values()].find(({ media }) => media === "fiber");
  const portB = [...second.ports.values()].find(({ media }) => media === "fiber");
  stateManager.connectEthernet(portA.id, portB.id, { cableType: "om3" });
  render(<ConnectedPanelHarness />);
  fireEvent.click(screen.getByRole("button", { name: /Links/ }));

  expect(stateManager.getSnapshot().links[0]).toMatchObject({
    media: "fiber",
    cableType: "om3",
    distanceComplianceStatus: "not-applicable",
  });
  expect(screen.getByText(`${first.name} · ${portA.name}`)).toBeInTheDocument();
  expect(screen.getByText(`${second.name} · ${portB.name}`)).toBeInTheDocument();
});
