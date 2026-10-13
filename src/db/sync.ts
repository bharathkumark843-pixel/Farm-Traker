import { getCloud, getOwnerKey, isCloudConfigured } from './cloud';
import {
  getProducts,
  getLogs,
  getProfile,
  saveProduct,
  upsertUsageLogRaw,
  getTombstones,
  clearTombstones,
  getPref,
  setPref,
  type TombKind,
} from './database';
import type { Product, UsageLog } from './types';

// Offline-first cloud backup. Local SQLite/localStorage stays the source of truth
// for the UI; this mirrors it to Supabase when online. Last-write-wins by
// updatedAt/updated_at ISO strings (lexicographic compare is chronological).
// Single-device-per-farmer in v1: pull only upserts, never deletes.

export type SyncResult =
  | { ok: true; at: string; pushed: number; pulled: number }
  | { ok: false; reason: 'not-configured' | 'offline' | 'error'; error?: string };

// Web photos can be multi-MB base64 — keep the cloud row lean, local keeps all.
const MAX_PHOTO_CHARS = 400_000;

function toCloudProduct(p: Product, owner: string, at: string): Record<string, unknown> {
  const photo =
    p.photoUri.startsWith('data:') && p.photoUri.length > MAX_PHOTO_CHARS ? '' : p.photoUri;
  return {
    id: p.id,
    owner_phone: owner,
    name: p.name,
    category: p.category,
    barcode: p.barcode,
    photo_uri: photo,
    unit: p.unit,
    quantity_total: p.quantityTotal,
    quantity_remaining: p.quantityRemaining,
    low_stock_threshold: p.lowStockThreshold,
    price_paid: p.pricePaid,
    purchase_date: p.purchaseDate,
    expiry_date: p.expiryDate,
    manufacturer: p.manufacturer,
    label_info: p.labelInfo,
    created_at: p.createdAt,
    updated_at: at,
  };
}

function fromCloudProduct(r: any): Product {
  return {
    id: String(r.id),
    name: r.name ?? '',
    category: (r.category as Product['category']) ?? 'Other',
    barcode: r.barcode ?? '',
    // Cloud may hold '' for oversized photos (see toCloudProduct) — never let a
    // slim cloud row wipe a full local photo on pull.
    photoUri: undefined as unknown as string, // resolved by caller
    unit: r.unit ?? 'pcs',
    quantityTotal: Number(r.quantity_total ?? 0) || 0,
    quantityRemaining: Number(r.quantity_remaining ?? 0) || 0,
    lowStockThreshold: Number(r.low_stock_threshold ?? 0) || 0,
    pricePaid: Number(r.price_paid ?? 0) || 0,
    purchaseDate: r.purchase_date ?? '',
    expiryDate: r.expiry_date ?? '',
    manufacturer: r.manufacturer ?? '',
    labelInfo: r.label_info ?? '',
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? new Date().toISOString(),
  };
}

function toCloudLog(l: UsageLog, owner: string, at: string): Record<string, unknown> {
  return {
    id: l.id,
    owner_phone: owner,
    product_id: l.productId,
    date: l.date,
    quantity_used: l.quantityUsed,
    crop: l.crop,
    field: l.field,
    purpose_pest: l.purposePest,
    note: l.note,
    created_at: l.createdAt,
    updated_at: at,
  };
}

function fromCloudLog(r: any): UsageLog {
  return {
    id: String(r.id),
    productId: r.product_id ?? '',
    date: r.date ?? '',
    quantityUsed: Number(r.quantity_used ?? 0) || 0,
    crop: r.crop ?? '',
    field: r.field ?? '',
    purposePest: r.purpose_pest ?? '',
    note: r.note ?? '',
    createdAt: r.created_at ?? new Date().toISOString(),
  };
}

function isOfflineError(e: any): boolean {
  const m = `${e?.message ?? e}`.toLowerCase();
  return (
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('timeout')
  );
}

async function pushTombstones(
  db: NonNullable<ReturnType<typeof getCloud>>,
  owner: string,
  kind: TombKind,
  table: 'products' | 'usage_logs',
): Promise<number> {
  const ids = await getTombstones(kind);
  if (!ids.length) return 0;
  // Chunk to stay under URL/parameter limits.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error } = await db.from(table).delete().eq('owner_phone', owner).in('id', chunk);
    if (error) throw error;
  }
  await clearTombstones(kind);
  return ids.length;
}

