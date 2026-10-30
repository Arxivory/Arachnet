from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .jobs import InMemoryJobStore, JobNotFoundError
from .models import ArtifactRecord, IngestionJob, JobStatus
from .pipeline import IngestionError, ingest_ifc

MAX_UPLOAD_BYTES = int(os.environ.get("BIM_INGESTION_MAX_UPLOAD_BYTES", 512 * 1024 * 1024))
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def create_app(
    *,
    data_dir: Path | None = None,
    max_upload_bytes: int = MAX_UPLOAD_BYTES,
) -> FastAPI:
    if max_upload_bytes < 1:
        raise ValueError("The maximum IFC upload size must be a positive number of bytes.")
    root = (data_dir or Path(os.environ.get("BIM_INGESTION_DATA_DIR", DEFAULT_DATA_DIR))).resolve()
    root.mkdir(parents=True, exist_ok=True)
    jobs = InMemoryJobStore()
    app = FastAPI(
        title="ArachNet BIM Ingestion",
        version="0.1.0",
        description="Local IFC ingestion into floor GLBs and wired spatial graphs.",
    )
    cors_origins = [
        origin.strip()
        for origin in os.environ.get(
            "BIM_INGESTION_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,null",
        ).split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.state.data_dir = root
    app.state.jobs = jobs
    app.state.max_upload_bytes = max_upload_bytes

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "bim-ingestion"}

    @app.post("/api/v1/imports", response_model=IngestionJob, status_code=202)
    async def create_import(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
    ) -> IngestionJob:
        source_filename = Path(file.filename or "upload.ifc").name
        if Path(source_filename).suffix.lower() != ".ifc":
            raise HTTPException(status_code=415, detail="Only .ifc files are supported.")

        temporary_path: Path | None = None
        size_bytes = 0
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                prefix="ifc-upload-",
                suffix=".tmp",
                dir=root,
                delete=False,
            ) as destination:
                temporary_path = Path(destination.name)
                while chunk := await file.read(1024 * 1024):
                    size_bytes += len(chunk)
                    if size_bytes > max_upload_bytes:
                        raise HTTPException(
                            status_code=413,
                            detail=f"IFC upload exceeds the {max_upload_bytes}-byte limit.",
                        )
                    destination.write(chunk)
        except HTTPException:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            raise
        except OSError as error:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Could not stage the IFC upload.") from error
        finally:
            await file.close()

        if size_bytes == 0:
            temporary_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="IFC upload is empty.")

        job_id = str(uuid.uuid4())
        job_dir = root / job_id
        job_dir.mkdir()
        source_path = job_dir / "source.ifc"
        temporary_path.replace(source_path)
        job = jobs.create(IngestionJob(
            id=job_id,
            status=JobStatus.UPLOADED,
            stage="queued",
            progress=0,
            source_filename=source_filename,
            metadata={"upload_size_bytes": size_bytes},
        ))
        background_tasks.add_task(_run_pipeline, jobs, job_id, source_path, job_dir)
        return job

    @app.get("/api/v1/imports/{job_id}", response_model=IngestionJob)
    def get_import(job_id: str) -> IngestionJob:
        try:
            return jobs.get(job_id)
        except JobNotFoundError as error:
            raise HTTPException(status_code=404, detail="Import job not found.") from error

    @app.get("/api/v1/imports/{job_id}/manifest")
    def get_manifest(job_id: str) -> FileResponse:
        return _artifact_response(jobs, root, job_id, "manifest.json", "application/json")

    @app.get("/api/v1/imports/{job_id}/graph")
    def get_graph(job_id: str) -> FileResponse:
        return _artifact_response(jobs, root, job_id, "spatial-graph.json", "application/json")

    @app.get("/api/v1/imports/{job_id}/artifacts/{filename}")
    def get_artifact(job_id: str, filename: str) -> FileResponse:
        if Path(filename).name != filename or not filename.lower().endswith(".glb"):
            raise HTTPException(status_code=404, detail="Artifact not found.")
        return _artifact_response(jobs, root, job_id, filename, "model/gltf-binary")

    return app


def _artifact_response(
    jobs: InMemoryJobStore,
    root: Path,
    job_id: str,
    filename: str,
    media_type: str,
) -> FileResponse:
    try:
        job = jobs.get(job_id)
    except JobNotFoundError as error:
        raise HTTPException(status_code=404, detail="Import job not found.") from error
    if job.status != JobStatus.READY:
        raise HTTPException(status_code=409, detail="Import artifacts are not ready.")
    artifact = next((item for item in job.artifacts if item.filename == filename), None)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found.")
    path = (root / job_id / "artifacts" / filename).resolve()
    if path.parent != (root / job_id / "artifacts").resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return FileResponse(path, media_type=media_type, filename=filename)


def _run_pipeline(
    jobs: InMemoryJobStore,
    job_id: str,
    source_path: Path,
    job_dir: Path,
) -> None:
    jobs.update(
        job_id,
        status=JobStatus.PROCESSING,
        stage="parse_ifc",
        progress=10,
    )
    try:
        result = ingest_ifc(source_path, job_dir / "artifacts")
        artifact_records = [
            ArtifactRecord(
                kind=artifact["kind"],
                filename=artifact["filename"],
                url=(
                    f"/api/v1/imports/{job_id}/artifacts/{artifact['filename']}"
                    if artifact["kind"] == "glb"
                    else f"/api/v1/imports/{job_id}/{artifact['kind']}"
                    if artifact["kind"] == "spatial-graph"
                    else f"/api/v1/imports/{job_id}/manifest"
                ),
                floor_id=artifact["floor_id"],
                size_bytes=artifact["size_bytes"],
            )
            for artifact in result.artifacts
        ]
        jobs.update(
            job_id,
            status=JobStatus.READY,
            stage="ready",
            progress=100,
            diagnostics=result.diagnostics,
            artifacts=artifact_records,
            metadata={**jobs.get(job_id).metadata, **result.metadata, "floors": result.floors},
        )
    except IngestionError as error:
        jobs.fail(job_id, error.stage, str(error))
    except Exception as error:
        jobs.fail(job_id, "internal", f"Unexpected ingestion failure: {error}")
    finally:
        source_path.unlink(missing_ok=True)
        try:
            job_dir.rmdir()
        except OSError:
            pass


app = create_app()