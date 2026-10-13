// Parses a scanned QR/barcode payload into product-form fields.
//
// A scan carries very different things depending on the bottle:
//   - a plain 1D code ("8901234567890") → barcode only;
//   - a URL → barcode only (it IS the identifier);
//   - a JSON object (some smart-label codes) → mapped keys;
//   - free text from Indian pesticide labels, e.g.
//       "Mfd By : Krishi AgriInputs\n\nReg No.: BHGT654/2019-TestReg\n\nBatch: …"
//     → manufacturer + label lines.
//
// The parser NEVER guesses quantity, expiry, price, or category — those stay
// for the farmer to enter. Unknown lines are kept in labelInfo (capped) so no
// scanned detail is lost.

export interface ParsedQr {
  /** Code-like identifier (digits / short single-line token), or '' for free text. */
  barcode: string;
  /** Guessed brand / product name, or ''. */
  name: string;
  /** Guessed manufacturer, or ''. */
  manufacturer: string;
  /** Cleaned full detail text (capped), or ''. */
  labelInfo: string;
}

const LABEL_CAP = 1000;

function cap(s: string): string {
  const t = (s || '').trim().replace(/\r/g, '');
  return t.length > LABEL_CAP ? t.slice(0, LABEL_CAP) : t;
}

function cleanValue(v: string): string {
  return v.replace(/^[:\-\s]+/, '').replace(/[:\-\s]+$/, '').trim();
}

const MFR_KEY = /manufact|mfd(?!\s*date)|marketed|mktd|company|mfg\s*by|packed\s*by/i;
const NAME_KEY = /brand|trade\s*name|product(\s*name)?|item(\s*name)?|commodity/i;
const KEEP_KEY = /reg(\.|istration)?\s*no|licen[sc]e|batch|lot\s*no|mfg(\s*date|\s*dt)?|manufacturing\s*date|exp|expiry|valid|net\s*(qty|quantity|content|wt)/i;

function fromJson(raw: string): ParsedQr | null {
  let o: any;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const get = (...keys: string[]): string => {
    for (const k of Object.keys(o)) {
      if (keys.some((w) => k.toLowerCase().includes(w))) {
        const v = o[k];
        if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
      }
    }
    return '';
  };
  const name = get('brand', 'product', 'tradename', 'itemname', 'name');
  const manufacturer = get('mfdby', 'manufact', 'marketed', 'company', 'mfr');
  const rest: string[] = [];
  for (const k of Object.keys(o)) {
    const lk = k.toLowerCase();
    if (/brand|product|tradename|itemname|^name$|manufact|marketed|company|mfr/.test(lk)) continue;
    rest.push(`${k}: ${o[k]}`);
  }
  const labelInfo = cap(rest.join('\n') || raw);
  return { barcode: '', name, manufacturer, labelInfo };
}

export function parseQrPayload(data: string): ParsedQr {
  const raw = (data || '').trim();
  const empty: ParsedQr = { barcode: '', name: '', manufacturer: '', labelInfo: '' };
  if (!raw) return empty;

  // JSON smart-label payload.
  if (raw.startsWith('{')) {
    const j = fromJson(raw);
    if (j) return j;
  }

  const hasNewline = /[\n]/.test(raw);
  const singleLine = !hasNewline;

  // Plain 1D code: digits (allow spaces), 8–14 chars.
  const digits = raw.replace(/[\s-]/g, '');
  if (singleLine && /^\d{8,14}$/.test(digits)) {
    return { ...empty, barcode: raw };
  }

  // URL — it is the identifier.
  if (singleLine && /^https?:\/\/\S+$/i.test(raw)) {
    return { ...empty, barcode: raw };
  }

  // Short single-line token (e.g. internal codes like "ABC-123"): keep as
  // barcode AND as the name seed so the form is not blank.
  if (singleLine && raw.length <= 48) {
    return { ...empty, barcode: raw, name: raw };
  }

  // Free text (possibly multi-line label dump).
  let name = '';
  let manufacturer = '';
  const labelLines: string[] = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const ci = line.indexOf(':');
    if (ci > 0) {
      const key = line.slice(0, ci).trim();
      const value = cleanValue(line.slice(ci + 1));
      if (MFR_KEY.test(key)) {
        if (!manufacturer && value) manufacturer = value;
        continue; // consumed into its own field
      }
      if (NAME_KEY.test(key)) {
        if (!name && value) name = value;
        continue;
      }
      // Registration / batch / date lines are detail, not form fields.
      if (KEEP_KEY.test(key) || value) {
        labelLines.push(value ? `${key}: ${value}` : line);
        continue;
      }
      labelLines.push(line);
    } else {
      labelLines.push(line);
    }
  }
  const labelInfo = cap(labelLines.join('\n') || raw);
  return { barcode: '', name, manufacturer, labelInfo };
}
