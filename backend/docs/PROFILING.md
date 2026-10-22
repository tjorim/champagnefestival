# Profiling Slow Requests and MCP Calls

Python 3.15 ships a sampling profiler in the standard library, `profiling.sampling` ("Tachyon"). It reads the interpreter's stacks from outside the process, so the backend needs no code changes, no extra dependency and no restart to be profiled. Use it to investigate a specific slow route or MCP tool locally. It is **not enabled in production** (see [Production](#production)).

## Find the slow request first

Start from the request log, not the profiler. Every response carries `Server-Timing: app;dur=…, db;desc="N queries";dur=…` (visible in the browser devtools Network tab), and a request slower than 300 ms is logged as a warning with its method, route template, status, duration and query count (`app/request_timing.py`). Many queries for one request is an N+1 pattern that the SQL log explains better than a profile does. A high `app` time with few queries is what a profile is for. `X-Request-ID` and `latency_ms` in the structured request log ([OBSERVABILITY.md](OBSERVABILITY.md)) tie the response to a log line.

## Local setup

Run the backend against a local PostgreSQL with the dev auth bypass, so requests can be replayed with a fixed bearer token:

```bash
cd backend
export ENVIRONMENT=development \
  DATABASE_URL=postgresql+asyncpg://champagne:champagne@127.0.0.1:5432/champagne \
  DEV_AUTH_BYPASS_TOKEN=dev-profiling
uv run alembic upgrade head
```

## Choose the mode

The handlers are `async def`, so one event loop thread does nearly all the work.

| Target | Flags | Why |
|---|---|---|
| REST routes and MCP tools (`async def`) | `--async-aware` | Reconstructs stacks per asyncio task, so the flamegraph shows the request's call path (middleware → FastMCP → tool → SQLAlchemy) instead of only the idle loop. |
| CPU-bound work (JWT verification, serialization) | `--mode cpu` | Counts on-CPU time only, without waiting on PostgreSQL. |
| A request that hangs | `dump <pid>` | Prints what every thread is doing right now. |

## Profile a fresh server

Start uvicorn under the profiler for a fixed duration, then replay the slow request while it runs:

```bash
uv run python -m profiling.sampling run --async-aware -d 30 \
  --flamegraph -o /tmp/api-flame.html \
  -m uvicorn app.main:app --port 8000

# in another shell
for i in $(seq 300); do
  curl -s -o /dev/null -H 'Authorization: Bearer dev-profiling' http://localhost:8000/api/events
done
```

The server stops when the window ends and the report is written then. Open the HTML in a browser, or use `--pstats -o /tmp/api.pstats` and read it from the terminal:

```bash
uv run python -c "import pstats; pstats.Stats('/tmp/api.pstats').sort_stats('cumulative').print_stats(r'app/', 25)"
```

For an MCP call, run an MCP client doing the same `search_tools` / `call_tool` sequence during the window. Integration-client keys are rate limited per minute, so a load loop with one key starts getting 401 after its limit. Use a Keycloak token or a higher-limit dev client for longer runs.

Other useful outputs: `--live` (top-like TUI) and `--diff-flamegraph BASELINE` (compare before and after a fix).

### In the container image

`attach` works inside the `api` container from a shell in the same container, because the profiler runs as the same user as the server (PID 1):

```bash
docker exec -it <api container> python -m profiling.sampling attach -d 10 \
  --pstats -o /tmp/api.pstats 1
docker cp <api container>:/tmp/api.pstats .
```

Verified locally with rootless podman on a host with `kernel.yama.ptrace_scope=0`. Hosts with a stricter `ptrace_scope` or a different container runtime may refuse the attach unless the container has `CAP_SYS_PTRACE`.

## Attach to a running server

To catch a slowdown that only appears after the server has been up a while, attach by PID instead of restarting. Use the PID of the Python process that listens on the port (`ss -ltnp | grep :8000`), not the `uv run` wrapper that started it:

```bash
uv run python -m profiling.sampling attach --async-aware -d 10 \
  --flamegraph -o /tmp/api-flame.html <uvicorn-pid>
uv run python -m profiling.sampling dump <uvicorn-pid>
```

Attaching needs ptrace permission on the target. Locally that means the same user and `kernel.yama.ptrace_scope` 0, or running the profiler as root.

## Reading the output

- Run one profiler at a time. Concurrent attaches raise the reported error rate (samples that could not be read).
- Compare against a baseline when checking a fix: record it with `--binary -o before.bin`, then run `--diff-flamegraph before.bin` on the second run.
- A profile holds function names, file paths, line numbers and sample counts, not argument or variable values. The flamegraph HTML also embeds the source lines of the sampled frames. Treat both as local diagnostics rather than something to publish.

## Production

Not enabled. Attaching to a container's PID 1 depends on the host's ptrace policy (`kernel.yama.ptrace_scope`), the container's seccomp profile and capabilities (`CAP_SYS_PTRACE`), and a collection and retention policy for profiles, which does not exist yet. Those belong to `tjorim/apps` and need their own review before anything changes there. Reproduce locally with production-like data volumes instead.

Measurements and decisions from the Python 3.15 upgrade are recorded in #1268.
