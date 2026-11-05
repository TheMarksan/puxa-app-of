"""Modo demonstração (PUXA_DEMO=1): simula o download e gera a mídia localmente com ffmpeg.

Serve para desenvolver e testar a interface (progresso, corte, envio) sem depender do YouTube
liberar a mídia para o IP da máquina. Os metadados continuam vindo do YouTube de verdade.
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path
from typing import Any

from yt_dlp.utils import DownloadCancelled

from .errors import PuxaError

DEFAULT_DURATION = 45.0


def _tick(job: Any, seconds: float, steps: int, total: int, stage: str) -> None:
    for i in range(1, steps + 1):
        if job.cancel_event.is_set():
            raise DownloadCancelled()
        time.sleep(seconds / steps)
        done = int(total * i / steps)
        job.status = "downloading"
        job.stage = stage
        job.total = total
        job.downloaded = done
        job.progress = done / total
        job.speed = total / seconds
        job.eta = int((total - done) / job.speed)


def run_demo(job: Any) -> Path:
    duration = float(job.duration or DEFAULT_DURATION)
    if job.kind == "mp3":
        estimated = int(job.quality * 1000 / 8 * duration)
        _tick(job, 2.5, 25, estimated, "Baixando o áudio")
        job.status, job.stage, job.progress = "processing", "Convertendo para MP3", None
        target = job.dir / "media.mp3"
        # Tom com volume variando, para a forma de onda ter relevo de verdade.
        source = (
            "aevalsrc='0.7*sin(2*PI*196*t)*(0.35+0.65*abs(sin(2*PI*0.21*t)))"
            "*(0.4+0.6*abs(sin(2*PI*1.3*t)))':s=44100"
        )
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", source, "-t", f"{duration:.3f}",
               "-c:a", "libmp3lame", "-b:a", f"{job.quality}k",
               "-metadata", f"title={job.title or 'Demonstração'}", "-id3v2_version", "3", str(target)]
    else:
        clip = min(duration, 60.0)
        height = job.quality
        width = int(round(height * 16 / 9 / 2) * 2)
        estimated = int(height * 2600 * clip)
        _tick(job, 3.0, 30, estimated, "Baixando o vídeo")
        job.status, job.stage, job.progress = "processing", "Juntando áudio e vídeo", None
        target = job.dir / "media.mp4"
        cmd = ["ffmpeg", "-v", "error", "-y",
               "-f", "lavfi", "-i", f"testsrc2=size={width}x{height}:rate=30",
               "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100",
               "-t", f"{clip:.3f}", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
               "-metadata", f"title={job.title or 'Demonstração'}", str(target)]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=300)
    except (subprocess.SubprocessError, OSError) as exc:
        raise PuxaError("unknown", "O modo demonstração não conseguiu gerar o arquivo (ffmpeg).", 500) from exc
    if job.cancel_event.is_set():
        raise DownloadCancelled()
    return target
