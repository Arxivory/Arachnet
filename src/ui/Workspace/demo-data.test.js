import {
  createDemoFloorModel,
  createDemoLinkModel,
  DEMO_DEVICE_SEEDS,
  DEMO_FLOORPLAN_PIXELS_PER_METER,
} from "./demo-data";

test("demo floorplan and CAD placements share identical horizontal coordinates", () => {
  for (const device of DEMO_DEVICE_SEEDS) {
    expect(device.floorplanPosition[0] / DEMO_FLOORPLAN_PIXELS_PER_METER)
      .toBe(device.position[0]);
    expect(device.floorplanPosition[1] / DEMO_FLOORPLAN_PIXELS_PER_METER)
      .toBe(device.position[1]);
  }
});

test("keeps per-floor cable geometry in local 3D space while clipping risers at floor bounds", () => {
  const link = {
    id: "cross-floor",
    status: "up",
    routePoints: [[2, 3, 2.5], [2, 3, 4.5]],
  };
  const floorOne = createDemoFloorModel("floor-1", [], [link]);
  const floorTwo = createDemoFloorModel("floor-2", [], [link]);
  let floorOneCable;
  let floorTwoCable;
  floorOne.traverse((object) => {
    if (object.name === "cable:cross-floor") floorOneCable = object;
  });
  floorTwo.traverse((object) => {
    if (object.name === "cable:cross-floor") floorTwoCable = object;
  });

  expect(Array.from(floorOneCable.geometry.attributes.position.array).map((value) =>
    Number(value.toFixed(3))
  )).toEqual([
    2, 3, 2.5, 2, 3, 3.2,
  ]);
  expect(Array.from(floorTwoCable.geometry.attributes.position.array).map((value) =>
    Number(value.toFixed(3))
  )).toEqual([
    2, 3, 0, 2, 3, 1.3,
  ]);
});

test("retains complete global coordinates for multi-floor interactive cable paths", () => {
  const model = createDemoLinkModel([{
    id: "riser",
    status: "down",
    routePoints: [[1, 1, 0.2], [1, 1, 3.5], [4, 1, 6.1]],
  }]);
  const cable = model.children[0];

  expect(Array.from(cable.geometry.attributes.position.array).map((value) =>
    Number(value.toFixed(3))
  )).toEqual([
    1, 1, 0.2,
    1, 1, 3.5,
    4, 1, 6.1,
  ]);
  expect(cable.material.color.getHex()).toBe(0x94a3b8);
});
