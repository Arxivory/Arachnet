import { fireEvent, render, screen } from "@testing-library/react";
import LogicalModeView from "./LogicalModeView";
import PhysicalModeView from "./PhysicalModeView";

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
  const node = screen.getByRole("img", { name: "Cisco 1941 network device" });

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
      interactionMode="pan"
    />
  );
  const surface = container.querySelector(".physical-surface");
  const node = screen.getByRole("img", { name: "Cisco 1941 network device" });

  expect(node).toHaveClass("device-tile");
  fireEvent.pointerDown(surface, { button: 0, pointerId: 2, clientX: 5, clientY: 8 });
  fireEvent.pointerMove(surface, { pointerId: 2, clientX: 15, clientY: 18 });

  expect(surface).toHaveClass("is-panning");
  expect(container.querySelector(".physical-content")).toHaveStyle({
    transform: "translate(10px, 10px)",
  });
});
