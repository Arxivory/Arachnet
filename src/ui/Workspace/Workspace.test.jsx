import { fireEvent, render, screen } from "@testing-library/react";
import { ViewController } from "../../core/rendering-engine";
import Toolbar from "../Toolbar/Toolbar";
import Workspace from "./Workspace";

jest.mock("./LogicalModeView", () => () => <div>Logical topology canvas</div>);
jest.mock("./PhysicalModeView", () => () => <div>Physical floorplan canvas</div>);
jest.mock("./CadModeView", () => () => <div>3D CAD canvas</div>);
jest.mock("./InteractiveModeView", () => () => <div>Interactive building canvas</div>);

function renderWorkspace() {
  const controller = new ViewController({ floorId: "floor-1" });
  render(
    <>
      <Toolbar viewController={controller} />
      <Workspace viewController={controller} />
    </>
  );
  return controller;
}

describe("rendering workspace UI", () => {
  test("keeps the active renderer full-bleed with only compact floating floor controls", () => {
    renderWorkspace();
    const workspace = screen.getByRole("main", { name: "logical workspace" });
    const viewport = workspace.querySelector(".workspace-viewport");
    const floorNavigator = screen.getByRole("navigation", { name: "Floor navigator" });

    expect(workspace).toContainElement(viewport);
    expect(workspace).toContainElement(floorNavigator);
    expect(workspace.querySelector(".viewport-heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Floor-isolated view")).not.toBeInTheDocument();
  });

  test("switches modes and updates active toolbar state", () => {
    renderWorkspace();

    expect(screen.getByText("Logical topology canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logical" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Physical" }));
    expect(screen.getByText("Physical floorplan canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Physical" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(screen.getByText("3D CAD canvas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pan" })).not.toBeInTheDocument();
  });

  test("floor selection is available for floor modes and remembered after Interactive", () => {
    const controller = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Physical" }));
    fireEvent.click(screen.getByRole("button", { name: /Floor 2/ }));
    expect(controller.state.floorId).toBe("floor-2");
    expect(screen.getByRole("button", { name: "Floor 2" })).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Interactive" }));
    expect(screen.getByText("Interactive building canvas")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Floor navigator" })).not.toBeInTheDocument();
    expect(screen.getByRole("main", { name: "interactive workspace" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(controller.state.floorId).toBe("floor-2");
    expect(screen.getByRole("navigation", { name: "Floor navigator" })).toBeInTheDocument();
    expect(screen.getByText("3D CAD canvas")).toBeInTheDocument();
    expect(screen.queryByText("ARACHNET · DIGITAL TWIN")).not.toBeInTheDocument();
  });
});
