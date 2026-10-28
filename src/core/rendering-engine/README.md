# Rendering engine

The rendering engine is separate from `networking-system`. It consumes
network topology and spatial/floorplan data but does not own or change network
emulation state.

Logical mode uses its own abstract `logical-2d` grid. Physical mode requires
explicit `floorplanPosition` and `floorplanPoints` coordinates, mapped through
`FloorplanTransform`. Neither mode reads or writes 3D device transforms. CAD
and interactive modes use Three.js spatial coordinates; CAD displays one
selected floor, while `MultiFloorWorld` retains content for every floor.

`FloorManager` slices 3D entities by `floorId` or spatial Z bounds. `ViewController`
coordinates mode/floor state and can initialize/dispose mode-specific renderers.
The canvas renderers receive their canvas from the UI; they do not depend on
React or the current workspace component.

`BimMeshParser` is a loader adapter, not an IFC implementation. Register a
format-specific parser (for example one backed by web-ifc) to load source files
into Three.js `Object3D` instances. The CAD viewport uses orthographic orbit
controls for pointer drag rotation, wheel zoom, and right-drag panning. IFC/CAD
file parsing, wireless propagation heatmaps, and advanced collision/occlusion
systems remain separate integration work.