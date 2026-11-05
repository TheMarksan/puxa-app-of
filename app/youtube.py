"""Tudo que conversa com o YouTube: validação de links, metadados e download via yt-dlp."""

from __future__ import annotations

import re
import shutil
import threading
import time
from pathlib import Path
from typing import Any, Callable

import yt_dlp
from yt_dlp.utils import DownloadCancelled, DownloadError, ExtractorError

from . import config
from .errors import PuxaError, from_ytdlp

# ---------------------------------------------------------------- links

_ID = re.compile(r"[A-Za-z0-9_-]{11}")
_URL = re.compile(
    r"""^(?:https?://)?
        (?:(?:www|m|music)\.)?
        (?:
            youtube\.com/(?:watch/?\?(?:[^#]*&)?v=|shorts/|live/|embed/|v/)
          | youtube-nocookie\.com/embed/
          | youtu\.be/
        )
        (?P<id>[A-Za-z0-9_-]{11})
        (?![A-Za-z0-9_-])""",
    re.X | re.I,
)

INVALID_URL = PuxaError(
    "invalid_url",
    "Isso não parece um link de vídeo do YouTube. No app, toque em Compartilhar, copie o link e cole aqui.",
)


def parse_video_id(text: str) -> str:
    """Extrai o ID de 11 caracteres de um link (ou do próprio ID). Rejeita qualquer outro endereço.

    Restringir a IDs do YouTube impede que o servidor seja usado para buscar URLs arbitrárias,
    já que o yt-dlp aceita milhares de sites.
    """
    text = (text or "").strip()
    if _ID.fullmatch(text):
        return text
    match = _URL.match(text)
    if not match:
        raise INVALID_URL
    return match.group("id")


def canonical_url(video_id: str) -> str:
    # Remove playlist, tempo e parâmetros de rastreio: baixamos sempre um único vídeo.
    return f"https://www.youtube.com/watch?v={video_id}"


# ---------------------------------------------------------------- opções do yt-dlp

MP3_BITRATES: tuple[tuple[int, str], ...] = ((320, "Máxima"), (192, "Padrão"), (128, "Compacto"))
MP4_HEIGHTS: tuple[int, ...] = (2160, 1440, 1080, 720, 480, 360, 240, 144)
_HEIGHT_NOTES = {2160: "4K", 1440: "2K", 1080: "Full HD", 720: "HD", 480: "SD"}


def _js_runtimes() -> dict[str, dict]:
    # O YouTube exige um runtime de JavaScript para liberar todos os formatos.
    found = {name: {} for name in ("deno", "node", "bun") if shutil.which(name)}
    return found or {"deno": {}}


def base_options() -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "socket_timeout": 20,
        "retries": 3,
        "fragment_retries": 3,
        "js_runtimes": _js_runtimes(),
        "cachedir": str(config.DATA_DIR / "yt-dlp-cache"),
    }
    if config.COOKIES_FILE:
        opts["cookiefile"] = config.COOKIES_FILE
    return opts


