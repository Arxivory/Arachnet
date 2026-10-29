import { fireEvent, render, screen, within } from "@testing-library/react";
import ObjectLibrary from "./ObjectLibrary";
import HierarchyPanel from "./HierarchyPanel";
import PropertiesPanel from "./PropertiesPanel";
import LogicalModeView from "./Workspace/LogicalModeView";
import PhysicalModeView from "./Workspace/PhysicalModeView";
import { ApplicationStateManager } from "./state/application-state-manager";
import useApplicationState from "./state/useApplicationState";
import { DEMO_FLOORS } from "./Workspace/demo-data";

const canvasContext = {
  setTransform: jest.fn(),
  clearRect: jest.fn(),
  scale: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
};

let stateManager;

function IntegrationHarness() {
  const state = useApplicationState(stateManager);
  const selectedDevice = state.devices.find(({ id }) => id === state.selectedDeviceId) ?? null;

  return (
    <>
      <ObjectLibrary />
      <LogicalModeView
        devices={state.devices.filter(({ floorId }) => floorId === DEMO_FLOORS[0].id)}
        links={state.links.filter(({ floorId }) => floorId === DEMO_FLOORS[0].id)}
        placements={state.placements}
        selectedDeviceId={state.selectedDeviceId}
        onSelectDevice={(deviceId) => stateManager.selectDevice(deviceId)}
        onMoveDevice={(deviceId, coordinateSpace, position) =>
          stateManager.moveDeviceInView(deviceId, coordinateSpace, position)}
        onAddDevice={(profileId, placement) =>
          stateManager.addDeviceFromProfile(profileId, DEMO_FLOORS[0].id, placement)}
      />
      <HierarchyPanel
        devices={state.devices}
        selectedDeviceId={state.selectedDeviceId}
        onSelectDevice={(deviceId) => stateManager.selectDevice(deviceId)}
      />
      <PropertiesPanel
        device={selectedDevice}
        floors={DEMO_FLOORS}
        onRename={(deviceId, name) => stateManager.renameDevice(deviceId, name)}
        onPositionChange={(deviceId, axis, value) =>
          stateManager.setDevicePosition(deviceId, axis, value)}
      />
    </>
  );
}

beforeEach(() => {
  stateManager = new ApplicationStateManager();
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
  Object.defineProperty(window, "DragEvent", { configurable: true, value: MouseEvent });
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window.PointerEvent;
  delete window.DragEvent;
});

test("dragging a catalog profile creates and selects a real network device in UI state", () => {
  const dragData = new Map();
  const dataTransfer = {
    setData: (type, value) => dragData.set(type, value),
    getData: (type) => dragData.get(type) ?? "",
    set effectAllowed(value) {
      this.allowedEffect = value;
    },
  };
  const { container } = render(<IntegrationHarness />);
  const library = screen.getByRole("list", { name: "Switches" });
  const profileCard = within(library).getByRole("listitem", {
    name: "Drag C9300-48T into the workspace",
  });
  const canvas = container.querySelector(".logical-surface");

  fireEvent.dragStart(profileCard, { dataTransfer });
  expect(dragData.get("application/x-arachnet-device-profile")).toContain("catalyst-9300-48t");
  fireEvent.dragOver(canvas, { dataTransfer });
  fireEvent.drop(canvas, { dataTransfer, clientX: 240, clientY: 180 });

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(stateManager.getSnapshot().devices).toHaveLength(10);
  expect(screen.getByLabelText("Name")).toHaveValue("C9300-48T 2");
  expect(stateManager.getSnapshot().devices[stateManager.getSnapshot().devices.length - 1].ports.size).toBe(48);
  expect(stateManager.getSnapshot().placements["device-1"].logicalPosition).toEqual([240, 180]);

  const nameInput = screen.getByLabelText("Name");
  fireEvent.change(nameInput, { target: { value: "Lab switch" } });
  fireEvent.blur(nameInput);
  expect(screen.getByLabelText("Name")).toHaveValue("Lab switch");
  expect(stateManager.getSnapshot().devices[stateManager.getSnapshot().devices.length - 1].name).toBe("Lab switch");
});

test("hierarchy selection and device-tile dragging update the actual device placement", () => {
  const { container } = render(<IntegrationHarness />);
  const hierarchy = screen.getByRole("region", { name: "Hierarchy" });
  fireEvent.click(within(hierarchy).getByRole("button", { name: "C9200L-24T-4G" }));

  expect(screen.getByLabelText("Name")).toHaveValue("Core switch");
  const node = screen.getByRole("button", { name: "C9200L-24T-4G network device" });
  fireEvent.pointerDown(node, { button: 0, pointerId: 7, clientX: 30, clientY: 40 });
  fireEvent.pointerMove(node, { pointerId: 7, clientX: 55, clientY: 65 });
  fireEvent.pointerUp(node, { pointerId: 7 });

  expect(stateManager.getSnapshot().placements["core-sw"].logicalPosition).toBeTruthy();
  expect(container.querySelector(".network-device-node.is-selected")).toBe(node);
});

test("dropping a device in Physical mode records floorplan coordinates separately", () => {
  const state = stateManager.getSnapshot();
  const dragData = new Map([
    ["application/x-arachnet-device-profile", JSON.stringify({
      type: "arachnet/device-profile",
      profileId: "catalyst-2924-xl",
    })],
  ]);
  const dataTransfer = { getData: (type) => dragData.get(type) ?? "" };
  const { container } = render(
    <PhysicalModeView
      floor={DEMO_FLOORS[0]}
      devices={state.devices.filter(({ floorId }) => floorId === DEMO_FLOORS[0].id)}
      links={state.links.filter(({ floorId }) => floorId === DEMO_FLOORS[0].id)}
      placements={state.placements}
      onAddDevice={(profileId, placement) =>
        stateManager.addDeviceFromProfile(profileId, DEMO_FLOORS[0].id, placement)}
    />
  );

  fireEvent.drop(container.querySelector(".physical-surface"), {
    dataTransfer,
    clientX: 450,
    clientY: 280,
  });

  const device = stateManager.getSnapshot().devices[stateManager.getSnapshot().devices.length - 1];
  expect(device.profileId).toBe("catalyst-2924-xl");
  expect(stateManager.getSnapshot().placements[device.id]).toMatchObject({
    floorplanPosition: [500, 300],
    logicalPosition: null,
  });
});
