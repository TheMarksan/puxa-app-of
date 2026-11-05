"""Fila de pedidos de download, com progresso consultável, cancelamento e expiração."""

from __future__ import annotations

import logging
import secrets
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from yt_dlp.utils import DownloadCancelled

from . import media
from .errors import PuxaError

log = logging.getLogger("puxa.jobs")

ACTIVE = {"queued", "downloading", "processing"}


@dataclass
class Clip:
    id: str
    start: float
    end: float
    path: Path
    filename: str
    size: int


@dataclass
class Job:
    id: str
    video_id: str
    kind: str  # "mp3" | "mp4"
    quality: int
    dir: Path
    title: str = ""
    duration: float | None = None
    status: str = "queued"  # queued | downloading | processing | ready | error | cancelled
    stage: str = "Na fila"
    progress: float | None = 0.0
    downloaded: int = 0
    total: int | None = None
    speed: float | None = None
    eta: int | None = None
    error: PuxaError | None = None
    path: Path | None = None
    filename: str | None = None
    size: int | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    clips: dict[str, Clip] = field(default_factory=dict)
    waveform: list[float] | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def quality_label(self) -> str:
        return f"{self.quality} kbps" if self.kind == "mp3" else f"{self.quality}p"

    def expires_at(self, ttl: int) -> float:
        return (self.finished_at or self.created_at) + ttl

    def to_dict(self, ttl: int) -> dict:
        return {
            "id": self.id,
            "video_id": self.video_id,
            "format": self.kind,
            "quality": self.quality,
            "quality_label": self.quality_label,
            "title": self.title,
            "status": self.status,
            "stage": self.stage,
            "progress": None if self.progress is None else round(self.progress, 4),
            "downloaded": self.downloaded,
            "total": self.total,
            "speed": self.speed,
            "eta": self.eta,
            "error": self.error.as_dict() if self.error else None,
            "filename": self.filename,
            "size": self.size,
            "duration": self.duration,
            "expires_at": self.expires_at(ttl) if self.status == "ready" else None,
        }


