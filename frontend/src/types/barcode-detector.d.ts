// The Barcode Detection API (Chrome/Edge on Android and desktop) isn't part of
// TypeScript's bundled DOM lib yet. This is the minimal shape CheckInScanner uses.
// https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API
interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(image: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
