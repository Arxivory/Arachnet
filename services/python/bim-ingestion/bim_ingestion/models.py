from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(StrEnum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Diagnostic(BaseModel):
    severity: Literal["info", "warning", "error"]
    code: str
    message: str
    ifc_guid: str | None = None


class FloorRecord(BaseModel):
    id: str
    name: str
    elevation_m: float | None = None


class ArtifactRecord(BaseModel):
    kind: Literal["glb", "spatial-graph", "manifest"]
    filename: str
    url: str
    floor_id: str | None = None
    size_bytes: int


class IngestionJob(BaseModel):
    id: str
    status: JobStatus
    stage: str
    progress: int = Field(ge=0, le=100)
    source_filename: str
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    error: str | None = None
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    artifacts: list[ArtifactRecord] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphNode(BaseModel):
    id: str
    node_type: Literal["junction"]
    position_m: tuple[float, float, float]
    kind: Literal["segment-end", "fitting", "intersection"]
    floor_id: str | None = None
    source_ifc_guids: list[str] = Field(default_factory=list)


class GraphEdge(BaseModel):
    id: str
    edge_type: Literal["conduit"]
    source: str
    target: str
    length_m: float = Field(ge=0)
    floor_id: str | None = None
    source_ifc_guid: str
    ifc_type: str
    capacity_mm2: float | None = None
    max_fill_ratio: float | None = None


class SpatialGraph(BaseModel):
    schema_version: Literal["1.0.0"] = "1.0.0"
    coordinate_system: Literal["ifc-world"] = "ifc-world"
    length_unit: Literal["m"] = "m"
    extraction: dict[str, Any]
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    diagnostics: list[Diagnostic] = Field(default_factory=list)