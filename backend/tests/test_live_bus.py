"""Unit tests for LiveBus pub/sub hub."""

from __future__ import annotations

import pytest

from app.live.bus import LiveBus
from app.live.events import LiveEvent, LiveScope


def _make_event(topic: str = "registration") -> LiveEvent:
    return LiveEvent(
        topic=topic,
        action="updated",
        scope=LiveScope(registration_id="reg-1"),
        keys=(("admin", "registrations"),),
        id="evt_test",
    )


async def test_subscribe_and_publish():
    bus = LiveBus()
    event = _make_event()

    async with bus.subscribe() as queue:
        await bus.publish(event)
        received = queue.get_nowait()

    assert received is event


async def test_multiple_subscribers_each_receive_event():
    bus = LiveBus()
    event = _make_event()

    async with bus.subscribe() as q1, bus.subscribe() as q2:
        await bus.publish(event)
        assert q1.get_nowait() is event
        assert q2.get_nowait() is event


async def test_slow_consumer_drops_event_with_warning(caplog):
    bus = LiveBus(max_queue_size=1)
    first = _make_event("first")
    second = _make_event("second")

    async with bus.subscribe() as queue:
        await bus.publish(first)
        # Queue is now full; second event should be dropped.
        await bus.publish(second)

        assert queue.get_nowait() is first
        assert queue.empty()

    assert "dropped event" in caplog.text


async def test_unsubscribe_stops_delivery():
    bus = LiveBus()
    event = _make_event()

    async with bus.subscribe():
        pass  # Subscribe then immediately unsubscribe.

    # Publishing after unsubscribe must not raise and must not deliver.
    await bus.publish(event)
    assert bus.subscriber_count == 0


async def test_subscriber_count_tracks_subscriptions():
    bus = LiveBus()
    assert bus.subscriber_count == 0

    async with bus.subscribe():
        assert bus.subscriber_count == 1
        async with bus.subscribe():
            assert bus.subscriber_count == 2
        assert bus.subscriber_count == 1

    assert bus.subscriber_count == 0


async def test_publish_with_no_subscribers_is_a_noop():
    bus = LiveBus()
    # Must not raise.
    await bus.publish(_make_event())


async def test_concurrent_publish_order_preserved():
    """Events published in order arrive in the same order."""
    bus = LiveBus()
    events = [_make_event(f"topic_{i}") for i in range(5)]

    async with bus.subscribe() as queue:
        for e in events:
            await bus.publish(e)

        received = [queue.get_nowait() for _ in events]

    assert [e.topic for e in received] == [e.topic for e in events]


async def test_exception_in_consumer_unsubscribes():
    """A subscriber that exits via an exception must still unsubscribe."""
    bus = LiveBus()

    with pytest.raises(RuntimeError):
        async with bus.subscribe():
            assert bus.subscriber_count == 1
            raise RuntimeError("boom")

    assert bus.subscriber_count == 0
