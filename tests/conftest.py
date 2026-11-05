import subprocess
import threading
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from yt_dlp.utils import DownloadCancelled

from app import config
from app.main import create_app

VIDEO_ID = "jNQXAC9IVRw"

FAKE_INFO = {
    "id": VIDEO_ID,
    "title": "Me at the zoo",
    "channel": "jawed",
    "duration": 6,
    "view_count": 447823617,
    "upload_date": "2005-04-24",
    "thumbnail": "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
    "is_short": False,
    "options": {"mp3": [{"quality": 192, "label": "192 kbps", "note": "Padrão", "size": 144000}], "mp4": []},
}


def make_tone(path: Path, seconds: float = 6.0) -> Path:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
         "-t", str(seconds), "-c:a", "libmp3lame", "-b:a", "128k", str(path)],
        check=True,
    )
    return path


class FakeRunner:
    """Simula o download: gera um MP3 curto, ou espera cancelamento, ou falha."""

    def __init__(self) -> None:
        self.mode = "ok"
        self.started = threading.Event()

    def __call__(self, job):
        self.started.set()
        if self.mode == "block":
            job.status, job.stage = "downloading", "Baixando o áudio"
            if job.cancel_event.wait(5):
                raise DownloadCancelled()
        if isinstance(self.mode, Exception):
            raise self.mode
        job.title = job.title or "Me at the zoo"
        return make_tone(job.dir / f"media.{job.kind}")


@pytest.fixture
def runner():
    return FakeRunner()


@pytest.fixture
def fetch_calls():
    return []


@pytest.fixture
def client(tmp_path, monkeypatch, runner, fetch_calls):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)

    def fake_fetch(video_id):
        fetch_calls.append(video_id)
        return dict(FAKE_INFO, id=video_id)

    app = create_app(runner=runner, info_fetcher=fake_fetch, cleanup_interval=3600)
    with TestClient(app) as test_client:
        yield test_client
