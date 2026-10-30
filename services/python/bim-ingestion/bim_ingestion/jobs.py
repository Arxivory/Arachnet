from __future__ import annotations

from threading import RLock

from .models import Diagnostic, IngestionJob, JobStatus, utc_now


class JobNotFoundError(KeyError):
    pass


class InMemoryJobStore:
    """Single-process job state; artifacts remain on disk across process restarts."""

    def __init__(self) -> None:
        self._jobs: dict[str, IngestionJob] = {}
        self._lock = RLock()

    def create(self, job: IngestionJob) -> IngestionJob:
        with self._lock:
            self._jobs[job.id] = job.model_copy(deep=True)
            return self._jobs[job.id].model_copy(deep=True)

    def get(self, job_id: str) -> IngestionJob:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise JobNotFoundError(job_id)
            return job.model_copy(deep=True)

    def update(self, job_id: str, **changes: object) -> IngestionJob:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise JobNotFoundError(job_id)
            updated = IngestionJob.model_validate({
                **job.model_dump(),
                **changes,
                "updated_at": utc_now(),
            })
            self._jobs[job_id] = updated
            return updated.model_copy(deep=True)

    def fail(self, job_id: str, stage: str, message: str) -> None:
        job = self.get(job_id)
        diagnostic = Diagnostic(
            severity="error",
            code=f"{stage}_failed",
            message=message,
        )
        self.update(
            job_id,
            status=JobStatus.FAILED,
            stage=stage,
            error=message,
            diagnostics=[*job.diagnostics, diagnostic],
        )