import json

import ifcopenshell.api
import trimesh

from bim_ingestion.pipeline import _simplify_mesh, ingest_ifc


def test_simplifies_large_render_mesh() -> None:
    mesh = trimesh.creation.icosphere(subdivisions=4)

    simplified = _simplify_mesh(mesh, "synthetic-guid")

    assert not simplified.is_empty
    assert len(simplified.faces) < len(mesh.faces)
    assert len(simplified.faces) <= len(mesh.faces) * 0.55


def create_minimal_ifc(path) -> None:
    model = ifcopenshell.api.run("project.create_file")
    project = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcProject",
        name="ArachNet test building",
    )
    units = [
        ifcopenshell.api.run("unit.add_si_unit", model, unit_type=unit_type)
        for unit_type in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")
    ]
    ifcopenshell.api.run("unit.assign_unit", model, units=units)
    model_context = ifcopenshell.api.run(
        "context.add_context",
        model,
        context_type="Model",
    )
    body_context = ifcopenshell.api.run(
        "context.add_context",
        model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=model_context,
    )
    site = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcBuilding",
        name="Building",
    )
    storey = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcBuildingStorey",
        name="Floor 1",
    )
    storey.Elevation = 0.0
    for parent, child in (
        (project, site),
        (site, building),
        (building, storey),
    ):
        ifcopenshell.api.run(
            "aggregate.assign_object",
            model,
            products=[child],
            relating_object=parent,
        )

    wall = ifcopenshell.api.run(
        "root.create_entity",
        model,
        ifc_class="IfcWall",
        name="Test wall",
    )
    representation = ifcopenshell.api.run(
        "geometry.add_wall_representation",
        model,
        context=body_context,
        length=4.0,
        height=3.0,
        thickness=0.2,
    )
    ifcopenshell.api.run(
        "geometry.assign_representation",
        model,
        product=wall,
        representation=representation,
    )
    ifcopenshell.api.run("geometry.edit_object_placement", model, product=wall)
    ifcopenshell.api.run(
        "spatial.assign_container",
        model,
        products=[wall],
        relating_structure=storey,
    )
    model.write(str(path))


def test_ingests_ifc_geometry_into_floor_glb_and_wired_graph_artifacts(tmp_path) -> None:
    source_path = tmp_path / "source.ifc"
    output_dir = tmp_path / "artifacts"
    create_minimal_ifc(source_path)

    result = ingest_ifc(source_path, output_dir)

    assert result.metadata["ifc_schema"] == "IFC4"
    assert result.metadata["floor_count"] == 1
    assert result.metadata["rendered_element_count"] >= 1
    assert result.metadata["graph_schema_version"] == "1.0.0"
    assert result.floors[0]["name"] == "Floor 1"
    assert any(item["code"] == "no_cable_pathways" for item in result.diagnostics)

    glb_artifact = next(item for item in result.artifacts if item["kind"] == "glb")
    scene = trimesh.load(output_dir / glb_artifact["filename"], file_type="glb")
    assert isinstance(scene, trimesh.Scene)
    assert len(scene.geometry) >= 1

    manifest = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
    graph = json.loads((output_dir / "spatial-graph.json").read_text(encoding="utf-8"))
    assert manifest["coordinates"]["length_unit"] == "m"
    assert manifest["floors"][0]["id"] == result.floors[0]["id"]
    assert graph["schema_version"] == "1.0.0"
    assert graph["edges"] == []
