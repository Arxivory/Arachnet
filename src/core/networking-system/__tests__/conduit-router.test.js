import { ConduitRouter } from "..";

function createRouter() {
  return new ConduitRouter({
    junctions: [
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [2, 0, 0] },
      { id: "c", position: [0, 2, 0] },
      { id: "d", position: [2, 2, 0] },
    ],
    segments: [
      {
        id: "direct",
        startJunctionId: "a",
        endJunctionId: "b",
        capacityMm2: 100,
      },
      { id: "north-a", startJunctionId: "a", endJunctionId: "c" },
      { id: "north", startJunctionId: "c", endJunctionId: "d" },
      { id: "north-b", startJunctionId: "d", endJunctionId: "b" },
    ],
  });
}

describe("3D conduit routing", () => {
  test("snaps endpoints to structural junctions and returns true 3D route length", () => {
    const router = new ConduitRouter({
      junctions: [
        { id: "low", kind: "riser-drop", position: [0, 0, 0] },
        { id: "high", kind: "tray-intersection", position: [0, 0, 3] },
      ],
      segments: [{
        id: "riser",
        startJunctionId: "low",
        endJunctionId: "high",
        conduitType: "riser",
      }],
    });

    const route = router.route([0, 0, 0.5], [0, 0, 2.5]);

    expect(route).toMatchObject({
      algorithm: "astar-3d",
      junctionIds: ["low", "high"],
      segmentIds: ["riser"],
      conduitLengthMeters: 3,
      lengthMeters: 4,
      distanceComplianceStatus: "compliant",
    });
    expect(route.routePoints).toEqual([[0, 0, 0.5], [0, 0, 0], [0, 0, 3], [0, 0, 2.5]]);
  });

  test("routes around segments that would exceed the 40 percent fill ceiling", () => {
    const router = createRouter();
    const route = router.route([-1, 0, 0], [3, 0, 0], { cableAreaMm2: 30 });
    router.reserveRoute("existing", route, 30);

    const alternate = router.route([-1, 0, 0], [3, 0, 0], { cableAreaMm2: 20 });

    expect(route.segmentIds).toEqual(["direct"]);
    expect(alternate.segmentIds).toEqual(["north-a", "north", "north-b"]);
    expect(router.getSegmentFillRatio("direct")).toBeCloseTo(0.3);
    expect(router.releaseRoute("existing")).toBe(true);
    expect(router.getSegmentFillRatio("direct")).toBe(0);
    expect(router.releaseRoute("existing")).toBe(false);
  });

  test("rejects malformed or non-compliant structural capacity data", () => {
    expect(() => new ConduitRouter({
      junctions: [{ id: "a", position: [0, 0, 0] }, { id: "b", position: [1, 0, 0] }],
      segments: [{
        id: "overfilled",
        startJunctionId: "a",
        endJunctionId: "b",
        maxFillRatio: 0.5,
      }],
    })).toThrow(/at most 40%/);
    expect(() => createRouter().route([0, 0], [2, 0, 0])).toThrow(/coordinate in meters/);
  });
});
