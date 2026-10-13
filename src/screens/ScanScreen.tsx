import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Vibration,
  Platform,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import type { BarcodeType } from 'expo-camera';
import { WebQrScanner } from './WebQrScanner';
import type { WebScannerHandle } from './WebQrScanner';
import jsQRImport from 'jsqr';

// Normalise CJS/ESM interop — Metro web sometimes gives { default } instead.
const jsQR: any = (jsQRImport as any)?.default ?? (jsQRImport as any);
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { BigButton } from '../components/BigButton';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

// All 13 formats expo-camera supports (was only 6 before — missed aztec,
// datamatrix, pdf417, code39, code93, itf14, codabar).
const ALL_BARCODE_TYPES: BarcodeType[] = [
  'qr',
  'aztec',
  'ean13',
  'ean8',
  'pdf417',
  'upc_e',
  'datamatrix',
  'code39',
  'code93',
  'itf14',
  'codabar',
  'code128',
  'upc_a',
];

// Web BarcodeDetector formats mirroring WebQrScanner (multi-format, not QR-only).
const WEB_PHOTO_FORMATS = [
  'qr_code', 'aztec', 'data_matrix', 'pdf417',
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'code_93', 'itf', 'codabar',
];

// Decode a photo Blob with the browser's native BarcodeDetector (all formats:
// QR + EAN-13/8, UPC, Code128/39/93, ITF, Codabar, DataMatrix, PDF417, Aztec).
// Returns { data, format } or null. Web-only; resolves null where unsupported.
async function decodeBlobWithBarcodeDetector(blob: Blob): Promise<{ data: string; format: string } | null> {
  try {
    const BD = (window as any)?.BarcodeDetector;
    if (!BD || typeof document === 'undefined') return null;
    let formats = ['qr_code'];
    try {
      const supported: string[] = await BD.getSupportedFormats();
      const keep = WEB_PHOTO_FORMATS.filter((f) => supported.includes(f));
      if (keep.length > 0) formats = keep;
    } catch {}
    const detector = new BD({ formats });
    // Path A: ImageBitmap directly (fastest, keeps full resolution).
    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        try {
          const res = await detector.detect(bitmap);
          if (res?.length > 0 && res[0].rawValue) return { data: res[0].rawValue, format: res[0].format || 'barcode' };
        } finally {
          try { (bitmap as any).close?.(); } catch {}
        }
      }
    } catch {}
    // Path B: draw to canvas, detect on canvas (works where ImageBitmap fails).
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const img = await new Promise<any>((resolve) => {
      const DomImage = (globalThis as any)?.Image;
      if (!DomImage) { resolve(null); return; }
      const el = new DomImage();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = dataUrl;
    });
    if (!img) return null;
    const canvas = document.createElement('canvas');
    // Try full resolution first (1D barcodes need width), then downscaled.
    for (const maxSide of [1600, 800]) {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.floor(img.width * scale));
      canvas.height = Math.max(1, Math.floor(img.height * scale));
      const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D | null;
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const res = await detector.detect(canvas);
        if (res?.length > 0 && res[0].rawValue) return { data: res[0].rawValue, format: res[0].format || 'barcode' };
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

// Decode a base64/jpeg image with jsQR (QR codes ONLY — web gallery fallback).
function decodeBase64WithJsqr(base64: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const DomImage = (globalThis as any)?.Image;
      if (typeof document === 'undefined' || !DomImage) {
        resolve(null);
        return;
      }
      const img = new DomImage();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // Downscale big frames for speed — QR survives fine.
          const maxSide = 800;
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.floor(img.width * scale));
          canvas.height = Math.max(1, Math.floor(img.height * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as CanvasRenderingContext2D | null;
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          resolve(code ? code.data : null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    } catch {
      resolve(null);
    }
  });
}
// Decode a still-image URI with ZXing (multi-format, TRY_HARDER).
// Web-only. Covers QR + 1D (EAN-13/Code128 on pesticide bottles) even where
// the browser has no native BarcodeDetector (Firefox/Safari), plus rotated or
// small codes the fast paths miss. Returns { data, format } or null.
async function decodeUriWithZxing(uri: string): Promise<{ data: string; format: string } | null> {
  try {
    if (typeof document === 'undefined') return null;
    // Lazy require so the native bundle never executes browser code.
    const { BrowserMultiFormatReader } = require('@zxing/browser') as any;
    const { DecodeHintType, BarcodeFormat } = require('@zxing/library') as any;
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE, BarcodeFormat.AZTEC, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417,
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageUrl(uri);
    const text = result?.getText?.();
    if (text) {
      // getBarcodeFormat() is a numeric enum — reverse-map to its name
      // (e.g. 11 -> 'QR_CODE') for readable debug + result labels.
      const rawFmt = result?.getBarcodeFormat?.();
      const name = (typeof rawFmt === 'number' && BarcodeFormat?.[rawFmt]) || rawFmt || 'zxing';
      return { data: text, format: String(name) };
    }
    return null;
  } catch {
    return null;
  }
}