async function pullTable(
  db: NonNullable<ReturnType<typeof getCloud>>,
  owner: string,
  table: 'products' | 'usage_logs',
  watermark: string,
): Promise<any[]> {
  let q = db.from(table).select('*').eq('owner_phone', owner).order('updated_at').limit(1000);
  if (watermark) q = q.gt('updated_at', watermark);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

let syncing = false;

export async function syncNow(): Promise<SyncResult> {
  if (syncing) return { ok: false, reason: 'error', error: 'Sync already running' };
  if (!isCloudConfigured()) return { ok: false, reason: 'not-configured' };
  const db = getCloud();
  if (!db) return { ok: false, reason: 'not-configured' };
  syncing = true;
  try {
    const owner = await getOwnerKey();
    const at = new Date().toISOString();
    let pushed = 0;
    let pulled = 0;

    // ---- PUSH (local → cloud, last-write-wins) ----
    const products = await getProducts();
    if (products.length) {
      const rows = products.map((p) => toCloudProduct(p, owner, at));
      const { error } = await db.from('products').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      pushed += rows.length;
    }
    const logs = await getLogs();
    if (logs.length) {
      const rows = logs.map((l) => toCloudLog(l, owner, at));
      const { error } = await db.from('usage_logs').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      pushed += rows.length;
    }
    try {
      const p = await getProfile();
      const { error } = await db.from('profiles').upsert(
        {
          owner_phone: owner,
          name: p.name,
          village: p.village,
          pincode: p.pincode,
          acres: p.acres,
          lang: p.lang,
          last_crop: p.lastCrop,
          onboarded: p.onboarded,
          updated_at: at,
        },
        { onConflict: 'owner_phone' },
      );
      if (error) throw error;
    } catch (e) {
      // Profile backup is best-effort; products + logs already pushed.
      if (!isOfflineError(e)) throw e;
      throw e;
    }
    pushed += await pushTombstones(db, owner, 'products', 'products');
    pushed += await pushTombstones(db, owner, 'logs', 'usage_logs');
    await setPref('cloud_last_push_at', at);

    // ---- PULL (cloud → local, newer rows only) ----
    const pullMark = await getPref('cloud_last_pull_at', '');
    const tombProducts = new Set(await getTombstones('products'));
    const tombLogs = new Set(await getTombstones('logs'));
    let maxSeen = pullMark;

    const cloudProducts = await pullTable(db, owner, 'products', pullMark);
    const localProducts = new Map((await getProducts()).map((p) => [p.id, p]));
    for (const r of cloudProducts) {
      const id = String(r.id);
      if (tombProducts.has(id)) continue;
      if (r.updated_at && maxSeen < r.updated_at) maxSeen = r.updated_at;
      const incoming = fromCloudProduct(r);
      const local = localProducts.get(id);
      // Keep the fuller local photo when cloud holds a slimmed placeholder.
      incoming.photoUri = !r.photo_uri && local?.photoUri ? local.photoUri : r.photo_uri ?? '';
      if (!local || (local.updatedAt ?? '') < (incoming.updatedAt ?? '')) {
        await saveProduct(incoming);
        pulled += 1;
      }
    }

    const cloudLogs = await pullTable(db, owner, 'usage_logs', pullMark);
    const localLogIds = new Set((await getLogs()).map((l) => l.id));
    for (const r of cloudLogs) {
      const id = String(r.id);
      if (tombLogs.has(id)) continue;
      if (r.updated_at && maxSeen < r.updated_at) maxSeen = r.updated_at;
      if (!localLogIds.has(id)) {
        // Raw upsert: must NOT touch stock (addUsageLog would subtract again).
        await upsertUsageLogRaw(fromCloudLog(r));
        pulled += 1;
      }
    }
    if (maxSeen) await setPref('cloud_last_pull_at', maxSeen);

    return { ok: true, at, pushed, pulled };
  } catch (e: any) {
    if (isOfflineError(e)) return { ok: false, reason: 'offline' };
    return { ok: false, reason: 'error', error: e?.message ?? String(e) };
  } finally {
    syncing = false;
  }
}

export async function lastSyncAt(): Promise<string> {
  return getPref('cloud_last_push_at', '');
}
