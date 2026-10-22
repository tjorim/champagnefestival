# Profiling Slow Requests and MCP Calls

Python 3.15 ships Tachyon, a sampling profiler in the standard library (`profiling.sampling`). It reads a running interpreter's stacks from outside the process: no code changes, no extra dependency, and little overhead in the profiled process. Use it to investigate a concrete slow request or MCP tool locally. It is **not enabled in production** (see [Production](#production)).

Find the slow request first. `X-Request-ID` and `latency_ms` in the structured request log ([OBSERVABILITY.md](OBSERVABILITY.md)) tell you which route or MCP call to reproduce.

---

## Local workflow

Run from `backend/` with the dev environment (`uv sync`, `.env`, a migrated database).

**1. Profile a fresh server for a fixed window** while you reproduce the slow call:

```bash
uv run python -m profiling.sampling run --async-aware -d 30 \
  --flamegraph -o /tmp/api-flame.html \
  -m uvicorn app.main:app --port 8000
```

The server stops when the window ends, and the report is written then. `--async-aware` follows awaiting coroutines, so the flamegraph shows the request's call path (middleware → FastMCP → tool → SQLAlchemy) rather than only the event loop.

**2. Or attach to a server that is already running** (for example after warming caches):

```bash
uv run python -m profiling.sampling attach --async-aware -d 10 \
  --flamegraph -o /tmp/api-flame.html <uvicorn PID>
```

**3. Drive the slow call** during the window: the browser, `curl`, or an MCP client running the same `search_tools`/`call_tool` sequence. Integration-client keys are rate limited per minute, so a load loop with one key starts getting 401 after its limit. Use a Keycloak token or a higher-limit dev client for longer runs.

**4. Read the result.** Open the flamegraph HTML, or use `--pstats -o /tmp/api.pstats` and sort it:

```bash
uv run python -c "import pstats; pstats.Stats('/tmp/api.pstats').sort_stats('cumulative').print_stats(r'app/', 25)"
```

Other useful outputs and modes: `--live` (top-like TUI), `--mode cpu` (on-CPU time only, without waiting on PostgreSQL), and `--diff-flamegraph BASELINE` (compare before and after a fix). `python -m profiling.sampling dump <PID>` prints the current stack once, which helps with a request that hangs.

### In the container image

`attach` works inside the `api` container from a shell in the same container, because the profiler runs as the same user as the server (PID 1):

```bash
docker exec -it <api container> python -m profiling.sampling attach -d 10 \
  --pstats -o /tmp/api.pstats 1
docker cp <api container>:/tmp/api.pstats .
```

Verified locally with rootless podman on a host with `kernel.yama.ptrace_scope=0`. Hosts with a stricter `ptrace_scope` or a different container runtime may refuse the attach unless the container has `CAP_SYS_PTRACE`.

---

## Production

Do not attach to the VPS containers or add `CAP_SYS_PTRACE` to the deployment without a separate review. Stack samples can contain request data (argument values in frames, SQL text). The host's ptrace policy and the compose capabilities are owned by `tjorim/apps`, and a collection and retention policy for profiles does not exist yet. Reproduce locally with production-like data volumes instead.

Measurements and decisions from the Python 3.15 upgrade are recorded in #1268.
