/**
 * MSW handler for GET /api/live/stream.
 *
 * Returns an open SSE stream that starts with the ready event.
 * Call pushLiveEvent() from tests or browser devtools to simulate server
 * broadcasts without a real backend.
 */
import { http, HttpResponse } from "msw";
import type { LiveEnvelope } from "@/utils/liveStream";

const encoder = new TextEncoder();
let activeController: ReadableStreamDefaultController<Uint8Array> | null = null;

/** Push a synthetic live-update event into the open SSE stream. */
export function pushLiveEvent(envelope: Partial<LiveEnvelope>): void {
  try {
    activeController?.enqueue(
      encoder.encode(`event: invalidate\ndata: ${JSON.stringify(envelope)}\n\n`),
    );
  } catch (err) {
    console.warn("Failed to push live event (stream might be closed):", err);
  }
}

/** Close the active SSE stream (simulates a server disconnect). */
export function closeLiveStream(): void {
  try {
    activeController?.close();
  } catch {
    // Already closed or errored — nothing to do.
  }
  activeController = null;
}

export const liveHandlers = [
  http.get("/api/live/stream", () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        activeController = controller;
        controller.enqueue(encoder.encode('event: ready\ndata: {"ok":true}\n\n'));
      },
      cancel() {
        activeController = null;
      },
    });

    return new HttpResponse(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }),
];
