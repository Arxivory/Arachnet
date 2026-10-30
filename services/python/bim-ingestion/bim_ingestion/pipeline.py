from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.unit
import numpy as np
import trimesh

from .graph import build_conduit_graph
from .models import Diagnostic, FloorRecord

SNAP_TOLERANCE_M = 0.1
SIMPLIFY_FACE_THRESHOLD = 2_000
SIMPLIFY_FACE_RATIO = 0.5
PATHWAY_TYPES = ("IfcCableCarrierSegment",)
FITTING_TYPES = ("IfcCableCarrierFitting",)


@dataclass
class PipelineResult:
    floors: list[dict[str, Any]]
    artifacts: list[dict[str, Any]]
    diagnostics: list[dict[str, Any]]
    metadata: dict[str, Any]


class IngestionError(RuntimeError):
    def __init__(self, stage: str, message: str) -> None:
        super().__init__(message)
        self.stage = stage


def _slug(value: str) -> str:
    result = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return result[:48] or "floor"


def _all_by_type(model: Any, ifc_type: str) -> list[Any]:
    try:
        return list(model.by_type(ifc_type))
    except RuntimeError:
        return []


def _is_a(product: Any, ifc_type: str) -> bool:
    try:
        return bool(product.is_a(ifc_type))
    except RuntimeError:
        return False


def _simplify_mesh(mesh: trimesh.Trimesh, guid: str) -> trimesh.Trimesh:
    if len(mesh.faces) < SIMPLIFY_FACE_THRESHOLD:
        return mesh
    try:
        simplified = mesh.simplify_quadric_decimation(
            face_count=max(1_000, int(len(mesh.faces) * SIMPLIFY_FACE_RATIO))
        )
    except Exception as error:
        raise IngestionError(
            "simplify_geometry",
            f"Could not simplify IFC element {guid}: {error}",
        ) from error
    if simplified.is_empty:
        raise IngestionError(
            "simplify_geometry",
            f"Mesh simplification removed all geometry for IFC element {guid}.",
        )
    return simplified


def _storey_for(product: Any) -> Any | None:
    for relation in getattr(product, "ContainedInStructure", []) or []:
        structure = getattr(relation, "RelatingStructure", None)
        if structure is not None and structure.is_a("IfcBuildingStorey"):
            return structure
    return None


def _storey_elevation(storey: Any, unit_scale: float) -> float | None:
    elevation = getattr(storey, "Elevation", None)
    if elevation is None:
        return None
    return float(elevation) * unit_scale


