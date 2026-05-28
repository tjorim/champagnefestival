/**
 * SSE live-update client using fetch + ReadableStream.
 *
 * fetch() is used instead of EventSource so we can set the Authorization
 * header, which the EventSource API does not support.
 */

/** Invalidation envelope received from GET /api/live/stream. */
export interface LiveEnvelope {
  topic: string;
  action: string;
  scope: {
    edition_id: string | null;
    event_id: string | null;
    registration_id: string | null;
    table_id: string | null;
  };
  keys: string[][];
  ts: string;
  id: string;
}

export interface ConnectLiveStreamOptions {
  /** URL of the SSE endpoint. */
  url: string;
  /** Returns the current Bearer token, or null when not authenticated. */
  getToken: () => string | null;
  /** Cancel signal — aborts the connection and stops the retry loop. */
  signal: AbortSignal;
  /** Called for each received `event: invalidate` frame. */
  onInvalidate: (envelope: LiveEnvelope) => void;
  /**
   * Called after every reconnect so callers can do a blanket query invalidation
   * to recover events that may have been missed during the gap.
   */
  onReconnect?: () => void;
}

// Exponential backoff delays in ms.
const BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 30_000];

/**
 * Parse one SSE frame (the text between two `\n\n` delimiters).
 * Returns the event type and joined data string, or null if there is no data.
 * Exported so the parser can be unit-tested independently.
 */
export function parseSSEFrame(frame: string): { eventType: string; data: string } | null {
  let eventType = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // SSE comment / keepalive (space after : is optional)
    if (line.startsWith("event:")) {
      const value = line.slice(6);
      eventType = value.startsWith(" ") ? value.slice(1) : value;
    } else if (line.startsWith("data:")) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
    // id: and retry: are intentionally ignored.
  }

  if (dataLines.length === 0) return null;
  return { eventType, data: dataLines.join("\n") };
}

/** Open a streaming SSE connection with automatic reconnect and backoff. */
export async function connectLiveStream(options: ConnectLiveStreamOptions): Promise<void> {
  const { url, getToken, signal, onInvalidate, onReconnect } = options;
  let attempt = 0;
  let wasConnected = false;

  while (!signal.aborted) {
    const token = getToken();
    if (!token) {
      await _sleep(BACKOFF_MS[0]!, signal).catch(() => undefined);
      continue;
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal,
      });

      if (!response.ok || !response.body) {
        await _sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!, signal).catch(
          () => undefined,
        );
        attempt = Math.min(attempt + 1, BACKOFF_MS.length - 1);
        continue;
      }

      const isReconnect = wasConnected;
      attempt = 0; // Successful connection resets backoff.
      wasConnected = true;
      await _readStream(response.body, signal, onInvalidate);
      // Blanket invalidate after a successful re-connection to recover missed events.
      if (isReconnect) {
        onReconnect?.();
      }
    } catch {
      if (signal.aborted) return;
    }

    if (signal.aborted) return;

    await _sleep(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!, signal).catch(
      () => undefined,
    );
    attempt = Math.min(attempt + 1, BACKOFF_MS.length - 1);
  }
}

async function _readStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onInvalidate: (envelope: LiveEnvelope) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const parsed = parseSSEFrame(frame);
        if (parsed?.eventType !== "invalidate") continue;

        try {
          onInvalidate(JSON.parse(parsed.data) as LiveEnvelope);
        } catch {
          // Ignore malformed JSON.
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

function _sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }

    let id: ReturnType<typeof setTimeout>;

    const onAbort = () => {
      clearTimeout(id);
      reject(new Error("aborted"));
    };

    id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
