from __future__ import annotations

import hashlib
import math
from collections import defaultdict
from typing import Any

import numpy as np

from .models import Diagnostic, GraphEdge, GraphNode, SpatialGraph


def _distance(left: tuple[float, float, float], right: tuple[float, float, float]) -> float:
    return math.dist(left, right)


def _representative_endpoints(
    vertices: list[tuple[float, float, float]],
) -> tuple[tuple[float, float, float], tuple[float, float, float]] | None:
    if len(vertices) < 2:
        return None
    points = np.asarray(vertices, dtype=np.float64)
    centered = points - points.mean(axis=0)
    _, _, directions = np.linalg.svd(centered, full_matrices=False)
    axis = directions[0]
    projections = centered @ axis
    if float(projections.max() - projections.min()) <= 1e-6:
        return None
    start = points.mean(axis=0) + projections.min() * axis
    end = points.mean(axis=0) + projections.max() * axis
    return tuple(map(float, start)), tuple(map(float, end))


class _DisjointSet:
    def __init__(self, size: int) -> None:
        self.parents = list(range(size))

    def find(self, item: int) -> int:
        while self.parents[item] != item:
            self.parents[item] = self.parents[self.parents[item]]
            item = self.parents[item]
        return item

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parents[max(left_root, right_root)] = min(left_root, right_root)


def build_conduit_graph(
    pathways: list[dict[str, Any]],
    fittings: list[dict[str, Any]],
    *,
    snap_tolerance_m: float = 0.1,
) -> SpatialGraph:
    """Build junction/conduit relations from IFC pathway geometry in world meters."""
    if not math.isfinite(snap_tolerance_m) or snap_tolerance_m <= 0:
        raise ValueError("Junction snap tolerance must be a positive finite distance.")

    diagnostics: list[Diagnostic] = []
    endpoint_records: list[dict[str, Any]] = []
    pathway_ends: dict[str, tuple[int, int]] = {}

    for pathway in sorted(pathways, key=lambda item: item["guid"]):
        endpoints = _representative_endpoints(pathway["vertices"])
        if endpoints is None:
            diagnostics.append(Diagnostic(
                severity="warning",
                code="pathway_axis_unavailable",
                message="Pathway geometry did not yield two distinct route endpoints.",
                ifc_guid=pathway["guid"],
            ))
            continue
        indices = []
        for endpoint_index, position in enumerate(endpoints):
            indices.append(len(endpoint_records))
            endpoint_records.append({
                "key": f'{pathway["guid"]}:end:{endpoint_index}',
                "position": position,
                "kind": "segment-end",
                "guid": pathway["guid"],
                "floor_id": pathway.get("floor_id"),
            })
        pathway_ends[pathway["guid"]] = (indices[0], indices[1])

    for fitting in sorted(fittings, key=lambda item: item["guid"]):
        vertices = fitting["vertices"]
        if not vertices:
            diagnostics.append(Diagnostic(
                severity="warning",
                code="fitting_geometry_unavailable",
                message="Fitting has no usable geometry and was omitted from the pathway graph.",
                ifc_guid=fitting["guid"],
            ))
            continue
        center = tuple(map(float, np.asarray(vertices, dtype=np.float64).mean(axis=0)))
        endpoint_records.append({
            "key": f'{fitting["guid"]}:center',
            "position": center,
            "kind": "fitting",
            "guid": fitting["guid"],
            "floor_id": fitting.get("floor_id"),
        })

    if not pathways:
        diagnostics.append(Diagnostic(
            severity="warning",
            code="no_cable_pathways",
            message=(
                "No IfcCableCarrierSegment elements were found. "
                "The IFC may not contain modeled cable containment."
            ),
        ))

    disjoint_set = _DisjointSet(len(endpoint_records))
    tolerance = snap_tolerance_m
    buckets: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for index, record in enumerate(endpoint_records):
        position = record["position"]
        cell = tuple(math.floor(coordinate / tolerance) for coordinate in position)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for candidate in buckets[(cell[0] + dx, cell[1] + dy, cell[2] + dz)]:
                        if _distance(position, endpoint_records[candidate]["position"]) <= tolerance:
                            disjoint_set.union(index, candidate)
        buckets[cell].append(index)

    clusters: dict[int, list[int]] = defaultdict(list)
    for index in range(len(endpoint_records)):
        clusters[disjoint_set.find(index)].append(index)

    nodes: list[GraphNode] = []
    node_id_by_endpoint: dict[int, str] = {}
    for members in clusters.values():
        records = [endpoint_records[index] for index in members]
        source_keys = sorted(record["key"] for record in records)
        digest = hashlib.sha1("|".join(source_keys).encode("utf-8")).hexdigest()[:12]
        positions = [record["position"] for record in records]
        center = tuple(
            sum(position[axis] for position in positions) / len(positions)
            for axis in range(3)
        )
        floor_ids = {record["floor_id"] for record in records if record["floor_id"]}
        node_kind = (
            "fitting" if any(record["kind"] == "fitting" for record in records)
            else "intersection" if len(records) > 1
            else "segment-end"
        )
        node_id = f"junction-{digest}"
        nodes.append(GraphNode(
            id=node_id,
            node_type="junction",
            position_m=center,
            kind=node_kind,
            floor_id=next(iter(floor_ids)) if len(floor_ids) == 1 else None,
            source_ifc_guids=sorted({record["guid"] for record in records}),
        ))
        for index in members:
            node_id_by_endpoint[index] = node_id

    node_by_id = {node.id: node for node in nodes}
    edges: list[GraphEdge] = []
    for pathway in sorted(pathways, key=lambda item: item["guid"]):
        endpoints = pathway_ends.get(pathway["guid"])
        if endpoints is None:
            continue
        source_id = node_id_by_endpoint[endpoints[0]]
        target_id = node_id_by_endpoint[endpoints[1]]
        if source_id == target_id:
            diagnostics.append(Diagnostic(
                severity="warning",
                code="pathway_collapsed_by_snapping",
                message="Pathway endpoints snapped to the same junction and the edge was omitted.",
                ifc_guid=pathway["guid"],
            ))
            continue
        edges.append(GraphEdge(
            id=f'conduit-{pathway["guid"]}',
            edge_type="conduit",
            source=source_id,
            target=target_id,
            length_m=_distance(
                node_by_id[source_id].position_m,
                node_by_id[target_id].position_m,
            ),
            floor_id=pathway.get("floor_id"),
            source_ifc_guid=pathway["guid"],
            ifc_type=pathway["ifc_type"],
        ))

    return SpatialGraph(
        extraction={
            "pathway_endpoint_method": "principal_axis_geometry_extents",
            "junction_merge_method": "euclidean_tolerance_clustering",
            "junction_snap_tolerance_m": snap_tolerance_m,
            "fitting_centers_are_graph_junctions": True,
            "device_nodes_added": False,
        },
        nodes=nodes,
        edges=edges,
        diagnostics=diagnostics,
    )