from fastapi.testclient import TestClient

from bim_ingestion.main import create_app


def test_health_endpoint(tmp_path) -> None:
    client = TestClient(create_app(data_dir=tmp_path))

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "bim-ingestion"}


def test_rejects_non_ifc_uploads(tmp_path) -> None:
    client = TestClient(create_app(data_dir=tmp_path))

    response = client.post(
        "/api/v1/imports",
        files={"file": ("model.ifczip", b"not an IFC", "application/octet-stream")},
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Only .ifc files are supported."


def test_rejects_empty_and_over_limit_uploads_without_leaving_staged_files(tmp_path) -> None:
    client = TestClient(create_app(data_dir=tmp_path, max_upload_bytes=8))

    empty_response = client.post(
        "/api/v1/imports",
        files={"file": ("empty.ifc", b"", "application/octet-stream")},
    )
    oversized_response = client.post(
        "/api/v1/imports",
        files={"file": ("large.ifc", b"123456789", "application/octet-stream")},
    )

    assert empty_response.status_code == 400
    assert oversized_response.status_code == 413
    assert list(tmp_path.iterdir()) == []


def test_returns_failed_job_with_stage_diagnostic_for_invalid_ifc(tmp_path) -> None:
    client = TestClient(create_app(data_dir=tmp_path))

    response = client.post(
        "/api/v1/imports",
        files={"file": ("broken.ifc", b"not an IFC STEP file", "application/octet-stream")},
    )

    assert response.status_code == 202
    job = response.json()
    completed_job = client.get(f"/api/v1/imports/{job['id']}").json()
    assert job["status"] == "uploaded"
    assert completed_job["status"] == "failed"
    assert completed_job["stage"] == "parse_ifc"
    assert completed_job["diagnostics"][0]["code"] == "parse_ifc_failed"
    assert completed_job["error"].startswith("Could not parse IFC file:")
    assert client.get(f"/api/v1/imports/{job['id']}/manifest").status_code == 409


def test_hides_unknown_jobs_and_rejects_artifact_path_traversal(tmp_path) -> None:
    client = TestClient(create_app(data_dir=tmp_path))

    assert client.get("/api/v1/imports/missing").status_code == 404
    assert client.get("/api/v1/imports/missing/artifacts/../../secret.glb").status_code == 404