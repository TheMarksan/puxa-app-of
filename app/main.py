"""API HTTP e arquivos estáticos do Puxa."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import config, demo, youtube
from .errors import PuxaError
from .jobs import JobManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
for noisy in ("httpx", "httpx2"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

MP3_QUALITIES = {kbps for kbps, _ in youtube.MP3_BITRATES}
MP4_QUALITIES = set(youtube.MP4_HEIGHTS)


class JobRequest(BaseModel):
    url: str = Field(max_length=500)
    format: Literal["mp3", "mp4"]
    quality: int


class ClipRequest(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)


def create_app(
    runner: youtube.Runner | None = None,
    info_fetcher=None,
    cleanup_interval: float = 60.0,
) -> FastAPI:
    """Fábrica do app. Os testes injetam `runner` e `info_fetcher` para não depender da rede."""
    fetch_info = info_fetcher or youtube.fetch_info
    cache = youtube.InfoCache(config.INFO_CACHE_SECONDS)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        default_runner = demo.run_demo if config.DEMO else youtube.run_download
        manager = JobManager(config.DATA_DIR, config.MAX_PARALLEL_JOBS, config.FILE_TTL_SECONDS, runner or default_runner)
        app.state.jobs = manager

        async def sweep() -> None:
            while True:
                await asyncio.sleep(cleanup_interval)
                manager.cleanup()

        task = asyncio.create_task(sweep())
        try:
            yield
        finally:
            task.cancel()
            manager.shutdown()

    app = FastAPI(title="Puxa", lifespan=lifespan, docs_url="/api/docs", redoc_url=None)

    @app.exception_handler(PuxaError)
    async def puxa_error(_: Request, exc: PuxaError) -> JSONResponse:
        return JSONResponse({"error": exc.as_dict()}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            {"error": {"code": "invalid_request", "message": "O pedido veio incompleto. Recarregue a página e tente de novo."}},
            status_code=422,
        )

    def jobs(request: Request) -> JobManager:
        return request.app.state.jobs

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True, "demo": config.DEMO and runner is None, "file_ttl": config.FILE_TTL_SECONDS}

    @app.get("/api/info")
    async def info(url: str = Query(max_length=500)) -> dict:
        video_id = youtube.parse_video_id(url)
        cached = cache.get(video_id)
        if cached:
            return cached
        summary = await run_in_threadpool(fetch_info, video_id)
        cache.put(video_id, summary)
        return summary

    @app.post("/api/jobs", status_code=202)
    async def create_job(body: JobRequest, request: Request) -> dict:
        video_id = youtube.parse_video_id(body.url)
        allowed = MP3_QUALITIES if body.format == "mp3" else MP4_QUALITIES
        if body.quality not in allowed:
            raise PuxaError("invalid_quality", "Essa qualidade não existe para este formato. Escolha outra.", 422)
        known = cache.get(video_id) or {}
        job = jobs(request).create(video_id, body.format, body.quality, known.get("title", ""), known.get("duration"))
        return job.to_dict(config.FILE_TTL_SECONDS)

    @app.get("/api/jobs/{job_id}")
    async def get_job(job_id: str, request: Request) -> dict:
        return jobs(request).get(job_id).to_dict(config.FILE_TTL_SECONDS)

    @app.delete("/api/jobs/{job_id}")
    async def cancel_job(job_id: str, request: Request) -> dict:
        return jobs(request).cancel(job_id).to_dict(config.FILE_TTL_SECONDS)

    @app.get("/api/jobs/{job_id}/file")
    async def job_file(job_id: str, request: Request, inline: bool = False) -> FileResponse:
        job = jobs(request).get_ready(job_id)
        return FileResponse(
            job.path,
            media_type="audio/mpeg" if job.kind == "mp3" else "video/mp4",
            filename=job.filename,
            content_disposition_type="inline" if inline else "attachment",
        )

    @app.get("/api/jobs/{job_id}/waveform")
    async def waveform(job_id: str, request: Request) -> dict:
        job, peaks = await run_in_threadpool(jobs(request).waveform, job_id)
        return {"duration": job.duration, "peaks": peaks}

    @app.post("/api/jobs/{job_id}/clips", status_code=201)
    async def create_clip(job_id: str, body: ClipRequest, request: Request) -> dict:
        job, clip = await run_in_threadpool(jobs(request).make_clip, job_id, body.start, body.end)
        return {
            "id": clip.id,
            "start": clip.start,
            "end": clip.end,
            "filename": clip.filename,
            "size": clip.size,
            "url": f"/api/jobs/{job.id}/clips/{clip.id}/file",
        }

    @app.get("/api/jobs/{job_id}/clips/{clip_id}/file")
    async def clip_file(job_id: str, clip_id: str, request: Request) -> FileResponse:
        clip = jobs(request).get_clip(job_id, clip_id)
        return FileResponse(clip.path, media_type="audio/mpeg", filename=clip.filename)

    app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="static")
    return app


app = create_app()
