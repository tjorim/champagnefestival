"""``python -m app.worker``: the outbox worker command the Dockerfile worker target and the docs start, kept at this path.

The code lives in ``app.services.worker``; this entrypoint only runs it, so deployments written for the old path keep
working. Remove it once the worker target and the runbook use ``python -m app.services.worker``."""

import runpy

if __name__ == "__main__":
    runpy.run_module("app.services.worker", run_name="__main__")
