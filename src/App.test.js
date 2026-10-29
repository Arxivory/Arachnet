import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './ui/App';

beforeEach(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    scale: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.ResizeObserver;
});

test('renders real network devices and connects hierarchy selection to properties', () => {
  render(<App />);
  const hierarchy = screen.getByRole("region", { name: "Hierarchy" });
  fireEvent.click(within(hierarchy).getByRole("button", { name: "C9200L-24T-4G" }));

  expect(screen.getByRole("button", { name: "Logical" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Name")).toHaveValue("Core switch");
  expect(screen.getByText("Physical ports: 28")).toBeInTheDocument();
});

test("keeps hierarchy devices aligned with the selected floor", () => {
  render(<App />);
  const hierarchy = screen.getByRole("region", { name: "Hierarchy" });

  expect(within(hierarchy).getByRole("button", { name: "C9200L-24T-4G" })).toBeInTheDocument();
  expect(within(hierarchy).queryByRole("button", { name: "Desktop PC" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Floor 2" }));

  expect(within(hierarchy).getByRole("button", { name: "C9300-48T" })).toBeInTheDocument();
  expect(within(hierarchy).getByRole("button", { name: "Desktop PC" })).toBeInTheDocument();
  expect(within(hierarchy).queryByRole("button", { name: "C9200L-24T-4G" })).not.toBeInTheDocument();
});

test("shows bound interfaces and updates interface admin state from Properties", () => {
  render(<App />);
  const hierarchy = screen.getByRole("region", { name: "Hierarchy" });
  fireEvent.click(within(hierarchy).getByRole("button", { name: "C9200L-24T-4G" }));
  fireEvent.click(screen.getByText("Ports and interfaces (28)"));

  const interfaceToggles = screen.getAllByRole("checkbox", { name: "Admin enabled" });
  expect(interfaceToggles).toHaveLength(28);
  expect(interfaceToggles[0]).toBeChecked();
  fireEvent.click(interfaceToggles[0]);
  expect(interfaceToggles[0]).not.toBeChecked();
  expect(screen.getAllByText(/Interface: down ·/).length).toBeGreaterThan(0);

  fireEvent.click(interfaceToggles[0]);
  expect(interfaceToggles[0]).toBeChecked();
});
