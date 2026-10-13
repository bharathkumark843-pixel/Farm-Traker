import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import createElement from 'react-native-web/dist/exports/createElement';
import jsQRImport from 'jsqr';

// Normalise CJS/ESM interop.
const jsQR: any = (jsQRImport as any)?.default ?? (jsQRImport as any);
// Same <video> trick expo-camera itself uses on web: a component that
// creates the DOM node at render time (NOT a pre-built element object).
const Video: any = React.forwardRef((props: any, ref: any) =>
  createElement('video', { ...(props as object), ref })
);

export type WebScannerHandle = {
  flip: () => void;
  toggleTorch: () => void;
  captureStill: () => string | null;
};

type Props = {
  onCode: (data: string, format: string) => void;
  log: (line: string) => void;
  paused: boolean;
  onTorchAvailable: (supported: boolean) => void;
  onTorchChange: (on: boolean) => void;
  onThumbnail: (dataUrl: string) => void;
};

const WANT_FORMATS = [
  'qr_code', 'aztec', 'data_matrix', 'pdf417',
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'code_93', 'itf', 'codabar',
];

// Web-only live scanner: owns its own camera stream and decodes RAW video
// pixels ~every 150ms, firing the instant a code is seen ("capture when it
// sees"). Renders only the <video> (absolute-fill, lives inside the parent's
// viewfinder frame) — controls/thumbnail stay in the parent.
export const WebQrScanner = forwardRef<WebScannerHandle, Props>(function WebQrScanner(
  { onCode, log, paused, onTorchAvailable, onTorchChange, onThumbnail },
  ref
) {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const busyRef = useRef(false);
  const stopRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triesRef = useRef(0);
  const facingRef = useRef<'back' | 'front'>('back');
  const torchRef = useRef(false);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const logRef = useRef(log);
  logRef.current = log;

  const [started, setStarted] = useState(0);

  const say = (line: string) => {
    try {
      logRef.current(line);
    } catch {}
  };

  useImperativeHandle(ref, () => ({
    captureStill() {
      try {
        const video = videoRef.current as HTMLVideoElement | null;
        if (!video || !video.videoWidth) return null;
        const c = document.createElement('canvas');
        // Full sensor resolution — still photo decode needs width for 1D codes.
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const cx = c.getContext('2d') as unknown as CanvasRenderingContext2D | null;
        if (!cx) return null;
        cx.drawImage(video, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.92);
      } catch {
        return null;
      }
    },
    flip() {
      facingRef.current = facingRef.current === 'back' ? 'front' : 'back';
      torchRef.current = false;
      onTorchChange(false);
      setStarted((n) => n + 1); // re-acquire stream
    },
    toggleTorch() {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) return;
      (async () => {
        try {
          await track.applyConstraints({ advanced: [{ torch: !torchRef.current } as any] });
          torchRef.current = !torchRef.current;
          onTorchChange(torchRef.current);
          say(`web: torch ${torchRef.current ? 'on' : 'off'}`);
        } catch (e: any) {
          say(`web: torch failed: ${e?.message || e}`);
        }
      })();
    },
  }));

  // Init native BarcodeDetector once (Chrome/Edge).
  useEffect(() => {
    (async () => {
      try {
        const BD = window.BarcodeDetector;
        if (!BD) {
          say('web: no BarcodeDetector in this browser, using jsQR');
          return;
        }
        let formats = ['qr_code'];
        try {
          const supported = await BD.getSupportedFormats();
          const keep = WANT_FORMATS.filter((f) => supported.includes(f));
          if (keep.length > 0) formats = keep;
        } catch {}
        detectorRef.current = new BD({ formats });
        say(`web: BarcodeDetector ready (${formats.length} formats)`);
      } catch (e: any) {
        say(`web: BarcodeDetector init failed: ${e?.message || e}`);
      }
    })();
  }, []);

  async function decodeFrame(video: HTMLVideoElement): Promise<{ text: string; via: string } | null> {
    const VW = video.videoWidth;
    const VH = video.videoHeight;
    if (!VW || !VH) return null;
    // Cap working resolution at 720p: QR survives downscale fine, and jsQR's
    // per-pixel cost drops ~3x vs 1080p. Keeps the 100ms tick achievable.
    const scale = Math.min(1, 960 / Math.max(VW, VH));
    const W = Math.max(1, Math.floor(VW * scale));
    const H = Math.max(1, Math.floor(VH * scale));
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, W, H);

    const hasNative = !!detectorRef.current;
    // (a) Native detector on downscaled pixels — fastest, multi-format.
    if (hasNative) {
      try {
        const res = await detectorRef.current!.detect(canvas);
        if (res && res.length > 0 && res[0].rawValue) {
          return { text: res[0].rawValue, via: `native(${res[0].format || '?'})` };
        }
      } catch {}
    }
    // (b) jsQR on the working frame.
    try {
      const img = ctx.getImageData(0, 0, W, H);
      const code = jsQR(img.data, W, H, { inversionAttempts: 'attemptBoth' });
      if (code?.data) return { text: code.data, via: 'jsQR-full' };
    } catch {}
    // (c) jsQR on 60% center crop upscaled 2x — catches small/far codes.
    // Skipped when the native detector exists: it already covers QR + 1D at
    // any size, and this is the most expensive pass (~2x a full decode).
    if (hasNative) return null;
    try {
      const sw = Math.floor(W * 0.6);
      const sh = Math.floor(H * 0.6);
      const sx = Math.floor((W - sw) / 2);
      const sy = Math.floor((H - sh) / 2);
      canvas.width = sw * 2;
      canvas.height = sh * 2;
        const ctx2 = canvas.getContext('2d', { willReadFrequently: true }) as unknown as CanvasRenderingContext2D | null;
      if (ctx2) {
        ctx2.drawImage(video, sx / scale, sy / scale, sw / scale, sh / scale, 0, 0, sw * 2, sh * 2);
        const img2 = ctx2.getImageData(0, 0, sw * 2, sh * 2);
        const code2 = jsQR(img2.data, sw * 2, sh * 2, { inversionAttempts: 'attemptBoth' });
        if (code2?.data) return { text: code2.data, via: 'jsQR-zoom' };
      }
    } catch {}
    return null;
  }

  function snapThumbnail(video: HTMLVideoElement) {
    try {
      if (!thumbRef.current) thumbRef.current = document.createElement('canvas');
      const c = thumbRef.current;
      c.width = 220;
      c.height = 124;
      const cx = c.getContext('2d') as unknown as CanvasRenderingContext2D | null;
      if (!cx) return;
      cx.drawImage(video, 0, 0, 220, 124);
      onThumbnail(c.toDataURL('image/jpeg', 0.5));
    } catch {}
  }

  // Camera lifecycle — re-acquire when `started` bumps (flip).
  useEffect(() => {
    stopRef.current = false;
    let stream: MediaStream | null = null;

    const pump = async () => {
      if (stopRef.current) return;
      if (!pausedRef.current && !busyRef.current) {
        busyRef.current = true;
        try {
          const video = videoRef.current as HTMLVideoElement | null;
          if (video && video.readyState >= 2 && video.videoWidth > 0) {
            triesRef.current += 1;
            const n = triesRef.current;
            const hit = await decodeFrame(video);
            if (hit) {
              say(`web: DECODED via ${hit.via} on frame ${n}: "${hit.text.slice(0, 60)}"`);
              try {
                (navigator as any).vibrate?.(80);
              } catch {}
              onCodeRef.current(hit.text, hit.via);
            } else {
              if (n === 1) say('web: live scan running — hold QR in the frame…');
              else if (n % 20 === 0) say(`web: ${n} frames, no code yet — move closer, fill the box`);
              if (n % 15 === 1) snapThumbnail(video);
            }
          }
        } catch (e: any) {
          say(`web: scan error: ${e?.message || e}`);
        }
        busyRef.current = false;
      }
      if (!stopRef.current) {
        timerRef.current = setTimeout(pump, 100);
      }
    };

    (async () => {
      try {
        say('web: requesting camera…');
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingRef.current === 'back' ? 'environment' : 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (stopRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current as HTMLVideoElement | null;
        if (!video) return;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {}
        const track = stream.getVideoTracks()[0];
        try {
          const caps = track?.getCapabilities?.() as any;
          onTorchAvailable(!!caps?.torch);
        } catch {
          onTorchAvailable(false);
        }
        say(`web: stream live (${video.videoWidth}x${video.videoHeight} ${track?.label || ''})`);
        pump();
      } catch (e: any) {
        const name = e?.name || 'Error';
        const msg = e?.message || String(e);
        say(`web: camera FAILED ${name}: ${msg}`);
        say(
          name === 'NotAllowedError'
            ? 'web: click the camera icon in the address bar, Allow, then reload'
            : name === 'NotFoundError'
              ? 'web: no camera found on this device'
              : name === 'NotReadableError'
                ? 'web: camera is busy — close Zoom/Teams/Camera app or other tabs, then reload'
                : `web: camera error: ${msg}`
        );
      }
    })();

    return () => {
      stopRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        stream?.getTracks().forEach((t) => t.stop());
      } catch {}
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  return (
    <Video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
    />
  );
});
