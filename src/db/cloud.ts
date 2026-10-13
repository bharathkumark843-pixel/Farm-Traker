import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getProfile, getPref, setPref } from './database';
import { newId } from './types';

// Cloud backup (Supabase). Fully optional: without keys the app stays 100% offline.
// Keys come from EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (.env,
// gitignored). `process` is declared locally so no @types/node dependency is needed;
// Expo inlines EXPO_PUBLIC_* vars at build time on native + web.
declare const process:
  | { env: Record<string, string | undefined> }
  | undefined;

function envVal(key: string): string {
  try {
    const v = (process as any)?.env?.[key];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

export function cloudUrl(): string {
  return envVal('EXPO_PUBLIC_SUPABASE_URL');
}

export function isCloudConfigured(): boolean {
  return !!cloudUrl() && !!envVal('EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

let client: SupabaseClient | null = null;

export function getCloud(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(cloudUrl(), envVal('EXPO_PUBLIC_SUPABASE_ANON_KEY'));
  }
  return client;
}

// Namespace for one farmer's rows. Verified phone after OTP login; before that a
// stable per-device id so pre-login data still syncs under a consistent owner.
export async function getOwnerKey(): Promise<string> {
  try {
    const p = await getProfile();
    if (p.phoneE164) return p.phoneE164;
  } catch {
    /* fall through to device id */
  }
  let id = await getPref('cloud_device_id', '');
  if (!id) {
    id = `device-${newId()}`;
    try {
      await setPref('cloud_device_id', id);
    } catch {
      /* memory-only fallback still works for this session */
    }
  }
  return id;
}
