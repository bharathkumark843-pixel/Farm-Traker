import { toE164India } from '../db/types';

// Mobile-number OTP service.
//
// PROVIDERS
// - 'demo' (active): generates a 6-digit code on-device with 5-minute expiry.
//   There is no SMS gateway in this offline build, so the code is returned to
//   the caller and shown on-screen for the farmer to type in. Honest demo mode.
// - 'firebase' (seam, not wired): to send REAL SMS, add a Firebase project,
//   install @react-native-firebase/auth, implement FirebaseOtpProvider below
//   (web: RecaptchaVerifier + signInWithPhoneNumber; native: verifyPhoneNumber
//   + SHA-1 in google-services.json / APNs on iOS), and set ACTIVE = 'firebase'
//   with the project keys. Nothing else in the app changes — LoginScreen only
//   talks to requestOtp/verifyOtp/DEMO_REVEAL.

export type OtpProviderId = 'demo' | 'firebase';

const ACTIVE: OtpProviderId = 'demo';

// Demo sessions live only in memory: reinstall/restart invalidates them.
interface Session {
  phoneE164: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

const sessions = new Map<string, Session>();

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_S = 30;

function newCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function newSessionId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export interface OtpRequest {
  sessionId: string;
  // Demo only: the code to display on-screen. Null for real SMS providers.
  demoCode: string | null;
  provider: OtpProviderId;
}

export async function requestOtp(phoneDigits: string): Promise<OtpRequest> {
  const e164 = toE164India(phoneDigits);
  if (!e164) throw new Error('Enter a valid 10-digit mobile number.');
  if (ACTIVE === 'firebase') {
    // TODO(firebase): FirebaseOtpProvider.request(e164) -> { sessionId, demoCode: null }
    throw new Error('Firebase OTP is not configured yet. Add project keys first.');
  }
  const sessionId = newSessionId();
  sessions.set(sessionId, { phoneE164: e164, code: newCode(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  const s = sessions.get(sessionId)!;
  return { sessionId, demoCode: s.code, provider: 'demo' };
}

export async function verifyOtp(sessionId: string, code: string): Promise<string> {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Session expired. Please request a new code.');
  if (Date.now() > s.expiresAt) {
    sessions.delete(sessionId);
    throw new Error('Code expired. Please request a new code.');
  }
  s.attempts += 1;
  if (s.attempts > OTP_MAX_ATTEMPTS) {
    sessions.delete(sessionId);
    throw new Error('Too many wrong attempts. Please request a new code.');
  }
  if ((code || '').trim() !== s.code) throw new Error(`Wrong code. ${OTP_MAX_ATTEMPTS - s.attempts} tries left.`);
  sessions.delete(sessionId);
  return s.phoneE164; // verified number
}
