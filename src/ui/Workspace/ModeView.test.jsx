import { fireEvent, render, screen } from "@testing-library/react";
import LogicalModeView from "./LogicalModeView";
import PhysicalModeView from "./PhysicalModeView";
import { ApplicationStateManager } from "../state/application-state-manager";

const canvasContext = {
  setTransform: jest.fn(),
  clearRect: jest.fn(),
  scale: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
};

beforeAll(() => {
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
});

beforeEach(() => {
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  delete window.PointerEvent;
});

const router = {
  id: "router-1",
  name: "Edge router",
  model: "Cisco 1941",
  kind: "router",
  ports: new Map([["router-port", {}]]),
  floorplanPosition: [500, 300],
};

test("renders Logical nodes as library-style device tiles and pans the grid and topology together", () => {
  const { container } = render(
    <LogicalModeView devices={[router]} links={[]} interactionMode="pan" />
  );
  const surface = container.querySelector(".logical-surface");
  const node = screen.getByRole("button", { name: "Cisco 1941 network device" });

  expect(node).toHaveClass("device-tile");
  expect(node.querySelector("svg")).toBeInTheDocument();

  fireEvent.pointerDown(surface, { button: 0, pointerId: 1, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(surface, { pointerId: 1, clientX: 35, clientY: 45 });

  expect(surface).toHaveClass("is-panning");
  expect(surface).toHaveStyle({ "--grid-x": "25px", "--grid-y": "25px" });
  expect(container.querySelector(".logical-content")).toHaveStyle({
    transform: "translate(25px, 25px)",
  });
});

test("renders Physical nodes as library-style device tiles and supports pan mode", () => {
  const { container } = render(
    <PhysicalModeView
      floor={{ label: "Floor 1" }}
      devices={[router]}
      links={[]}
      placements={{ "router-1": { floorplanPosition: [500, 300] } }}
      interactionMode="pan"
    />
  );
  const surface = container.querySelector(".physical-surface");
  const node = screen.getByRole("button", { name: "Cisco 1941 network device" });

  expect(node).toHaveClass("device-tile");
  fireEvent.pointerDown(surface, { button: 0, pointerId: 2, clientX: 5, clientY: 8 });
  fireEvent.pointerMove(surface, { pointerId: 2, clientX: 15, clientY: 18 });

  expect(surface).toHaveClass("is-panning");
  expect(container.querySelector(".physical-content")).toHaveStyle({
    transform: "translate(10px, 10px)",
  });
});

test("connects devices with the Logical cable tool by selecting free ports", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const first = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const second = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const snapshot = state.getSnapshot();
    const { container } = render(
      <LogicalModeView
        devices={snapshot.devices}
        links={snapshot.links}
        placements={snapshot.placements}
        onConnectEthernet={(portAId, portBId, options) =>
          state.connectEthernet(portAId, portBId, options)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cable" }));
    const deviceNodes = container.querySelectorAll(".network-device-node");
    fireEvent.pointerDown(deviceNodes[0], { button: 0, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: /GigabitEthernet0\/0 · copper/ }));
    fireEvent.pointerDown(deviceNodes[1], { button: 0, pointerId: 2 });
    fireEvent.click(screen.getByRole("button", { name: /GigabitEthernet0\/0 · copper/ }));

    expect(state.getSnapshot().links).toHaveLength(1);
    expect([...first.ports.values()][0].linkId).toBe(state.getSnapshot().links[0].id);
    expect([...second.ports.values()][0].linkId).toBe(state.getSnapshot().links[0].id);
    expect(container.querySelector(".logical-cable-status")).toHaveTextContent("Cable connected");
});

test("shows port indicators when hovering a logical cable", () => {
    const state = new ApplicationStateManager({ seedDemoTopology: false });
    const first = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    const second = state.addDeviceFromProfile("generic-desktop-pc", "floor-1");
    state.connectEthernet([...first.ports.values()][0].id, [...second.ports.values()][0].id);
    const snapshot = state.getSnapshot();
    const { container } = render(
      <LogicalModeView devices={snapshot.devices} links={snapshot.links} placements={snapshot.placements} />
    );
    const linkHitArea = container.querySelector(".logical-links-overlay line");

    fireEvent.mouseEnter(linkHitArea);

    expect(container.querySelectorAll(".logical-link-port-indicator")).toHaveLength(2);
    expect(container.querySelector(".logical-link-hover-label")).toHaveTextContent("GigabitEthernet0/0");
});
