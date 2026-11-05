import time

import pytest

from app import media
from app.errors import PuxaError

from .conftest import VIDEO_ID


def wait_for(client, job_id, statuses=("ready", "error", "cancelled"), timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in statuses:
            return job
        time.sleep(0.05)
    raise AssertionError(f"pedido não terminou: {job}")


def create_job(client, fmt="mp3", quality=192):
    response = client.post("/api/jobs", json={"url": f"https://youtu.be/{VIDEO_ID}", "format": fmt, "quality": quality})
    assert response.status_code == 202
    return response.json()


def test_info_rejects_non_youtube_links(client, fetch_calls):
    response = client.get("/api/info", params={"url": "https://vimeo.com/1"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_url"
    assert fetch_calls == []


def test_info_is_cached_per_video(client, fetch_calls):
    for url in (f"https://youtu.be/{VIDEO_ID}?si=x", f"https://www.youtube.com/watch?v={VIDEO_ID}&list=PL1"):
        assert client.get("/api/info", params={"url": url}).json()["title"] == "Me at the zoo"
    assert fetch_calls == [VIDEO_ID]


def test_mp3_job_lifecycle_file_waveform_and_clip(client):
    client.get("/api/info", params={"url": VIDEO_ID})
    job = wait_for(client, create_job(client)["id"])
    assert job["status"] == "ready"
    assert job["filename"] == "Me at the zoo.mp3"
    assert job["duration"] == pytest.approx(6, abs=0.1)
    assert job["expires_at"] > time.time()

    file = client.get(f"/api/jobs/{job['id']}/file")
    assert file.status_code == 200
    assert file.headers["content-type"] == "audio/mpeg"
    assert file.headers["content-disposition"].startswith("attachment")
    assert len(file.content) == job["size"]

    partial = client.get(f"/api/jobs/{job['id']}/file?inline=1", headers={"Range": "bytes=0-99"})
    assert partial.status_code == 206 and len(partial.content) == 100
    assert partial.headers["content-disposition"].startswith("inline")

    wave = client.get(f"/api/jobs/{job['id']}/waveform").json()
    assert len(wave["peaks"]) == 480 and max(wave["peaks"]) == 1.0

    clip = client.post(f"/api/jobs/{job['id']}/clips", json={"start": 1.5, "end": 4}).json()
    assert clip["filename"] == "Me at the zoo (trecho 0m02s a 0m04s).mp3"
    again = client.post(f"/api/jobs/{job['id']}/clips", json={"start": 1.5, "end": 4}).json()
    assert again["id"] == clip["id"]
    clip_file = client.get(clip["url"])
    assert clip_file.status_code == 200 and len(clip_file.content) == clip["size"]


@pytest.mark.parametrize(
    ("start", "end", "fragment"),
    [(3, 2, "depois do início"), (2, 2.5, "pelo menos 1 segundo"), (2, 30, "termina em 0:06")],
)
def test_invalid_clip_ranges_explain_how_to_fix(client, start, end, fragment):
    job = wait_for(client, create_job(client)["id"])
    response = client.post(f"/api/jobs/{job['id']}/clips", json={"start": start, "end": end})
    assert response.status_code == 422
    assert fragment in response.json()["error"]["message"]


def test_mp4_jobs_cannot_be_cut(client):
    job = wait_for(client, create_job(client, "mp4", 360)["id"])
    assert client.post(f"/api/jobs/{job['id']}/clips", json={"start": 0, "end": 2}).json()["error"]["code"] == "not_audio"
    assert client.get(f"/api/jobs/{job['id']}/waveform").json()["error"]["code"] == "not_audio"


def test_cancel_stops_the_download(client, runner):
    runner.mode = "block"
    job = create_job(client)
    assert runner.started.wait(5)
    client.delete(f"/api/jobs/{job['id']}")
    assert wait_for(client, job["id"])["status"] == "cancelled"


def test_runner_errors_reach_the_client_as_readable_messages(client, runner):
    runner.mode = PuxaError("private", "Este vídeo é privado.", 403)
    job = wait_for(client, create_job(client)["id"])
    assert job["status"] == "error"
    assert job["error"] == {"code": "private", "message": "Este vídeo é privado."}


def test_unexpected_errors_do_not_leak_stack_traces(client, runner):
    runner.mode = RuntimeError("boom /usr/lib/python")
    job = wait_for(client, create_job(client)["id"])
    assert job["error"]["code"] == "unknown"
    assert "boom" not in job["error"]["message"]


def test_rejects_unknown_quality_and_bad_bodies(client):
    response = client.post("/api/jobs", json={"url": VIDEO_ID, "format": "mp3", "quality": 999})
    assert response.json()["error"]["code"] == "invalid_quality"
    response = client.post("/api/jobs", json={"url": VIDEO_ID, "format": "flac", "quality": 192})
    assert response.status_code == 422 and response.json()["error"]["code"] == "invalid_request"


def test_file_before_ready_and_unknown_jobs(client, runner):
    assert client.get("/api/jobs/naoexiste").json()["error"]["code"] == "job_not_found"
    runner.mode = "block"
    job = create_job(client)
    runner.started.wait(5)
    assert client.get(f"/api/jobs/{job['id']}/file").json()["error"]["code"] == "not_ready"
    client.delete(f"/api/jobs/{job['id']}")


def test_expired_jobs_are_removed_from_disk(client):
    job = wait_for(client, create_job(client)["id"])
    manager = client.app.state.jobs
    folder = manager.get(job["id"]).dir
    assert folder.exists()
    assert manager.cleanup(now=time.time() + manager.ttl + 1) == 1
    assert not folder.exists()
    assert client.get(f"/api/jobs/{job['id']}").status_code == 404


def test_static_page_is_served(client):
    page = client.get("/")
    assert page.status_code == 200 and "Link do vídeo" in page.text


def test_health_reports_ttl(client):
    assert client.get("/api/health").json()["file_ttl"] == 1800


@pytest.mark.parametrize(
    ("title", "expected"),
    [("AC/DC: Back in Black?", "AC DC Back in Black"), ("   ", "audio"), ("a" * 200, "a" * 120)],
)
def test_safe_title(title, expected):
    assert media.safe_title(title, "audio") == expected
