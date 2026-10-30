# ArachNet BIM ingestion service

This Python service converts IFC building models into floor-separated GLB
artifacts and a versioned **wired-only** spatial graph. It does not create
network devices, infer conduit capacity, generate wireless coverage, or run
GNN inference. Buildings with no modeled cable pathways still render, with a
diagnostic explaining that their pathway graph is empty.

## Environment

Use the service-local virtual environment for every install, test, and run:

```powershell
cd services\python\bim-ingestion
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Do not install these packages into the global Python environment. The
repository ignores `.venv/`. `requirements.txt` contains both runtime and
test dependencies; `pyproject.toml` configures package discovery and pytest.

## Run and test

```powershell
.\.venv\Scripts\python.exe -m uvicorn bim_ingestion.main:app --reload
.\.venv\Scripts\python.exe -m pytest
```

The API listens on `http://127.0.0.1:8000` by default. Set
`BIM_INGESTION_DATA_DIR` to change the local artifact directory, or
`BIM_INGESTION_MAX_UPLOAD_BYTES` to change the default 512 MiB upload cap.
`BIM_INGESTION_CORS_ORIGINS` accepts a comma-separated list of browser origins;
by default it permits the local React development server and packaged Electron
`file://` origin (`null`).

The React application uses the shared client in `src/services/python-services.js`.
Set `REACT_APP_BIM_INGESTION_API_URL` before starting/building the frontend to
override its default `http://127.0.0.1:8000` service URL. Start this service
separately with the venv command above; it is not started by the React/Electron
development script.
The application imports per-floor GLBs into the 3D and Interactive views and
stores the wired graph with BIM floors in application state. Routing cables
through imported floors is intentionally blocked until the extracted conduit
graph and its uncalibrated capacity fields can be handled without substituting
the demo routing network.
The imported GLB is not yet projected into the Physical 2D mode; that view
shows a notice instead of substituting the demo floor plan.
Jobs are held in memory for this single-process prototype; source IFC files are
deleted after processing, while generated artifacts remain under the data
directory. A process restart clears job status; persistent job storage is a
later service-hardening step.

## API

- `GET /health`
- `POST /api/v1/imports` with a multipart `file` whose name ends in `.ifc`;
  responds `202` with a job ID.
- `GET /api/v1/imports/{job_id}` for status, progress, metadata, diagnostics,
  and artifact URLs.
- `GET /api/v1/imports/{job_id}/manifest`
- `GET /api/v1/imports/{job_id}/graph`
- `GET /api/v1/imports/{job_id}/artifacts/{filename}` for a floor GLB.

The first implementation runs ingestion as a FastAPI background task. The job
store is thread-safe within one server process; use one Uvicorn worker until
job state moves to durable/shared storage.

## Extraction behavior and limits

- IFC geometry is converted using IfcOpenShell's geometry iterator in world
  coordinates and exported to one GLB per storey, plus an unassigned GLB where
  needed. Large per-element meshes are reduced to a 50% face target while
  retaining original geometry for pathway graph extraction. The manifest maps
  IFC GUIDs to element type, storey, and name.
- Storey elevations and IFC project length-unit scale are recorded in meters.
- `IfcCableCarrierSegment` geometry is reduced to representative endpoints
  using its principal axis. Nearby endpoints and `IfcCableCarrierFitting`
  geometry centers are clustered with a recorded 0.1 m tolerance.
- Conduit edge length is measured in 3D between the resulting junctions.
  Capacity and fill are left `null` unless the IFC explicitly provides
  calibrated values; this version does not infer tray capacity.
- The graph initially contains junction and conduit elements only. The
  application can add device nodes and device-to-junction access edges after
  devices are placed and snapped.
- Missing pathways, geometry, storeys, unassigned elements, and collapsed
  pathway segments are surfaced as diagnostics. Path endpoints derived from
  a segment's principal axis are estimates; IFC connectivity relations and
  project-specific extraction calibration are not yet interpreted.

The graph JSON uses schema `1.0.0`, coordinate system `ifc-world`, meters, and
wired `conduit` edges. Wireless/RF/coverage fields are intentionally excluded.