class JobManager:
    def __init__(self, data_dir: Path, max_workers: int, ttl: int, runner: Callable[[Job], Path]) -> None:
        self.data_dir = data_dir / "jobs"
        self.ttl = ttl
        self.runner = runner
        self.jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="puxa-dl")
        # Arquivos de uma execução anterior não têm mais dono: comece limpo.
        shutil.rmtree(self.data_dir, ignore_errors=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------ ciclo de vida

    def create(self, video_id: str, kind: str, quality: int, title: str = "", duration: float | None = None) -> Job:
        job_id = secrets.token_urlsafe(9)
        job_dir = self.data_dir / job_id
        job_dir.mkdir(parents=True)
        job = Job(id=job_id, video_id=video_id, kind=kind, quality=quality, dir=job_dir, title=title, duration=duration)
        with self._lock:
            self.jobs[job_id] = job
        self._executor.submit(self._run, job)
        return job

    def get(self, job_id: str) -> Job:
        with self._lock:
            job = self.jobs.get(job_id)
        if job is None:
            raise PuxaError(
                "job_not_found",
                "Este arquivo não está mais no servidor. Os arquivos são apagados depois de um tempo; gere de novo.",
                404,
            )
        return job

    def get_ready(self, job_id: str) -> Job:
        job = self.get(job_id)
        if job.status != "ready" or not job.path or not job.path.exists():
            raise PuxaError("not_ready", "O arquivo ainda não está pronto.", 409)
        return job

    def cancel(self, job_id: str) -> Job:
        job = self.get(job_id)
        if job.status in ACTIVE:
            job.cancel_event.set()
            if job.status == "queued":
                self._finish_cancelled(job)
        return job

    def _finish_cancelled(self, job: Job) -> None:
        job.status = "cancelled"
        job.stage = "Cancelado"
        job.progress = None
        job.finished_at = time.time()

    def _run(self, job: Job) -> None:
        if job.cancel_event.is_set():
            self._finish_cancelled(job)
            return
        job.status = "downloading"
        job.stage = "Conectando ao YouTube"
        job.progress = None
        try:
            path = self.runner(job)
            job.path = path
            job.size = path.stat().st_size
            job.duration = media.probe_duration(path) or job.duration
            title = media.safe_title(job.title, "audio" if job.kind == "mp3" else "video")
            job.filename = f"{title}.mp3" if job.kind == "mp3" else f"{title} ({job.quality}p).mp4"
            job.progress = 1.0
            job.speed = job.eta = None
            job.stage = "Pronto"
            job.status = "ready"
        except DownloadCancelled:
            self._finish_cancelled(job)
            shutil.rmtree(job.dir, ignore_errors=True)
            return
        except PuxaError as exc:
            self._fail(job, exc)
        except Exception:  # noqa: BLE001 — qualquer falha vira mensagem legível
            log.exception("download falhou para %s", job.video_id)
            self._fail(job, PuxaError("unknown", "Algo deu errado ao preparar o arquivo. Tente de novo.", 500))
        job.finished_at = time.time()

    def _fail(self, job: Job, exc: PuxaError) -> None:
        if job.cancel_event.is_set():
            self._finish_cancelled(job)
            return
        job.error = exc
        job.status = "error"
        job.stage = "Erro"
        job.progress = None
        job.speed = job.eta = None
        shutil.rmtree(job.dir, ignore_errors=True)

    # ------------------------------------------------------------ trechos e onda

    def waveform(self, job_id: str) -> tuple[Job, list[float]]:
        job = self.get_ready(job_id)
        if job.kind != "mp3":
            raise PuxaError("not_audio", "A forma de onda só existe para arquivos MP3.", 409)
        with job.lock:
            if job.waveform is None:
                job.waveform = media.waveform_peaks(job.path)  # type: ignore[arg-type]
        return job, job.waveform

    def make_clip(self, job_id: str, start: float, end: float) -> tuple[Job, Clip]:
        job = self.get_ready(job_id)
        if job.kind != "mp3":
            raise PuxaError("not_audio", "Só é possível cortar arquivos MP3.", 409)
        start, end = media.validate_range(start, end, job.duration)
        with job.lock:
            for clip in job.clips.values():
                if abs(clip.start - start) < 0.01 and abs(clip.end - end) < 0.01 and clip.path.exists():
                    return job, clip
            clip_id = secrets.token_urlsafe(6)
            target = job.dir / f"trecho-{clip_id}.mp3"
            media.cut_mp3(job.path, target, start, end)  # type: ignore[arg-type]
            clip = Clip(
                id=clip_id,
                start=start,
                end=end,
                path=target,
                filename=media.clip_filename(job.title, start, end),
                size=target.stat().st_size,
            )
            job.clips[clip_id] = clip
            # Usar o arquivo renova o prazo para quem está editando o trecho.
            job.finished_at = time.time()
        return job, clip

    def get_clip(self, job_id: str, clip_id: str) -> Clip:
        job = self.get_ready(job_id)
        clip = job.clips.get(clip_id)
        if clip is None or not clip.path.exists():
            raise PuxaError("clip_not_found", "Este trecho não está mais no servidor. Corte de novo.", 404)
        return clip

    # ------------------------------------------------------------ limpeza

    def cleanup(self, now: float | None = None) -> int:
        now = now or time.time()
        with self._lock:
            expired = [
                job for job in self.jobs.values()
                if job.status not in ACTIVE and job.expires_at(self.ttl) < now
            ]
            for job in expired:
                del self.jobs[job.id]
        for job in expired:
            shutil.rmtree(job.dir, ignore_errors=True)
        return len(expired)

    def shutdown(self) -> None:
        for job in list(self.jobs.values()):
            job.cancel_event.set()
        self._executor.shutdown(wait=False, cancel_futures=True)
