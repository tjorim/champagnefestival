import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import { m } from "@/paraglide/messages";

export interface ScannedCheckInCredentials {
  id: string;
  token: string;
}

/**
 * Parses a scanned check-in URL of the shape produced by MyRegistrationsPage's
 * QR code: `<origin>/check-in?id=<id>#token=<token>`. Returns null for
 * anything else so a scanned code that isn't a check-in link is ignored
 * rather than driving a bogus lookup.
 */
export function parseCheckInUrl(text: string): ScannedCheckInCredentials | null {
  let url: URL;
  try {
    url = new URL(text, window.location.origin);
  } catch {
    return null;
  }
  if (!url.pathname.endsWith("/check-in")) return null;
  const id = url.searchParams.get("id");
  const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  if (!id || !token) return null;
  return { id, token };
}

type ScannerStatus = "starting" | "scanning" | "permission-denied" | "error" | "unsupported";

async function detectWithBarcodeDetector(
  detector: BarcodeDetector,
  video: HTMLVideoElement,
): Promise<string | null> {
  try {
    const codes = await detector.detect(video);
    return codes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

function detectWithJsQr(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  canvas.width = width;
  canvas.height = height;
  context.drawImage(video, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const code = jsQR(imageData.data, width, height);
  return code?.data ?? null;
}

interface CheckInScannerProps {
  onDecode: (result: ScannedCheckInCredentials) => void;
}

export default function CheckInScanner({ onDecode }: CheckInScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const [status, setStatus] = useState<ScannerStatus>("starting");

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    let decoded = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        if (!cancelled) setStatus("permission-denied");
        return;
      }
      if (cancelled) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) return;
      setStatus("scanning");

      const detector = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ["qr_code"] })
        : null;

      const tick = async () => {
        if (cancelled || decoded) return;
        // readyState 2 (HAVE_CURRENT_DATA) means the video element has a
        // frame to draw; the numeric constant is used directly since it's
        // stable across browsers and avoids relying on the property existing.
        if (video.readyState >= 2) {
          const text = detector
            ? await detectWithBarcodeDetector(detector, video)
            : detectWithJsQr(video, canvas);
          if (text) {
            const parsed = parseCheckInUrl(text);
            if (parsed) {
              decoded = true;
              onDecodeRef.current(parsed);
              return;
            }
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    void start();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
    };
  }, []);

  return (
    <div className="mb-3">
      <div
        className="position-relative rounded overflow-hidden bg-black"
        style={{ aspectRatio: "4 / 3" }}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          muted
          playsInline
          aria-hidden="true"
          className="w-100 h-100"
          style={{ objectFit: "cover", display: status === "scanning" ? "block" : "none" }}
        />
        <canvas ref={canvasRef} className="d-none" aria-hidden="true" />
        {status === "scanning" && (
          <div
            className="position-absolute top-50 start-50 translate-middle border border-warning border-3 rounded"
            style={{ width: "60%", aspectRatio: "1 / 1", pointerEvents: "none" }}
            aria-hidden="true"
          />
        )}
        {status === "starting" && (
          <div className="d-flex flex-column align-items-center justify-content-center h-100 text-secondary">
            <Spinner animation="border" variant="warning" role="status">
              <span className="visually-hidden">{m.checkin_scanner_starting()}</span>
            </Spinner>
            <p className="mt-2 mb-0 small">{m.checkin_scanner_starting()}</p>
          </div>
        )}
      </div>

      <div role="status" aria-live="polite">
        {status === "scanning" && (
          <p className="text-secondary text-center small mt-2 mb-0">
            {m.checkin_scanner_scanning()}
          </p>
        )}
      </div>

      {status === "permission-denied" && (
        <Alert variant="warning" className="mt-2 mb-0">
          <i className="bi bi-camera-video-off me-2" aria-hidden="true" />
          {m.checkin_scanner_permission_denied()}
        </Alert>
      )}
      {(status === "error" || status === "unsupported") && (
        <Alert variant="secondary" className="mt-2 mb-0">
          <i className="bi bi-info-circle me-2" aria-hidden="true" />
          {m.checkin_scanner_unavailable()}
        </Alert>
      )}
    </div>
  );
}
