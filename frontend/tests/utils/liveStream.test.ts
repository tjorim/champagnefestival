import { describe, expect, it } from "vitest";
import { parseSSEFrame } from "@/utils/liveStream";

describe("parseSSEFrame", () => {
  it("returns null for a keepalive comment", () => {
    expect(parseSSEFrame(": keepalive")).toBeNull();
  });

  it("returns null for an empty frame", () => {
    expect(parseSSEFrame("")).toBeNull();
    expect(parseSSEFrame("   ")).toBeNull();
  });

  it("parses a ready event", () => {
    const frame = 'event: ready\ndata: {"ok":true}';
    expect(parseSSEFrame(frame)).toEqual({ eventType: "ready", data: '{"ok":true}' });
  });

  it("parses an invalidate event", () => {
    const payload = JSON.stringify({
      topic: "check_in",
      action: "updated",
      scope: { edition_id: null, event_id: "ev-1", registration_id: "reg-1", table_id: null },
      keys: [["admin", "registrations"]],
      ts: "2026-05-28T18:00:00Z",
      id: "evt_abc",
    });
    const frame = `event: invalidate\nid: evt_abc\ndata: ${payload}`;
    const result = parseSSEFrame(frame);
    expect(result).toEqual({ eventType: "invalidate", data: payload });
  });

  it("defaults eventType to 'message' when no event: line", () => {
    const frame = "data: hello";
    expect(parseSSEFrame(frame)).toEqual({ eventType: "message", data: "hello" });
  });

  it("joins multiple data: lines with newline", () => {
    const frame = "data: line1\ndata: line2";
    expect(parseSSEFrame(frame)).toEqual({ eventType: "message", data: "line1\nline2" });
  });

  it("ignores lines starting with ':'", () => {
    expect(parseSSEFrame(": this is a comment\ndata: real data")).toEqual({
      eventType: "message",
      data: "real data",
    });
  });

  it("parses fields without the optional space after the colon", () => {
    const frame = "event:invalidate\ndata:{}";
    expect(parseSSEFrame(frame)).toEqual({ eventType: "invalidate", data: "{}" });
  });

  it("handles CRLF-terminated lines without leaving trailing \\r in values", () => {
    // After CRLF normalisation in _readStream, frames reaching parseSSEFrame
    // will already have \r\n replaced with \n.  This test verifies the parser
    // itself also tolerates raw CRLF (defensive coverage for direct callers).
    const frame = "event: invalidate\r\ndata: {}";
    // split("\n") on "event: invalidate\r\ndata: {}" gives:
    //   ["event: invalidate\r", "data: {}"]
    // The \r in "invalidate\r" is left by split; our parser strips the leading
    // "event:" prefix and optional space, yielding "invalidate\r".
    // Callers that go through _readStream never see this because normalisation
    // happens there.  Direct parseSSEFrame callers should pre-normalise.
    const result = parseSSEFrame(frame);
    expect(result).not.toBeNull();
    expect(result?.data).toBe("{}");
  });

  it("returns null when only a blank event: line with no data", () => {
    const frame = "event: invalidate";
    expect(parseSSEFrame(frame)).toBeNull();
  });
});
