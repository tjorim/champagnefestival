from contextlib import asynccontextmanager

import pytest

from app import maintenance


@asynccontextmanager
async def _fake_session():
    yield object()


@pytest.fixture(autouse=True)
def _no_database(monkeypatch):
    monkeypatch.setattr(maintenance, "async_session_factory", _fake_session)


def test_housekeeping_covers_every_former_worker_sweep():
    assert [name for name, _ in maintenance.SWEEPS] == [
        "terminal outbox jobs",
        "stale rate-limit buckets",
        "expired visitor sessions",
        "expired visitor magic links",
        "stale push subscriptions",
    ]


async def test_housekeeping_runs_every_sweep_and_reports_no_failures(monkeypatch, caplog):
    calls = []

    def sweep(name, removed):
        async def run(_db):
            calls.append(name)
            return removed

        return run

    monkeypatch.setattr(maintenance, "SWEEPS", (("a", sweep("a", 3)), ("b", sweep("b", 0))))
    with caplog.at_level("INFO", logger="app.maintenance"):
        failed = await maintenance.housekeeping()

    assert failed == 0
    assert calls == ["a", "b"]
    assert "Housekeeping removed 3 a" in caplog.text


async def test_failing_sweep_does_not_skip_the_others(monkeypatch):
    calls = []

    async def broken(_db):
        raise RuntimeError("database unavailable")

    async def healthy(_db):
        calls.append("healthy")
        return 1

    monkeypatch.setattr(maintenance, "SWEEPS", (("broken", broken), ("healthy", healthy)))

    assert await maintenance.housekeeping() == 1
    assert calls == ["healthy"]


def test_main_exit_status_reflects_failures(monkeypatch):
    async def failures(count):
        return count

    monkeypatch.setattr(maintenance, "housekeeping", lambda: failures(0))
    assert maintenance.main(["housekeeping"]) == 0
    monkeypatch.setattr(maintenance, "housekeeping", lambda: failures(2))
    assert maintenance.main(["housekeeping"]) == 1


def test_main_rejects_unknown_command():
    with pytest.raises(SystemExit):
        maintenance.main(["nope"])
