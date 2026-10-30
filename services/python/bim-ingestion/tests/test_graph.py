import pytest

from bim_ingestion.graph import build_conduit_graph


def tube_vertices(start_x: float, end_x: float, z: float = 0.0) -> list[tuple[float, float, float]]:
    return [
        (start_x, -0.02, z - 0.02),
        (end_x, -0.02, z - 0.02),
        (start_x, 0.02, z + 0.02),
        (end_x, 0.02, z + 0.02),
    ]


def test_builds_connected_conduit_edges_and_snaps_nearby_endpoints() -> None:
    graph = build_conduit_graph(
        pathways=[
            {
                "guid": "segment-a",
                "ifc_type": "IfcCableCarrierSegment",
                "vertices": tube_vertices(0.0, 1.0),
                "floor_id": "storey-1",
            },
            {
                "guid": "segment-b",
                "ifc_type": "IfcCableCarrierSegment",
                "vertices": tube_vertices(1.05, 2.0),
                "floor_id": "storey-1",
            },
        ],
        fittings=[],
        snap_tolerance_m=0.1,
    )

    assert len(graph.nodes) == 3
    assert len(graph.edges) == 2
    assert graph.edges[0].target == graph.edges[1].source
    assert graph.edges[0].length_m == pytest.approx(1.025)
    assert graph.schema_version == "1.0.0"
    assert graph.length_unit == "m"


def test_keeps_three_dimensional_lengths_and_does_not_invent_fill_values() -> None:
    graph = build_conduit_graph(
        pathways=[{
            "guid": "diagonal",
            "ifc_type": "IfcCableCarrierSegment",
            "vertices": [
                (0.0, 0.0, 0.0),
                (0.01, 0.0, 0.0),
                (3.0, 0.0, 4.0),
                (3.01, 0.0, 4.0),
            ],
            "floor_id": "storey-1",
        }],
        fittings=[],
    )

    assert len(graph.edges) == 1
    assert graph.edges[0].length_m == pytest.approx(5.0, abs=0.02)
    assert graph.edges[0].capacity_mm2 is None
    assert graph.edges[0].max_fill_ratio is None


def test_warns_when_ifc_has_no_cable_carrier_segments() -> None:
    graph = build_conduit_graph(pathways=[], fittings=[])

    assert graph.nodes == []
    assert graph.edges == []
    assert graph.diagnostics[0].code == "no_cable_pathways"


def test_rejects_non_positive_junction_snap_tolerance() -> None:
    with pytest.raises(ValueError, match="positive finite distance"):
        build_conduit_graph(pathways=[], fittings=[], snap_tolerance_m=0)