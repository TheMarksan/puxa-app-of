import pytest

from app import config, youtube
from app.errors import PuxaError, from_ytdlp


@pytest.mark.parametrize(
    "text",
    [
        "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        "https://youtube.com/watch?v=jNQXAC9IVRw&list=PL123&t=4s",
        "https://www.youtube.com/watch?feature=share&v=jNQXAC9IVRw",
        "youtube.com/watch?v=jNQXAC9IVRw",
        "https://youtu.be/jNQXAC9IVRw?si=AbCdEf",
        "https://m.youtube.com/watch?v=jNQXAC9IVRw",
        "https://music.youtube.com/watch?v=jNQXAC9IVRw",
        "https://www.youtube.com/shorts/jNQXAC9IVRw",
        "https://www.youtube.com/live/jNQXAC9IVRw?feature=shared",
        "https://www.youtube.com/embed/jNQXAC9IVRw",
        "https://www.youtube-nocookie.com/embed/jNQXAC9IVRw",
        "  jNQXAC9IVRw  ",
    ],
)
def test_parse_video_id_accepts_youtube_links(text):
    assert youtube.parse_video_id(text) == "jNQXAC9IVRw"


@pytest.mark.parametrize(
    "text",
    [
        "",
        "https://vimeo.com/123456",
        "https://www.youtube.com/playlist?list=PL123",
        "https://www.youtube.com/@canal",
        "https://youtu.be/curto",
        "https://youtu.be/jNQXAC9IVRwXYZ",
        "https://evil.example/youtube.com/watch?v=jNQXAC9IVRw",
        "file:///etc/passwd",
    ],
)
def test_parse_video_id_rejects_everything_else(text):
    with pytest.raises(PuxaError) as exc:
        youtube.parse_video_id(text)
    assert exc.value.code == "invalid_url"


def test_canonical_url_drops_playlist_and_tracking():
    assert youtube.canonical_url("jNQXAC9IVRw") == "https://www.youtube.com/watch?v=jNQXAC9IVRw"


def _info():
    return {
        "id": "abcdefghijk",
        "title": "Show ao vivo",
        "uploader": "Banda",
        "duration": 200,
        "upload_date": "20240131",
        "formats": [
            {"format_id": "sb0", "vcodec": "none", "acodec": "none", "format_note": "storyboard", "ext": "mhtml"},
            {"format_id": "251", "vcodec": "none", "acodec": "opus", "ext": "webm", "abr": 130, "filesize": 3_300_000},
            {"format_id": "140", "vcodec": "none", "acodec": "mp4a.40.2", "ext": "m4a", "abr": 129, "filesize": 3_200_000},
            {"format_id": "137", "vcodec": "avc1.640028", "acodec": "none", "height": 1080, "width": 1920,
             "format_note": "1080p", "fps": 30, "filesize": 50_000_000, "tbr": 2000},
            {"format_id": "248", "vcodec": "vp9", "acodec": "none", "height": 1080, "width": 1920,
             "format_note": "1080p", "fps": 30, "filesize": 40_000_000, "tbr": 1600},
            {"format_id": "400", "vcodec": "av01", "acodec": "none", "height": 1440, "width": 2560,
             "format_note": "1440p60", "fps": 60, "filesize_approx": 90_000_000},
            {"format_id": "18", "vcodec": "avc1.42001E", "acodec": "mp4a.40.2", "height": 360, "width": 640,
             "format_note": "360p", "fps": 30, "tbr": 500},
        ],
    }


def test_summarize_builds_quality_options():
    summary = youtube.summarize(_info())
    assert summary["channel"] == "Banda"
    assert summary["upload_date"] == "2024-01-31"
    assert summary["thumbnail"].endswith("/abcdefghijk/hqdefault.jpg")

    mp4 = {o["quality"]: o for o in summary["options"]["mp4"]}
    assert list(mp4) == [1440, 1080, 360]
    assert mp4[1440]["label"] == "1440p60" and mp4[1440]["note"] == "2K"
    # 1080p prefere H.264 (50 MB) e soma o melhor áudio m4a (3,2 MB)
    assert mp4[1080]["size"] == 53_200_000
    # 360p já tem áudio embutido: estimado por bitrate × duração
    assert mp4[360]["size"] == 500 * 1000 // 8 * 200

    mp3 = {o["quality"]: o["size"] for o in summary["options"]["mp3"]}
    assert mp3 == {320: 8_000_000, 192: 4_800_000, 128: 3_200_000}