def _scene_bytes(scene: trimesh.Scene) -> bytes:
    exported = scene.export(file_type="glb")
    if not isinstance(exported, bytes):
        raise TypeError("Trimesh did not return binary GLB data.")
    return exported


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ingest_ifc(source_path: Path, output_dir: Path) -> PipelineResult:
    diagnostics: list[Diagnostic] = []
    try:
        model = ifcopenshell.open(str(source_path))
    except Exception as error:
        raise IngestionError("parse_ifc", f"Could not parse IFC file: {error}") from error

    schema = str(model.schema)
    try:
        unit_scale = float(ifcopenshell.util.unit.calculate_unit_scale(model))
    except Exception as error:
        raise IngestionError("read_units", f"Could not determine IFC project length units: {error}") from error
    if unit_scale <= 0:
        raise IngestionError("read_units", "IFC project length unit scale must be positive.")

    storeys = sorted(
        _all_by_type(model, "IfcBuildingStorey"),
        key=lambda item: (
            _storey_elevation(item, unit_scale) is None,
            _storey_elevation(item, unit_scale) or 0,
            str(getattr(item, "GlobalId", "")),
        ),
    )
    floors = [
        FloorRecord(
            id=str(getattr(storey, "GlobalId", "") or storey.id()),
            name=str(getattr(storey, "Name", None) or f"Storey {index + 1}"),
            elevation_m=_storey_elevation(storey, unit_scale),
        )
        for index, storey in enumerate(storeys)
    ]
    floor_by_guid = {floor.id: floor for floor in floors}

    products = _all_by_type(model, "IfcProduct")
    product_by_guid = {
        str(getattr(product, "GlobalId", "")): product
        for product in products
        if getattr(product, "GlobalId", None)
    }
    meshes_by_floor: dict[str | None, list[tuple[str, trimesh.Trimesh]]] = {}
    element_index: dict[str, dict[str, Any]] = {}
    pathway_geometries: list[dict[str, Any]] = []
    fitting_geometries: list[dict[str, Any]] = []

    try:
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        iterator = ifcopenshell.geom.iterator(settings, model, 1)
        has_geometry = iterator.initialize()
    except Exception as error:
        raise IngestionError(
            "convert_geometry",
            f"Could not initialize IFC geometry conversion: {error}",
        ) from error

    try:
        while has_geometry:
            shape = iterator.get()
            guid = str(getattr(shape, "guid", ""))
            product = product_by_guid.get(guid)
            vertices_array = np.asarray(shape.geometry.verts, dtype=np.float64).reshape((-1, 3))
            faces_array = np.asarray(shape.geometry.faces, dtype=np.int64).reshape((-1, 3))
            if len(vertices_array) and len(faces_array) and guid:
                mesh = trimesh.Trimesh(
                    vertices=vertices_array,
                    faces=faces_array,
                    process=False,
                )
                if not mesh.is_empty:
                    storey = _storey_for(product) if product is not None else None
                    floor_id = (
                        str(getattr(storey, "GlobalId", "") or storey.id())
                        if storey is not None
                        else None
                    )
                    meshes_by_floor.setdefault(floor_id, []).append((guid, mesh))
                    element_type = product.is_a() if product is not None else "IfcProduct"
                    element_index[guid] = {
                        "ifc_type": element_type,
                        "floor_id": floor_id,
                        "name": str(getattr(product, "Name", "") or "") if product is not None else "",
                    }
                    if product is not None and any(_is_a(product, type_name) for type_name in PATHWAY_TYPES):
                        pathway_geometries.append({
                            "guid": guid,
                            "ifc_type": element_type,
                            "vertices": [tuple(map(float, point)) for point in vertices_array],
                            "floor_id": floor_id,
                        })
                    elif product is not None and any(_is_a(product, type_name) for type_name in FITTING_TYPES):
                        fitting_geometries.append({
                            "guid": guid,
                            "vertices": [tuple(map(float, point)) for point in vertices_array],
                            "floor_id": floor_id,
                        })
            has_geometry = iterator.next()
    except Exception as error:
        raise IngestionError("convert_geometry", f"IFC geometry conversion failed: {error}") from error

    if not meshes_by_floor:
        raise IngestionError(
            "convert_geometry",
            "No renderable IFC product geometry was found; no GLB artifact was generated.",
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts: list[dict[str, Any]] = []
    for floor_index, (floor_id, floor_meshes) in enumerate(
        sorted(meshes_by_floor.items(), key=lambda item: item[0] or "")
    ):
        floor = floor_by_guid.get(floor_id) if floor_id else None
        filename = (
            f"floor-{floor_index + 1:03d}-{_slug(floor.name)}.glb"
            if floor
            else f"unassigned-{floor_index + 1:03d}.glb"
        )
        scene = trimesh.Scene()
        for guid, mesh in floor_meshes:
            scene.add_geometry(_simplify_mesh(mesh, guid), geom_name=guid, node_name=guid)
        destination = output_dir / filename
        try:
            destination.write_bytes(_scene_bytes(scene))
        except IngestionError:
            raise
        except Exception as error:
            raise IngestionError("export_glb", f"Could not export {filename}: {error}") from error
        artifacts.append({
            "kind": "glb",
            "filename": filename,
            "floor_id": floor_id,
            "size_bytes": destination.stat().st_size,
        })

    graph = build_conduit_graph(
        pathway_geometries,
        fitting_geometries,
        snap_tolerance_m=SNAP_TOLERANCE_M,
    )
    diagnostics.extend(graph.diagnostics)
    if not floors:
        diagnostics.append(Diagnostic(
            severity="warning",
            code="no_building_storeys",
            message="No IfcBuildingStorey elements were found; floor-based viewing needs manual assignment.",
        ))
    if any(floor_id is None for floor_id in meshes_by_floor):
        diagnostics.append(Diagnostic(
            severity="warning",
            code="unassigned_geometry",
            message="Some renderable elements are not assigned to a building storey.",
        ))

    graph_path = output_dir / "spatial-graph.json"
    graph_path.write_text(graph.model_dump_json(indent=2), encoding="utf-8")
    artifacts.append({
        "kind": "spatial-graph",
        "filename": graph_path.name,
        "floor_id": None,
        "size_bytes": graph_path.stat().st_size,
    })

    manifest = {
        "schema_version": "1.0.0",
        "source": {
            "filename": source_path.name,
            "sha256": _sha256(source_path),
            "ifc_schema": schema,
        },
        "coordinates": {
            "system": "ifc-world",
            "length_unit": "m",
            "geometry_world_coordinates": True,
            "ifc_project_unit_scale_to_meters": unit_scale,
            "mesh_simplification": {
                "face_threshold": SIMPLIFY_FACE_THRESHOLD,
                "target_face_ratio": SIMPLIFY_FACE_RATIO,
            },
        },
        "floors": [floor.model_dump(mode="json") for floor in floors],
        "rendered_elements": element_index,
        "graph": {
            "schema_version": graph.schema_version,
            "node_count": len(graph.nodes),
            "edge_count": len(graph.edges),
        },
        "artifacts": artifacts,
        "diagnostics": [item.model_dump(mode="json") for item in diagnostics],
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    artifacts.append({
        "kind": "manifest",
        "filename": manifest_path.name,
        "floor_id": None,
        "size_bytes": manifest_path.stat().st_size,
    })

    return PipelineResult(
        floors=[floor.model_dump(mode="json") for floor in floors],
        artifacts=artifacts,
        diagnostics=[item.model_dump(mode="json") for item in diagnostics],
        metadata={
            "ifc_schema": schema,
            "floor_count": len(floors),
            "rendered_element_count": len(element_index),
            "pathway_count": len(pathway_geometries),
            "junction_count": len(graph.nodes),
            "conduit_edge_count": len(graph.edges),
            "source_sha256": manifest["source"]["sha256"],
            "length_unit": "m",
            "graph_schema_version": graph.schema_version,
        },
    )