export function ScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState('');
  const [lastType, setLastType] = useState('');
  const [torch, setTorch] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [manual, setManual] = useState('');
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [debug, setDebug] = useState<string[]>([]);
  const [webTorchSupported, setWebTorchSupported] = useState(false);
  const [webTorchOn, setWebTorchOn] = useState(false);
  const [webThumb, setWebThumb] = useState('');
  const cooldown = useRef(false);
  const webRef = useRef<WebScannerHandle>(null);

  function log(line: string) {
    const stamped = `${new Date().toLocaleTimeString()}: ${line}`;
    setDebug((d) => [...d.slice(-9), stamped]);
    try {
      if (__DEV__) console.log('[SCAN]', line);
    } catch {}
  }

  useEffect(() => {
    if (!permission?.granted) requestPermission();
    // Native Google/Apple scanner dialog (iOS 16+ in this SDK; Android uses
    // ML Kit directly in the live view).
    try {
      setGoogleAvailable(CameraView.isModernBarcodeScannerAvailable ?? false);
    } catch {
      setGoogleAvailable(false);
    }
  }, [permission]);

  // Listen for native scanner dialog results (iOS).
  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    try {
      sub = CameraView.onModernBarcodeScanned((e) => {
        onCode(e.data, e.type || 'native-scan');
      });
    } catch {
      // Older builds — live view below still works.
    }
    return () => sub?.remove();
  }, []);

  function onCode(data: string, type: string) {
    if (!data) return;
    if (cooldown.current) return;
    cooldown.current = true;
    setScanned(true);
    setLastData(data);
    setLastType(type);
    try {
      Vibration.vibrate(80);
    } catch {}
    setTimeout(() => {
      cooldown.current = false;
    }, 1500);
  }

  // Official pattern: detach handler while scanned so no events are lost.
  // (Native only — web uses WebQrScanner's live raw-frame loop.)
  function handleLiveScan(e: { data: string; type: string }) {
    onCode(e.data, e.type);
  }

  // Native system scanner mode: full-screen OS dialog (Google ML Kit on
  // Android, native code scanner on iOS 16+). Result arrives via
  // onModernBarcodeScanned above. Most reliable on device — no live
  // preview focus/lighting issues.
  async function openGoogleScanner() {
    log('system: opening native scanner…');
    try {
      if (!googleAvailable && Platform.OS !== 'web') {
        log('system: modern scanner flag false — trying anyway');
      }
      await CameraView.launchScanner({ barcodeTypes: ALL_BARCODE_TYPES });
      log('system: scanner dismissed (no result = user cancelled)');
    } catch (e: any) {
      log(`system: launch failed: ${e?.message || e}`);
      Alert.alert(
        'System scanner failed',
        `${e?.message || 'Could not open native scanner.'}\n\nUse TAKE PHOTO & SCAN below instead.`
      );
    }
  }

  // Shared still-image decode pipeline: native ML Kit first, then web
  // BarcodeDetector (multi-format, fast), then ZXing (multi-format,
  // thorough — the Firefox/Safari path), then jsQR (QR-only). Used by BOTH
  // gallery picks and camera captures so a blurry live frame still scans.
  async function decodeImageUri(uri: string, source: string) {
    log(`${source}: got uri len=${uri.length} (${uri.slice(0, 40)}…)`);
    // 1) Native still-image decoder (Android ML Kit / iOS). Skipped on web:
    // expo-camera's web module has no scanFromURLAsync, so calling it there
    // can only throw and confuse the debug log.
    if (Platform.OS !== 'web') {
      try {
        const results = await scanFromURLAsync(uri, ALL_BARCODE_TYPES);
        log(`${source}: native decoder found ${results.length}`);
        if (results.length > 0) {
          onCode(results[0].data, results[0].type);
          return true;
        }
      } catch (e: any) {
        log(`${source}: native decoder error: ${e?.message || e}`);
      }
    }
    // 1b) Web: BarcodeDetector still-photo decode (ALL formats incl. EAN-13
    // / Code128 on pesticide bottles — jsQR below is QR-only and misses them).
    let photoBlob: Blob | null = null;
    if (typeof document !== 'undefined') {
      try {
        log(`${source}: trying BarcodeDetector (multi-format)…`);
        const resp = await fetch(uri);
        photoBlob = await resp.blob();
        log(`${source}: blob size=${photoBlob.size} type=${photoBlob.type}`);
        const hit = await decodeBlobWithBarcodeDetector(photoBlob);
        log(`${source}: BarcodeDetector result=${hit ? `"${String(hit.data).slice(0, 60)}" (${hit.format})` : 'null'}`);
        if (hit) {
          onCode(hit.data, hit.format);
          return true;
        }
      } catch (e: any) {
        log(`${source}: BarcodeDetector error: ${e?.message || e}`);
      }
    }
    // 1c) Web: ZXing thorough decode (ALL formats incl. EAN-13/Code128,
    // works even without BarcodeDetector, handles rotated/small codes).
    // Decodes straight from the URI — no blob needed.
    if (typeof document !== 'undefined') {
      try {
        log(`${source}: trying ZXing (multi-format, thorough)…`);
        const hit = await decodeUriWithZxing(uri);
        log(`${source}: ZXing result=${hit ? `"${String(hit.data).slice(0, 60)}" (${hit.format})` : 'null'}`);
        if (hit) {
          onCode(hit.data, hit.format);
          return true;
        }
      } catch (e: any) {
        log(`${source}: ZXing error: ${e?.message || e}`);
      }
    }
    // 2) jsQR fallback — QR codes only. Reuses the already-fetched blob.
    try {
      if (typeof document !== 'undefined') {
        log(`${source}: trying jsQR fallback (QR only)…`);
        const blob = photoBlob ?? await (await fetch(uri)).blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        const text = await decodeBase64WithJsqr(dataUrl);
        log(`${source}: jsQR result=${text ? `"${text.slice(0, 60)}"` : 'null'}`);
        if (text) {
          onCode(text, 'qr');
          return true;
        }
      } else {
        log(`${source}: no DOM, photo decode fallbacks skipped`);
      }
      Alert.alert(
        'No QR found',
        'No barcode detected in that image. Try a clearer photo with the code filling most of the frame.'
      );
      return false;
    } catch (e: any) {
      log(`${source}: jsQR error: ${e?.message || e}`);
      Alert.alert('Decode failed', e?.message || 'Could not read that image.');
      return false;
    }
  }

  // "Take picture in the scanner and scan it" — web grabs a full-res still
  // from the live <video>, native launches the camera. Same decode pipeline.
  async function takePhotoAndScan() {
    log('capture: taking picture…');
    try {
      if (Platform.OS === 'web') {
        const still = webRef.current?.captureStill?.() ?? null;
        if (!still) {
          log('capture: no frame yet — allow camera, then retry');
          Alert.alert('Camera not ready', 'Allow camera access and wait for the live preview, then try again.');
          return;
        }
        log(`capture: still len=${still.length}`);
        await decodeImageUri(still, 'capture');
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      log(`capture: camera permission granted=${perm.granted}`);
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow camera access to take a photo and scan it.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        exif: false,
        quality: 1,
      });
      log(`capture: camera canceled=${res.canceled}`);
      if (res.canceled || !res.assets?.[0]?.uri) return;
      await decodeImageUri(res.assets[0].uri, 'capture');
    } catch (e: any) {
      log(`capture: FATAL ${e?.message || e}`);
      Alert.alert('Capture failed', e?.message || String(e));
    }
  }

  // Real QR decode from a photo — like Google Lens "search from gallery".
  // EVERY step is logged on-screen so silent failures are impossible.
  async function pickAndDecode() {
    log('photo: opening…');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      log(`photo: media permission granted=${perm.granted}`);
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to scan a saved QR image.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        exif: false,
        quality: 1,
      });
      log(`photo: picker canceled=${res.canceled}`);
      if (res.canceled || !res.assets?.[0]?.uri) return;
      await decodeImageUri(res.assets[0].uri, 'photo');
    } catch (e: any) {
      log(`photo: FATAL ${e?.message || e}`);
      Alert.alert('Picker failed', e?.message || String(e));
    }
  }

  function useScannedCode() {
    // Pass the raw payload too: AddEdit parses QR text (manufacturer, brand,
    // reg/batch lines) into the matching form fields.
    navigation.navigate('AddEdit', { barcode: lastData, scannedText: lastData });
  }

  if (!permission) return <Text style={styles.msg}>Loading camera…</Text>;
  if (!permission.granted)
    return (
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, styles.centerContent]}>
        <Text style={styles.msg}>Camera access is needed to scan.</Text>
        <BigButton title="ALLOW CAMERA" onPress={requestPermission} />
        <Text style={styles.hint}>Or enter the code by hand below.</Text>
        <ManualEntry value={manual} onChange={setManual} onSubmit={() => navigation.navigate('AddEdit', { barcode: manual })} />
      </ScrollView>
    );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        {Platform.OS === 'web' ? 'Point camera at QR / Barcode' : 'Scan QR / Barcode'}
      </Text>
      <View style={styles.offlineBadge}>
        <Text style={styles.offlineBadgeText}>• Works offline / ఆఫ్‌లైన్‌లో పనిచేస్తుంది</Text>
      </View>

      {/* NATIVE MODE: system scanner dialog (no live preview — the old live
          CameraView missed codes). Web keeps the live raw-frame viewfinder. */}
      {Platform.OS === 'web' ? (
        <View style={styles.frame}>
          <WebQrScanner
            ref={webRef}
            onCode={onCode}
            log={log}
            paused={scanned}
            onTorchAvailable={setWebTorchSupported}
            onTorchChange={setWebTorchOn}
            onThumbnail={setWebThumb}
          />
          {/* corner brackets like Google Lens */}
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          {/* laser line */}
          {!scanned && <View style={styles.laser} />}
          {scanned && (
            <View style={styles.foundBanner}>
              <Text style={styles.foundText}>✓ Found ({lastType})</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.systemCard}>
          <Text style={styles.systemTitle}>◎  SYSTEM SCANNER</Text>
          <Text style={styles.systemHint}>
            Opens your phone's full-screen scanner — fastest and most reliable. Point at the code and it fills in automatically.
          </Text>
          {scanned && (
            <View style={styles.foundBannerInline}>
              <Text style={styles.foundText}>✓ Found ({lastType})</Text>
            </View>
          )}
        </View>
      )}

      {scanned ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Scanned code:</Text>
          <Text style={styles.resultData} selectable>
            {lastData}
          </Text>
          <BigButton title="✓  USE THIS CODE" onPress={useScannedCode} />
          <BigButton title="↻  SCAN AGAIN" onPress={() => { setScanned(false); setLastData(''); }} variant="secondary" />
        </View>
      ) : Platform.OS !== 'web' ? (
        <>
          <BigButton title="◎  SCAN NOW" onPress={openGoogleScanner} />
          {!googleAvailable && (
            <Text style={styles.hint}>If the system scanner is unavailable, use photo capture below.</Text>
          )}
          <Text style={styles.sectionLabel}>If scan fails / స్కాన్ కాకపోతే:</Text>
          <BigButton title="📷  TAKE PHOTO & SCAN" onPress={takePhotoAndScan} variant="secondary" />
          <BigButton title="🖼  SCAN FROM PHOTO" onPress={pickAndDecode} variant="secondary" />
        </>
      ) : (
        <>
          <View style={styles.row}>
            {webTorchSupported && (
              <TouchableOpacity
                style={styles.smallBtn}
                onPress={() => webRef.current?.toggleTorch()}
              >
                <Text style={styles.smallBtnText}>
                  {webTorchOn ? '🔦 TORCH OFF' : '🔦 TORCH ON'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => webRef.current?.flip()}
            >
              <Text style={styles.smallBtnText}>🔄 FLIP</Text>
            </TouchableOpacity>
          </View>
          <BigButton title="📷  TAKE PHOTO & SCAN" onPress={takePhotoAndScan} />
          <Text style={styles.sectionLabel}>If scan fails / స్కాన్ కాకపోతే:</Text>
          <BigButton title="🖼  SCAN FROM PHOTO" onPress={pickAndDecode} variant="secondary" />
          {webThumb ? (
            <View style={styles.thumbWrap}>
              <Text style={styles.thumbLabel}>What the decoder sees:</Text>
              <Image source={{ uri: webThumb }} style={styles.thumb} />
            </View>
          ) : null}
        </>
      )}

      <BigButton
        title="⌨️  TYPE CODE"
        onPress={() => navigation.navigate('AddEdit', {})}
        variant="secondary"
      />
      <ManualEntry value={manual} onChange={setManual} onSubmit={() => navigation.navigate('AddEdit', { barcode: manual })} />
      {__DEV__ && Platform.OS === 'web' && (
        <View style={styles.debugBox}>
          <Text style={styles.debugTitle}>DEBUG LOG (dev only)</Text>
          {debug.length === 0 ? (
            <Text style={styles.debugLine}>Waiting for camera… allow access when asked.</Text>
          ) : (
            debug.map((d, i) => (
              <Text key={i} style={styles.debugLine}>
                {d}
              </Text>
            ))
          )}
        </View>
      )}
      <Text style={styles.hint}>
        • Hold steady, fill the frame.{'\n'}• Good light helps.{'\n'}• QR on screen: brightness up.
        {Platform.OS === 'web' ? ' On web, Chrome/Edge detect fastest.' : ''}
      </Text>
    </ScrollView>
  );
}

