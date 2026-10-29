import { fireEvent, render, screen } from "@testing-library/react";
import ConsoleSimulationLogs from "./ConsoleSimulationLogs";

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterAll(() => {
  delete global.ResizeObserver;
});

test("keeps configuration logs in Console and emulation logs in Simulation across tab switches", () => {
  render(<ConsoleSimulationLogs />);

  fireEvent(
    window,
    new CustomEvent("add-system-log", {
      detail: {
        category: "configuration",
        device: "switch",
        deviceName: "Access switch",
        message: "Configuration applied",
        location: "floor-1",
      },
    })
  );
  fireEvent(
    window,
    new CustomEvent("add-system-log", {
      detail: {
        category: "simulation",
        device: "pc",
        deviceName: "Desktop",
        message: "ICMP reply from 192.0.2.1",
        location: "floor-1",
      },
    })
  );

  expect(screen.getByText(/Configuration applied/)).toBeInTheDocument();
  expect(screen.queryByText("ICMP reply from 192.0.2.1")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Simulation" }));
  expect(screen.getByText("ICMP reply from 192.0.2.1")).toBeInTheDocument();
  expect(screen.queryByText(/Configuration applied/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Console" }));
  expect(screen.getByText(/Configuration applied/)).toBeInTheDocument();
});
