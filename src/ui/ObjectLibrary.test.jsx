import { fireEvent, render, screen } from "@testing-library/react";
import ObjectLibrary from "./ObjectLibrary";

describe("ObjectLibrary", () => {
  test("shows catalog profiles grouped with the legacy device-library layout", () => {
    render(<ObjectLibrary />);

    expect(screen.getByText("C9200L-24T-4G")).toBeInTheDocument();
    expect(screen.getByText("C9300-48T")).toBeInTheDocument();
    expect(screen.getByText("ISR 4331")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Routers" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Switches" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Access Points" })).toBeInTheDocument();
    expect(screen.getByText("Wireless AP")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "EndDevices" })).toBeInTheDocument();
    expect(screen.getByText("Desktop PC")).toBeInTheDocument();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("Server")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(9);
  });

  test("searches catalog profiles", () => {
    render(<ObjectLibrary />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search device models" }), {
      target: { value: "1941" },
    });
    expect(screen.getByText("Cisco 1941")).toBeInTheDocument();
    expect(screen.queryByText("ISR 4331")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Switches" })).not.toBeInTheDocument();
  });

  test("provides a profile id in the drag payload for future workspace drop handling", () => {
    render(<ObjectLibrary />);
    const card = screen.getByRole("listitem", { name: "Drag C9200L-24T-4G into the workspace" });
    const setData = jest.fn();

    expect(card).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(card, {
      dataTransfer: { setData, effectAllowed: "uninitialized" },
    });

    expect(setData).toHaveBeenCalledWith(
      "application/x-arachnet-device-profile",
      JSON.stringify({ type: "arachnet/device-profile", profileId: "catalyst-9200l-24t-4g" })
    );
    expect(setData).toHaveBeenCalledWith("text/plain", "catalyst-9200l-24t-4g");
  });
});
