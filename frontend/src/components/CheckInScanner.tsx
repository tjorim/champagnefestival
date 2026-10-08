import { InfoIcon, VideoOffIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import jsQR from "jsqr";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
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

// A named predicate rather than repeating `navigator.mediaDevices?.getUserMedia`
// at each call site: referencing that method without invoking it, twice in the
// same component, reads to `tsc` as the classic "forgot the ()" mistake and it
// flags the second occurrence (TS2774) — wrapping it in a real boolean-returning
// function is what actually resolves the ambiguity, not just works around it.
function isCameraSupported(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

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
  // Refs are written from an effect (not during render) so React doesn't flag
  // the mutation. A *layout* effect specifically (not the usual passive one),
  // so the assignment lands synchronously right after commit — before the
  // browser's next requestAnimationFrame, which is when the scanning loop
  // below reads it. A passive effect can be scheduled after that next frame,
  // which would let a stale onDecode fire once after a prop change.
  useLayoutEffect(() => {
    onDecodeRef.current = onDecode;
  });
  const [status, setStatus] = useState<ScannerStatus>(() =>
    isCameraSupported() ? "starting" : "unsupported",
  );

  useEffect(() => {
    if (!isCameraSupported()) {
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
        for (const track of stream.getTracks()) track.stop();
        video.srcObject = null;
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
          if (cancelled) return;
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
    <div className="mb-4">
      <div className="relative aspect-4/3 overflow-hidden rounded-md bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          muted
          playsInline
          aria-hidden="true"
          className={cn("h-full w-full object-cover", status === "scanning" ? "block" : "hidden")}
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        {status === "scanning" && (
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-3/5 -translate-x-1/2 -translate-y-1/2 rounded-md border-3 border-warning"
            aria-hidden="true"
          />
        )}
        {status === "starting" && (
          <div className="flex flex-col items-center justify-center h-full text-subtle">
            <Spinner variant="warning" role="status">
              <span className="sr-only">{m.checkin_scanner_starting()}</span>
            </Spinner>
            <p className="mt-2 mb-0 text-sm">{m.checkin_scanner_starting()}</p>
          </div>
        )}
      </div>

      <div role="status" aria-live="polite">
        {status === "scanning" && (
          <p className="text-subtle text-center text-sm mt-2 mb-0">
            {m.checkin_scanner_scanning()}
          </p>
        )}
      </div>

      {status === "permission-denied" && (
        <Alert variant="warning" className="mt-2 mb-0">
          <Icon icon={VideoOffIcon} className="me-2" />
          {m.checkin_scanner_permission_denied()}
        </Alert>
      )}
      {(status === "error" || status === "unsupported") && (
        <Alert variant="secondary" className="mt-2 mb-0">
          <Icon icon={InfoIcon} className="me-2" />
          {m.checkin_scanner_unavailable()}
        </Alert>
      )}
    </div>
  );
}