def download_options(kind: str, quality: int, job_dir: Path) -> dict[str, Any]:
    opts = base_options()
    opts.update(
        outtmpl=str(job_dir / "media.%(ext)s"),
        overwrites=True,
    )
    if kind == "mp3":
        opts.update(
            format="bestaudio/best",
            writethumbnail=True,
            postprocessors=[
                {"key": "FFmpegThumbnailsConvertor", "format": "jpg", "when": "before_dl"},
                {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": str(quality)},
                {"key": "FFmpegMetadata", "add_metadata": True},
                {"key": "EmbedThumbnail", "already_have_thumbnail": False},
            ],
        )
    else:
        # "res" usa o menor lado do quadro, então funciona também para Shorts na vertical.
        # Prefere H.264 + AAC, que abrem em qualquer aparelho e no WhatsApp.
        opts.update(
            format="bv*+ba/b",
            format_sort=[f"res:{quality}", "vcodec:h264", "acodec:aac"],
            merge_output_format="mp4",
            postprocessors=[{"key": "FFmpegMetadata", "add_metadata": True}],
        )
    return opts


# ---------------------------------------------------------------- metadados

def check_downloadable(info: dict) -> None:
    status = info.get("live_status")
    if info.get("is_live") or status == "is_live":
        raise PuxaError(
            "live",
            "Transmissões ao vivo só podem ser baixadas depois que terminam. Volte quando a live acabar.",
            409,
        )
    if status == "is_upcoming":
        raise PuxaError(
            "upcoming",
            "Este vídeo ainda não foi ao ar. Volte depois que a estreia ou transmissão terminar.",
            409,
        )
    duration = info.get("duration") or 0
    if duration > config.MAX_DURATION_SECONDS:
        limit_h = config.MAX_DURATION_SECONDS / 3600
        limit = f"{limit_h:g} hora" + ("s" if limit_h != 1 else "")
        raise PuxaError(
            "too_long",
            f"Este vídeo passa do limite de {limit}. Escolha um vídeo mais curto.",
            413,
        )


def _size_of(fmt: dict, duration: float | None) -> int | None:
    size = fmt.get("filesize") or fmt.get("filesize_approx")
    if size:
        return int(size)
    tbr = fmt.get("tbr")
    if tbr and duration:
        return int(tbr * 1000 / 8 * duration)
    return None


def _label_height(fmt: dict) -> int | None:
    match = re.match(r"(\d{3,4})p", fmt.get("format_note") or "")
    if match:
        return int(match.group(1))
    width, height = fmt.get("width"), fmt.get("height")
    if width and height:
        return min(width, height)
    return height


def _has_video(fmt: dict) -> bool:
    return fmt.get("vcodec") not in (None, "none") and bool(fmt.get("height"))


def _has_audio(fmt: dict) -> bool:
    return fmt.get("acodec") not in (None, "none")


def _best_audio(formats: list[dict]) -> dict | None:
    audio = [f for f in formats if _has_audio(f) and not _has_video(f)]
    if not audio:
        return None
    # Prefere m4a/AAC, igual ao critério usado no download.
    return max(audio, key=lambda f: (f.get("ext") == "m4a", f.get("abr") or f.get("tbr") or 0))


def summarize(info: dict) -> dict:
    """Reduz o JSON enorme do yt-dlp ao que a interface precisa mostrar."""
    duration = info.get("duration")
    formats = info.get("formats") or []
    audio = _best_audio(formats)
    audio_size = _size_of(audio, duration) if audio else None

    by_height: dict[int, list[dict]] = {}
    for fmt in formats:
        if not _has_video(fmt):
            continue
        label = _label_height(fmt)
        if label in MP4_HEIGHTS:
            by_height.setdefault(label, []).append(fmt)

    mp4 = []
    for height in MP4_HEIGHTS:
        group = by_height.get(height)
        if not group:
            continue
        h264 = [f for f in group if (f.get("vcodec") or "").startswith("avc1")]
        chosen = max(h264 or group, key=lambda f: f.get("tbr") or 0)
        size = _size_of(chosen, duration)
        if size is not None and not _has_audio(chosen):
            size = size + audio_size if audio_size else None
        fps = max(int(f.get("fps") or 0) for f in group)
        mp4.append(
            {
                "quality": height,
                "label": f"{height}p" + (str(fps) if fps > 30 else ""),
                "note": _HEIGHT_NOTES.get(height, "Baixa"),
                "size": size,
            }
        )

    mp3 = [
        {
            "quality": kbps,
            "label": f"{kbps} kbps",
            "note": note,
            "size": int(kbps * 1000 / 8 * duration) if duration else None,
        }
        for kbps, note in MP3_BITRATES
    ]

    upload = info.get("upload_date")  # AAAAMMDD
    video_id = info.get("id")
    return {
        "id": video_id,
        "title": info.get("title") or "Vídeo sem título",
        "channel": info.get("channel") or info.get("uploader"),
        "duration": duration,
        "view_count": info.get("view_count"),
        "upload_date": f"{upload[:4]}-{upload[4:6]}-{upload[6:]}" if upload and len(upload) == 8 else None,
        "thumbnail": info.get("thumbnail") or (f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else None),
        "is_short": "/shorts/" in (info.get("webpage_url") or "") or (
            (info.get("height") or 0) > (info.get("width") or 0) > 0
        ),
        "options": {"mp3": mp3, "mp4": mp4},
    }


class InfoCache:
    """Cache simples em memória, com expiração, das informações já resumidas."""

    def __init__(self, ttl: int) -> None:
        self.ttl = ttl
        self._items: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> dict | None:
        with self._lock:
            item = self._items.get(key)
            if not item:
                return None
            stored_at, value = item
            if time.monotonic() - stored_at > self.ttl:
                del self._items[key]
                return None
            return value

    def put(self, key: str, value: dict) -> None:
        with self._lock:
            self._items[key] = (time.monotonic(), value)
            if len(self._items) > 500:
                oldest = min(self._items, key=lambda k: self._items[k][0])
                del self._items[oldest]


def fetch_info(video_id: str) -> dict:
    """Consulta o YouTube (bloqueante). Chame numa thread."""
    try:
        with yt_dlp.YoutubeDL(base_options()) as ydl:
            info = ydl.extract_info(canonical_url(video_id), download=False)
    except (DownloadError, ExtractorError) as exc:
        raise from_ytdlp(exc) from exc
    check_downloadable(info)
    return summarize(info)


# ---------------------------------------------------------------- download

_PP_STAGES = (
    ("ExtractAudio", "Convertendo para MP3"),
    ("Merger", "Juntando áudio e vídeo"),
    ("Metadata", "Gravando título e capa"),
    ("EmbedThumbnail", "Gravando título e capa"),
    ("Thumbnails", "Preparando a capa"),
)


class ProgressTracker:
    """Converte os callbacks do yt-dlp em um progresso único, mesmo quando o MP4 baixa
    vídeo e áudio separados (duas barras viram uma)."""

    def __init__(self, job: Any) -> None:
        self.job = job
        self.parts: dict[str, list[int | None]] = {}

    def on_download(self, d: dict) -> None:
        job = self.job
        if job.cancel_event.is_set():
            raise DownloadCancelled()
        info = d.get("info_dict") or {}
        format_id = str(info.get("format_id") or "main")
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            self.parts[format_id] = [d.get("downloaded_bytes") or 0, int(total) if total else None]
            expected: dict[str, int | None] = {}
            for fmt in info.get("requested_formats") or []:
                size = fmt.get("filesize") or fmt.get("filesize_approx")
                expected[str(fmt.get("format_id"))] = int(size) if size else None
            for key, (_, part_total) in self.parts.items():
                expected[key] = part_total or expected.get(key)
            done = sum(p[0] or 0 for p in self.parts.values())
            totals = list(expected.values())
            job.status = "downloading"
            job.downloaded = done
            job.speed = d.get("speed")
            if totals and all(totals):
                job.total = sum(totals)  # type: ignore[arg-type]
                job.progress = min(done / job.total, 1.0) if job.total else None
                job.eta = int((job.total - done) / job.speed) if job.speed else d.get("eta")
            else:
                job.total = None
                job.progress = None
                job.eta = d.get("eta")
            is_audio = info.get("vcodec") == "none" or job.kind == "mp3"
            job.stage = "Baixando o áudio" if is_audio else "Baixando o vídeo"
        elif status == "finished":
            size = d.get("total_bytes") or d.get("downloaded_bytes") or 0
            self.parts[format_id] = [size, size]

    def on_postprocess(self, d: dict) -> None:
        job = self.job
        if job.cancel_event.is_set():
            raise DownloadCancelled()
        if d.get("status") != "started":
            return
        name = d.get("postprocessor") or ""
        stage = next((label for key, label in _PP_STAGES if key in name), "Finalizando")
        if not self.parts:
            # A capa é preparada antes do download começar; ainda não é "processando".
            return
        job.status = "processing"
        job.progress = None
        job.speed = None
        job.eta = None
        job.stage = stage


def run_download(job: Any) -> Path:
    """Baixa e converte o arquivo do pedido. Bloqueante; roda no pool de workers."""
    tracker = ProgressTracker(job)
    opts = download_options(job.kind, job.quality, job.dir)
    opts["progress_hooks"] = [tracker.on_download]
    opts["postprocessor_hooks"] = [tracker.on_postprocess]
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            job.stage = "Conectando ao YouTube"
            raw = ydl.extract_info(canonical_url(job.video_id), download=False, process=False)
            check_downloadable(raw)
            job.title = raw.get("title") or job.title
            job.duration = raw.get("duration") or job.duration
            if job.cancel_event.is_set():
                raise DownloadCancelled()
            info = ydl.process_ie_result(raw, download=True)
    except DownloadCancelled:
        raise
    except (DownloadError, ExtractorError) as exc:
        if job.cancel_event.is_set():
            raise DownloadCancelled() from exc
        raise from_ytdlp(exc) from exc

    for download in info.get("requested_downloads") or []:
        path = download.get("filepath")
        if path and Path(path).exists():
            return Path(path)
    candidates = sorted(job.dir.glob(f"media.{job.kind}"))
    if candidates:
        return candidates[0]
    raise PuxaError("unknown", "O arquivo não foi gerado. Tente de novo.", 500)


Runner = Callable[[Any], Path]
