"""Operações locais com ffmpeg: duração exata, forma de onda e corte de trechos de MP3."""

from __future__ import annotations

import re
import subprocess
from array import array
from pathlib import Path

from .errors import PuxaError

WAVEFORM_RATE = 2000  # amostras por segundo usadas só para desenhar a onda
MIN_CLIP_SECONDS = 1.0


def probe_duration(path: Path) -> float | None:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        ).stdout.strip()
        return round(float(out), 3)
    except (subprocess.SubprocessError, ValueError, OSError):
        return None


def waveform_peaks(path: Path, buckets: int = 480) -> list[float]:
    """Picos normalizados (0–1) para desenhar a forma de onda no editor de trecho."""
    try:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-ac", "1",
             "-ar", str(WAVEFORM_RATE), "-f", "s16le", "-"],
            capture_output=True,
            timeout=180,
            check=True,
        ).stdout
    except (subprocess.SubprocessError, OSError) as exc:
        raise PuxaError("waveform_failed", "Não foi possível ler o áudio para desenhar a onda. Use os campos de início e fim.", 500) from exc

    samples = array("h")
    samples.frombytes(raw[: len(raw) - len(raw) % 2])
    count = len(samples)
    if count == 0:
        return [0.0] * buckets
    step = count / buckets
    peaks = []
    for i in range(buckets):
        start = int(i * step)
        end = max(int((i + 1) * step), start + 1)
        segment = samples[start:end]
        peaks.append(max(max(segment), -min(segment)) if segment else 0)
    loudest = max(peaks) or 1
    return [round(p / loudest, 3) for p in peaks]


def format_clock(seconds: float) -> str:
    """0:45, 12:03, 1:02:09 — o formato que as pessoas leem no player."""
    total = int(round(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _filename_stamp(seconds: float) -> str:
    # 0m04s, 1h02m09s: sem ":" porque o Windows não aceita esse caractere em nomes de arquivo.
    total = int(round(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}h{m:02d}m{s:02d}s" if h else f"{m}m{s:02d}s"


def validate_range(start: float, end: float, duration: float | None) -> tuple[float, float]:
    if start < 0 or end <= start:
        raise PuxaError("invalid_range", "O fim do trecho precisa vir depois do início.", 422)
    if end - start < MIN_CLIP_SECONDS:
        raise PuxaError("invalid_range", "O trecho precisa ter pelo menos 1 segundo.", 422)
    if duration and end > duration + 0.5:
        raise PuxaError(
            "invalid_range",
            f"O áudio termina em {format_clock(duration)}. Ajuste o fim do trecho.",
            422,
        )
    if duration:
        end = min(end, duration)
    return round(start, 3), round(end, 3)


def cut_mp3(source: Path, target: Path, start: float, end: float) -> None:
    """Corta sem recodificar: mantém a qualidade, a capa e os metadados, e leva menos de um segundo."""
    try:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-i", str(source),
             "-t", f"{end - start:.3f}", "-map", "0", "-c", "copy", "-id3v2_version", "3", str(target)],
            capture_output=True,
            timeout=120,
            check=True,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        target.unlink(missing_ok=True)
        raise PuxaError("clip_failed", "Não foi possível cortar o áudio. Tente um trecho um pouco diferente.", 500) from exc


_UNSAFE = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')


def safe_title(title: str, fallback: str) -> str:
    name = _UNSAFE.sub(" ", title or "")
    name = re.sub(r"\s+", " ", name).strip(" .")
    return (name[:120].rstrip(" .") or fallback)


def clip_filename(title: str, start: float, end: float) -> str:
    return f"{safe_title(title, 'audio')} (trecho {_filename_stamp(start)} a {_filename_stamp(end)}).mp3"