function ManualEntry({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <View style={styles.manualRow}>
      <TextInput
        style={styles.manualInput}
        value={value}
        onChangeText={onChange}
        placeholder="Type code manually / కోడ్ టైప్ చేయండి"
        autoCapitalize="none"
        returnKeyType="go"
      />
      <TouchableOpacity style={styles.manualBtn} onPress={onSubmit} accessibilityRole="button" accessibilityLabel="Submit manual code">
        <Text style={styles.manualBtnText}>GO</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  centerContent: { justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 4, color: theme.colors.text },
  offlineBadge: { alignSelf: 'center', backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  offlineBadgeText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primaryDark },
  sectionLabel: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text, marginTop: 12, marginBottom: 4 },
  msg: { fontSize: 20, textAlign: 'center', margin: 16, color: theme.colors.text },
  frame: {
    height: 340,
    borderRadius: theme.radius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    backgroundColor: '#000',
    position: 'relative',
  },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: '#00e676', zIndex: 2 },
  tl: { top: 14, left: 14, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 8 },
  tr: { top: 14, right: 14, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 8 },
  bl: { bottom: 14, left: 14, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 8 },
  br: { bottom: 14, right: 14, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 8 },
  laser: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: '48%',
    height: 3,
    backgroundColor: '#ff3b30',
    opacity: 0.9,
    borderRadius: 2,
    zIndex: 2,
  },
  foundBanner: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: '#00e676',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 3,
  },
  foundText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  systemCard: { backgroundColor: '#e8f5e9', borderWidth: 2, borderColor: '#2e7d32', borderRadius: 12, padding: 20, marginVertical: 8, alignItems: 'center' },
  systemTitle: { fontSize: 22, fontWeight: 'bold', color: '#2e7d32', marginBottom: 8 },
  systemHint: { fontSize: 16, color: theme.colors.text, textAlign: 'center', lineHeight: 22 },
  foundBannerInline: { backgroundColor: '#00e676', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 10 },
  resultCard: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 12, marginVertical: 8 },
  resultLabel: { fontSize: 16, color: theme.colors.muted },
  resultData: { fontSize: 20, fontWeight: 'bold', marginVertical: 6, color: theme.colors.text },
  row: { flexDirection: 'row', gap: 12, marginVertical: 4 },
  smallBtn: { flex: 1, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 10, padding: 16, minHeight: 56, justifyContent: 'center', alignItems: 'center' },
  smallBtnText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  thumbWrap: { marginTop: 4, alignItems: 'center' },
  thumbLabel: { fontSize: 16, color: theme.colors.muted, marginBottom: 4 },
  thumb: { width: 220, height: 124, borderRadius: 8, backgroundColor: '#000' },
  manualRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: 12,
    fontSize: 20,
    padding: 14,
    minHeight: 64,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
  },
  manualBtn: { backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 24, minHeight: 64, minWidth: 72, justifyContent: 'center', alignItems: 'center' },
  manualBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 20 },
  debugBox: { backgroundColor: '#111', borderRadius: 10, padding: 10, marginTop: 10 },
  debugTitle: { color: '#ffeb3b', fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  debugLine: { color: '#fff', fontSize: 16 },
  hint: { fontSize: 16, color: theme.colors.muted, textAlign: 'center', marginTop: 10, lineHeight: 22 },
});