def test_vertical_shorts_use_the_short_side_as_label():
    info = {"id": "abcdefghijk", "duration": 30, "formats": [
        {"format_id": "a", "vcodec": "avc1", "acodec": "none", "width": 1080, "height": 1920, "filesize": 9_000_000},
    ]}
    assert [o["quality"] for o in youtube.summarize(info)["options"]["mp4"]] == [1080]


def test_check_downloadable_rejects_live_and_long_videos(monkeypatch):
    with pytest.raises(PuxaError) as exc:
        youtube.check_downloadable({"is_live": True})
    assert exc.value.code == "live"
    with pytest.raises(PuxaError) as exc:
        youtube.check_downloadable({"live_status": "is_upcoming"})
    assert exc.value.code == "upcoming"
    monkeypatch.setattr(config, "MAX_DURATION_SECONDS", 3600)
    with pytest.raises(PuxaError) as exc:
        youtube.check_downloadable({"duration": 3601})
    assert exc.value.code == "too_long" and "1 hora" in exc.value.message
    youtube.check_downloadable({"duration": 3600})


@pytest.mark.parametrize(
    ("message", "code"),
    [
        ("ERROR: [youtube] x: Private video. Sign in if you've been granted access", "private"),
        ("ERROR: [youtube] x: Sign in to confirm your age.", "age_restricted"),
        ("ERROR: [youtube] x: Sign in to confirm you’re not a bot.", "bot_check"),
        ("ERROR: [youtube] x: Video unavailable", "unavailable"),
        ("ERROR: unable to download video data: HTTP Error 403: Forbidden", "blocked"),
        ("ERROR: Unable to download webpage: timed out", "network"),
        ("ERROR: algo totalmente novo", "unknown"),
    ],
)
def test_ytdlp_errors_become_readable_messages(message, code):
    error = from_ytdlp(Exception(message))
    assert error.code == code
    assert error.message and "ERROR" not in error.message


class _Job:
    def __init__(self, kind="mp4"):
        import threading
        self.kind = kind
        self.cancel_event = threading.Event()
        self.status = "downloading"
        self.stage = ""
        self.progress = None
        self.downloaded = 0
        self.total = None
        self.speed = None
        self.eta = None


def test_progress_tracker_merges_video_and_audio_into_one_bar():
    job = _Job()
    tracker = youtube.ProgressTracker(job)
    requested = [{"format_id": "137", "filesize": 900}, {"format_id": "140", "filesize": 100}]
    video = {"format_id": "137", "vcodec": "avc1", "requested_formats": requested}
    audio = {"format_id": "140", "vcodec": "none", "requested_formats": requested}

    tracker.on_download({"status": "downloading", "info_dict": video, "downloaded_bytes": 450, "total_bytes": 900, "speed": 100})
    assert job.progress == pytest.approx(0.45) and job.stage == "Baixando o vídeo" and job.total == 1000
    tracker.on_download({"status": "finished", "info_dict": video, "total_bytes": 900})
    tracker.on_download({"status": "downloading", "info_dict": audio, "downloaded_bytes": 50, "total_bytes": 100, "speed": 100})
    assert job.progress == pytest.approx(0.95) and job.stage == "Baixando o áudio"
    assert job.eta == 0

    tracker.on_postprocess({"status": "started", "postprocessor": "FFmpegMerger"})
    assert job.status == "processing" and job.progress is None and job.stage == "Juntando áudio e vídeo"


def test_progress_tracker_ignores_thumbnail_step_before_download():
    job = _Job("mp3")
    tracker = youtube.ProgressTracker(job)
    tracker.on_postprocess({"status": "started", "postprocessor": "FFmpegThumbnailsConvertor"})
    assert job.status == "downloading"


def test_progress_tracker_raises_when_cancelled():
    from yt_dlp.utils import DownloadCancelled
    job = _Job()
    job.cancel_event.set()
    with pytest.raises(DownloadCancelled):
        youtube.ProgressTracker(job).on_download({"status": "downloading", "info_dict": {}})
