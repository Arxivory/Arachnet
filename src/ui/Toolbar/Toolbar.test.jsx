import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ViewController } from "../../core/rendering-engine";
import Toolbar from "./Toolbar";

test("passes selected IFC files to the import workflow and reports completion", async () => {
  const viewController = new ViewController({ floorId: "floor-1" });
  const onImportBim = jest.fn(async (_file, { onJobUpdate }) => {
    onJobUpdate({ stage: "parse_ifc", progress: 50 });
    return { floorCount: 2, nodeCount: 4, edgeCount: 3, unassignedModelCount: 0 };
  });
  render(<Toolbar viewController={viewController} onImportBim={onImportBim} />);
  const file = new File(["ifc"], "building.ifc");

  fireEvent.change(screen.getByLabelText("Select IFC file"), {
    target: { files: [file] },
  });

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
    "Imported 2 floors - 4 junctions - 3 conduits"
  ));
  expect(onImportBim).toHaveBeenCalledWith(
    file,
    expect.objectContaining({
      signal: expect.any(AbortSignal),
      onJobUpdate: expect.any(Function),
    })
  );
  viewController.dispose();
});
