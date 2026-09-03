import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckInScanner, { parseCheckInUrl } from "@/components/CheckInScanner";

vi.mock("@/paraglide/messages", () => ({
  m: {
    checkin_scanner_starting: () => "Starting camera…",
    checkin_scanner_scanning: () => "Point the camera at the guest's QR code.",
    checkin_scanner_permission_denied: () => "Camera access was denied.",
    checkin_scanner_unavailable: () => "Camera scanning isn't available.",
  },
}));

vi.mock("jsqr", () => ({
  default: vi.fn(() => ({
    data: "https://example.com/check-in?id=reg-1#token=abc",
  })),
}));

describe("parseCheckInUrl", () => {
  it("extracts the id and token from a scanned check-in URL", () => {
    expect(parseCheckInUrl("https://example.com/check-in?id=reg-1#token=abc")).toEqual({
      id: "reg-1",
      token: "abc",
    });
  });

  it("returns null for a URL that isn't the check-in page", () => {
    expect(parseCheckInUrl("https://example.com/other?id=reg-1#token=abc")).toBeNull();
  });

  it("returns null when the id or token is missing", () => {
    expect(parseCheckInUrl("https://example.com/check-in?id=reg-1")).toBeNull();
    expect(parseCheckInUrl("https://example.com/check-in#token=abc")).toBeNull();
  });

  it("returns null for text that isn't a URL", () => {
    expect(parseCheckInUrl("not a url")).toBeNull();
  });
});

describe("CheckInScanner", () => {
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it("shows an unavailable message when the camera API isn't supported", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });

    render(<CheckInScanner onDecode={vi.fn()} />);

    expect(await screen.findByText("Camera scanning isn't available.")).toBeInTheDocument();
  });

  it("shows a permission-denied message when the camera is refused", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    render(<CheckInScanner onDecode={vi.fn()} />);

    expect(await screen.findByText("Camera access was denied.")).toBeInTheDocument();
  });

  it("decodes a scanned check-in URL via the BarcodeDetector API and stops the camera", async () => {
    const track = { stop: vi.fn() };
    const stream = new MediaStream();
    Object.defineProperty(stream, "getTracks", { value: () => [track] });
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    class FakeBarcodeDetector {
      detect() {
        return Promise.resolve([{ rawValue: "https://example.com/check-in?id=reg-1#token=abc" }]);
      }
    }
    vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);

    const onDecode = vi.fn();
    const { container, unmount } = render(<CheckInScanner onDecode={onDecode} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    Object.defineProperty(video, "readyState", { value: 4, configurable: true });

    await waitFor(() => expect(onDecode).toHaveBeenCalledWith({ id: "reg-1", token: "abc" }));

    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it("falls back to jsQR when the BarcodeDetector API is unavailable", async () => {
    const track = { stop: vi.fn() };
    const stream = new MediaStream();
    Object.defineProperty(stream, "getTracks", { value: () => [track] });
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const fakeContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeContext as unknown as CanvasRenderingContext2D,
    );

    const onDecode = vi.fn();
    const { container } = render(<CheckInScanner onDecode={onDecode} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    Object.defineProperty(video, "readyState", { value: 4, configurable: true });
    Object.defineProperty(video, "videoWidth", { value: 640, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 480, configurable: true });

    await waitFor(() => expect(onDecode).toHaveBeenCalledWith({ id: "reg-1", token: "abc" }));
    expect(fakeContext.drawImage).toHaveBeenCalled();
  });
});
