"""``python -m app.maintenance housekeeping``: the operator command in docs/outbox-worker.md, kept at this path.

The code lives in ``app.services.maintenance``; this entrypoint only runs it, so scheduler units written for the old
path keep working. Remove it once the units use ``python -m app.services.maintenance``."""

import runpy

if __name__ == "__main__":
    runpy.run_module("app.services.maintenance", run_name="__main__")
