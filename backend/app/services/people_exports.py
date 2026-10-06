"""Bounded, formula-safe exports for the shared people list filters."""

import csv
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.services import volunteers_service
from app.services.people_listing import registration_count
from app.utils import csv_safe

EXPORT_BATCH_SIZE = 250


class _CsvEcho:
    def write(self, value: str) -> str:
        return value


async def stream_people_csv(db: AsyncSession, stmt: Select[Any], *, volunteer: bool = False) -> AsyncIterator[str]:
    """Use a server cursor; only one batch and its help periods live in memory.

    FastAPI keeps the request session alive until the streaming response ends.
    Closing the result in finally also releases the cursor on disconnect.
    """
    writer = csv.writer(_CsvEcho())
    header = (
        ["Name", "National Register Number", "Address", "Period Start", "Period End"]
        if volunteer
        else ["ID", "Name", "Email", "Phone", "Address", "Roles", "Active", "Registration Count"]
    )
    yield writer.writerow(map(csv_safe, header))
    result = await db.stream(stmt.add_columns(registration_count).execution_options(yield_per=EXPORT_BATCH_SIZE))
    try:
        async for batch in result.partitions(EXPORT_BATCH_SIZE):
            periods_map = await volunteers_service.load_periods_map(db, [p.id for p, _ in batch]) if volunteer else {}
            for person, count in batch:
                if not volunteer:
                    yield writer.writerow(
                        map(
                            csv_safe,
                            [
                                person.id,
                                person.name,
                                person.email,
                                person.phone,
                                person.address,
                                ";".join(person.roles),
                                person.active,
                                count,
                            ],
                        )
                    )
                    continue
                periods = periods_map.get(person.id, [])
                for period in periods or [None]:
                    yield writer.writerow(
                        map(
                            csv_safe,
                            [
                                person.name,
                                person.national_register_number,
                                person.address,
                                period.first_help_day.isoformat() if period else None,
                                period.last_help_day.isoformat() if period and period.last_help_day else None,
                            ],
                        )
                    )
    finally:
        await result.close()
