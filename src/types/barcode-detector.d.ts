// Minimal ambient types for the browser Shape Detection API
// (https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector).
// Chrome/Edge only — always feature-check `window.BarcodeDetector` at runtime.
interface BarcodeDetectorOptions {
  formats?: string[];
}

interface DetectedBarcode {
  boundingBox?: { x: number; y: number; width: number; height: number } | DOMRectReadOnly;
  rawValue: string;
  format: string;
  cornerPoints?: { x: number; y: number }[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(
    image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | ImageData
  ): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<string[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}

// react-native-web deep import has no bundled types.
declare module 'react-native-web/dist/exports/createElement' {
  import * as React from 'react';
  const createElement: typeof React.createElement;
  export default createElement;
}
