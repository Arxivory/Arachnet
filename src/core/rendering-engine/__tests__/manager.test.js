import * as THREE from "three";
import {
  BimMeshParser,
  FloorManager,
  FloorplanTransform,
  MultiFloorWorld,
  VIEW_MODES,
  ViewController,
  computeGridLayout,
} from "..";

function makeDevice(id, position, floorId = null) {
  return {
    id,
    name: id,
    kind: "switch",
    floorId,
    transform: { position },
    ports: new Map([[`${id}-port`, {}]]),
  };
}

describe("rendering coordinate spaces", () => {
  test("assigns independent coordinate spaces and floor scope to view modes", () => {
    const views = new ViewController({ floorId: "floor-1" });
    expect(views.state).toMatchObject({
      mode: VIEW_MODES.LOGICAL,
      coordinateSpace: "logical-2d",
      floorBased: true,
    });

    views.setMode(VIEW_MODES.PHYSICAL);
    expect(views.state.coordinateSpace).toBe("floorplan-2d");
    views.setMode(VIEW_MODES.CAD);
    expect(views.state).toMatchObject({ coordinateSpace: "building-3d", floorBased: true });
    views.setMode(VIEW_MODES.INTERACTIVE);
    expect(views.state).toMatchObject({ floorId: null, floorBased: false });
    expect(() => views.setFloor("floor-2")).toThrow(/all floors/);
    views.setMode(VIEW_MODES.PHYSICAL);
    expect(views.state.floorId).toBe("floor-1");
  });

  test("filters CAD objects by floor id or intersecting spatial Z bounds", () => {
    const floors = new FloorManager([
      { id: "lower", zMin: 0, zMax: 3 },
      { id: "upper", zMin: 3, zMax: 6 },
    ]);
    const entities = [
      { id: "tagged", floorId: "upper", transform: { position: [1, 2, 1] } },
      { id: "spatial", spatialBounds: { min: [0, 0, 2], max: [2, 2, 4] } },
      { id: "other", transform: { position: [1, 2, 8] } },
    ];
    expect(floors.filterForFloor(entities, "lower").map(({ id }) => id)).toEqual(["spatial"]);
    expect(floors.filterForFloor(entities, "upper").map(({ id }) => id)).toEqual(["tagged", "spatial"]);
  });

  test("lays out topology in logical 2D without reading device world positions", () => {
    const first = makeDevice("a", [900, 800, 700]);
    const second = makeDevice("b", [-900, -800, -700]);
    const topology = {
      devices: new Map([[first.id, first], [second.id, second]]),
      links: new Map([["link", { id: "link", portAId: "a-port", portBId: "b-port", status: "up" }]]),
    };
    const result = computeGridLayout(topology, { width: 400, height: 200, columns: 2 });
    expect(result.coordinateSpace).toBe("logical-2d");
    expect(result.nodes.map(({ x, y }) => [x, y])).toEqual([[64, 100], [336, 100]]);
    expect(result.edges).toEqual([{ id: "link", sourceId: "a", targetId: "b", status: "up" }]);
  });

  test("maps floorplan points through a reversible 2D affine transform", () => {
    const transform = new FloorplanTransform(
      { x: 100, y: 50, width: 200, height: 100 },
      { x: 0, y: 0, width: 800, height: 600 }
    );
    const viewportPoint = transform.toViewport([200, 100]);
    expect(viewportPoint).toEqual([400, 300]);
    expect(transform.toFloorplan(viewportPoint)).toEqual([200, 100]);
    expect(transform.toViewport([100, 50])).toEqual([0, 100]);
  });
});

describe("rendering lifecycle and model adapters", () => {
  test("replaces renderers on mode changes and disposes inactive contexts", () => {
    const controller = new ViewController();
    const initialize = jest.fn();
    const disposeLogical = jest.fn();
    const disposePhysical = jest.fn();
    controller.registerRenderer(VIEW_MODES.LOGICAL, () => ({
      initialize,
      dispose: disposeLogical,
    }));
    controller.registerRenderer(VIEW_MODES.PHYSICAL, () => ({ dispose: disposePhysical }));
    controller.setMode(VIEW_MODES.PHYSICAL, { floorId: "floor-2" });
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      coordinateSpace: "logical-2d",
      floorId: null,
    }));
    expect(disposeLogical).toHaveBeenCalledTimes(1);
    expect(controller.state.floorId).toBe("floor-2");
    controller.dispose();
    expect(disposePhysical).toHaveBeenCalledTimes(1);
  });

  test("parses through a registered BIM adapter and computes model bounds", async () => {
    const parser = new BimMeshParser({
      loaders: {
        test: async () => new THREE.Mesh(
          new THREE.BoxGeometry(2, 4, 6),
          new THREE.MeshBasicMaterial()
        ),
      },
    });
    const result = await parser.parse(new Blob(), "TEST");
    expect(result.format).toBe("test");
    expect(result.bounds.min).toEqual([-1, -2, -3]);
    expect(result.bounds.max).toEqual([1, 2, 3]);
    await expect(parser.parse(new Blob(), "ifc")).rejects.toThrow(/No BIM\/CAD parser is registered/);
  });

  test("keeps all floor roots in the interactive scene", () => {
    const renderer = { render: jest.fn() };
    const world = new MultiFloorWorld(renderer);
    world.setFloors([{ id: "one" }, { id: "two" }]);
    world.setFloorContent("one", [new THREE.Group()]);
    world.setFloorContent("two", [new THREE.Group()]);
    world.render();
    expect(world.floorRoots.size).toBe(2);
    expect(renderer.render).toHaveBeenCalledWith(world.scene, world.camera);
    world.dispose();
    expect(world.floorRoots.size).toBe(0);
  });
});