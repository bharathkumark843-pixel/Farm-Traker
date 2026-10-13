import { Platform } from 'react-native';
import type * as SQLiteTypes from 'expo-sqlite';
import { Product, UsageLog, Scheme, Loan, Profile, defaultProfile, newId } from './types';

// Offline-first storage.
// - Native: expo-sqlite (farm_tracker.db), memory fallback if unavailable.
// - Web: persistent localStorage store (survives reloads) — browsers have no
//   SQLite here, and the old in-memory store lost everything on refresh.
// NOTE: expo-sqlite is loaded lazily (require, not import) so the web build
// never touches the native module.
type Db = SQLiteTypes.SQLiteDatabase;

const IS_WEB = Platform.OS === 'web';

let SQLite: typeof SQLiteTypes | null = null;
let sqliteFailed = false;

function loadSQLite(): typeof SQLiteTypes | null {
  if (IS_WEB) return null; // web uses the localStorage store below
  if (SQLite) return SQLite;
  if (sqliteFailed) return null;
  try {
    SQLite = require('expo-sqlite') as typeof SQLiteTypes;
    return SQLite;
  } catch {
    sqliteFailed = true; // e.g. Expo Go without the module
    return null;
  }
}

let db: Db | null = null;
let useMemory = false;
const mem = { products: [] as Product[], logs: [] as UsageLog[] };

// ---------- Web persistent store (localStorage) ----------
const LS_PRODUCTS = 'farm_tracker.products.v1';
const LS_LOGS = 'farm_tracker.logs.v1';
const LS_SEEDED = 'farm_tracker.seeded.v1';
const LS_SCHEMES = 'farm_tracker.schemes.v2';
const LS_LOANS = 'farm_tracker.loans.v2';
const LS_PROFILE = 'farm_tracker.profile.v2';
const LS_PREFS = 'farm_tracker.prefs.v2';

function lsGet<T>(key: string, fallback: T): T {
  try {
    const ls = (globalThis as any)?.localStorage;
    if (!ls) return fallback;
    const raw = ls.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): boolean {
  try {
    const ls = (globalThis as any)?.localStorage;
    if (!ls) return false;
    ls.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // e.g. quota exceeded, private mode
  }
}

// Probe once whether persistent web storage actually works (read AND
// write). file:// pages, private mode, or full quota can all fail —
// without this, saves would vanish silently. When broken, the app falls
// back to in-memory session storage (data works until reload) instead of
// losing the farmer's entries without a word.
let lsOk: boolean | null = null;
function webStoreOk(): boolean {
  if (lsOk !== null) return lsOk;
  try {
    const ls = (globalThis as any)?.localStorage;
    if (!ls) { lsOk = false; return lsOk; }
    const probe = '__farm_tracker_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    lsOk = true;
  } catch {
    lsOk = false;
  }
  if (!lsOk) {
    try { console.warn('[farm-tracker] localStorage unavailable — using session-only storage (data will not survive reload).'); } catch {}
  }
  return lsOk;
}

// Session-only mirror used when localStorage is unavailable.
const memWeb = {
  products: null as Product[] | null,
  logs: [] as UsageLog[],
  profile: null as Profile | null,
  seeded: false,
};

// Seed demo data exactly once (a flag — not "empty means first run", so
// deleting all products does NOT resurrect the demos).
function ensureSeededWeb(): void {
  try {
    if (lsGet<boolean>(LS_SEEDED, false)) return;
    if (lsGet<Product[]>(LS_PRODUCTS, []).length === 0) {
      lsSet(LS_PRODUCTS, demoProducts());
    }
    lsSet(LS_SEEDED, true);
  } catch {}
}

function webProducts(): Product[] {
  if (!webStoreOk()) {
    if (!memWeb.seeded) { memWeb.products = demoProducts(); memWeb.seeded = true; }
    return memWeb.products ?? [];
  }
  ensureSeededWeb();
  return lsGet<Product[]>(LS_PRODUCTS, []);
}

function webSaveProducts(list: Product[]): void {
  if (!webStoreOk()) { memWeb.products = [...list]; return; }
  lsSet(LS_PRODUCTS, list);
}

function webLogs(): UsageLog[] {
  if (!webStoreOk()) return [...memWeb.logs];
  return lsGet<UsageLog[]>(LS_LOGS, []);
}

// Web localStorage is ~5MB: if a write is rejected (quota/private mode),
// trim old logs and retry once instead of silently losing the new entry.
function webSaveLogs(logs: UsageLog[]): void {
  if (!webStoreOk()) { memWeb.logs = [...logs]; return; }
  if (lsSet(LS_LOGS, logs)) return;
  lsSet(LS_LOGS, logs.slice(0, 2000));
}

function getDb(): Db | null {
  if (useMemory) return null;
  const mod = loadSQLite();
  if (!mod) {
    useMemory = true;
    return null;
  }
  try {
    if (!db) db = mod.openDatabaseSync('farm_tracker.db');
    return db;
  } catch {
    useMemory = true;
    return null;
  }
}

export async function initDb(): Promise<void> {
  if (IS_WEB) {
    ensureSeededWeb();
    return;
  }
  const d = getDb();
  if (!d) {
    // Seed demo data on first run so Home screen is not empty.
    if (mem.products.length === 0) seedDemo();
    return;
  }
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT, category TEXT, barcode TEXT,
      photoUri TEXT, unit TEXT, quantityTotal REAL, quantityRemaining REAL,
      lowStockThreshold REAL, pricePaid REAL, purchaseDate TEXT, expiryDate TEXT,
      manufacturer TEXT, labelInfo TEXT, createdAt TEXT, updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY, productId TEXT, date TEXT, quantityUsed REAL,
      crop TEXT, field TEXT, purposePest TEXT, note TEXT, createdAt TEXT
    );
    CREATE TABLE IF NOT EXISTS schemes_cache (
      id TEXT PRIMARY KEY, title_en TEXT, title_te TEXT,
      desc_en TEXT, desc_te TEXT, link TEXT, phone TEXT, updatedOn TEXT
    );
    CREATE TABLE IF NOT EXISTS loans_cache (
      id TEXT PRIMARY KEY, title_en TEXT, title_te TEXT,
      desc_en TEXT, desc_te TEXT, link TEXT, phone TEXT, updatedOn TEXT
    );
    CREATE TABLE IF NOT EXISTS profile (
      id TEXT PRIMARY KEY CHECK (id = 'me'),
      phoneE164 TEXT, phoneVerified INTEGER, name TEXT, village TEXT, pincode TEXT,
      lang TEXT, lastCrop TEXT, onboarded INTEGER, updatedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS app_prefs (key TEXT PRIMARY KEY, value TEXT);
    CREATE INDEX IF NOT EXISTS idx_logs_crop ON usage_logs(crop);
    CREATE INDEX IF NOT EXISTS idx_logs_product ON usage_logs(productId);
  `);
  // Migration for installs created before the acres column existed.
  try { await d.execAsync('ALTER TABLE profile ADD COLUMN acres REAL DEFAULT 0'); } catch { /* column already there */ }
  // Migration for installs created before phone-OTP login (pincode column).
  try { await d.execAsync('ALTER TABLE profile ADD COLUMN pincode TEXT DEFAULT ""'); } catch { /* column already there */ }
  const row = await d.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM products');
  if (row && row.c === 0) {
    for (const p of demoProducts()) await saveProduct(p);
  }
}

function seedDemo() {
  mem.products = demoProducts();
  mem.logs = [];
}

function demoProducts(): Product[] {
  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
  return [
    {
      id: newId(), name: 'Sample Insecticide', category: 'Insecticide',
      barcode: '8901234567890', photoUri: '', unit: 'Litre',
      quantityTotal: 5, quantityRemaining: 1, lowStockThreshold: 2,
      pricePaid: 850, purchaseDate: '2026-01-10', expiryDate: soon,
      manufacturer: 'Demo Agro', labelInfo: 'Official label text from bottle.',
      createdAt: now, updatedAt: now,
    },
    {
      id: newId(), name: 'Sample Pesticide', category: 'Pesticide',
      barcode: '', photoUri: '', unit: 'Kg',
      quantityTotal: 10, quantityRemaining: 8, lowStockThreshold: 2,
      pricePaid: 1200, purchaseDate: '2026-02-01', expiryDate: later,
      manufacturer: 'Demo Agro', labelInfo: '',
      createdAt: now, updatedAt: now,
    },
  ];
}

function rowToProduct(r: any): Product {
  return r as Product;
}

export async function getProducts(): Promise<Product[]> {
  if (IS_WEB) {
    return [...webProducts()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const d = getDb();
  if (!d) return [...mem.products].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = await d.getAllAsync<any>('SELECT * FROM products ORDER BY createdAt DESC');
  return rows.map(rowToProduct);
}

export async function getProduct(id: string): Promise<Product | null> {
  if (IS_WEB) return webProducts().find((p) => p.id === id) ?? null;
  const d = getDb();
  if (!d) return mem.products.find((p) => p.id === id) ?? null;
  const row = await d.getFirstAsync<any>('SELECT * FROM products WHERE id = ?', id);
  return row ? rowToProduct(row) : null;
}

// Find a saved product by its scanned barcode (exact match after trim).
// Used after a scan: if the farmer saved this chemical before, its details
// (name, photo, unit…) can be re-applied instead of typing again.
export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const t = (barcode || '').trim();
  if (!t) return null;
  if (IS_WEB) return webProducts().find((p) => (p.barcode || '').trim() === t) ?? null;
  const d = getDb();
  if (!d) return mem.products.find((p) => (p.barcode || '').trim() === t) ?? null;
  const row = await d.getFirstAsync<any>('SELECT * FROM products WHERE barcode = ?', t);
  return row ? rowToProduct(row) : null;
}

export async function saveProduct(p: Product): Promise<void> {
  if (IS_WEB) {
    const list = webProducts();
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = p;
    else list.unshift(p);
    // Product photos on web are huge base64 strings — if the 5MB
    // localStorage quota rejects the write, retry without the photo so the
    // product itself is still saved.
    if (!lsSet(LS_PRODUCTS, list)) {
      const slim = { ...p, photoUri: '' };
      const j = list.findIndex((x) => x.id === p.id);
      if (j >= 0) list[j] = slim;
      lsSet(LS_PRODUCTS, list);
    }
    return;
  }
  const d = getDb();
  if (!d) {
    const i = mem.products.findIndex((x) => x.id === p.id);
    if (i >= 0) mem.products[i] = p;
    else mem.products.unshift(p);
    return;
  }
  await d.runAsync(
    `INSERT OR REPLACE INTO products
     (id,name,category,barcode,photoUri,unit,quantityTotal,quantityRemaining,
      lowStockThreshold,pricePaid,purchaseDate,expiryDate,manufacturer,labelInfo,createdAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    p.id, p.name, p.category, p.barcode, p.photoUri, p.unit,
    p.quantityTotal, p.quantityRemaining, p.lowStockThreshold, p.pricePaid,
    p.purchaseDate, p.expiryDate, p.manufacturer, p.labelInfo, p.createdAt, p.updatedAt
  );
}

export async function deleteProduct(id: string): Promise<void> {
  if (IS_WEB) {
    webSaveProducts(webProducts().filter((p) => p.id !== id));
    webSaveLogs(webLogs().filter((l) => l.productId !== id));
    return;
  }
  const d = getDb();
  if (!d) {
    mem.products = mem.products.filter((p) => p.id !== id);
    mem.logs = mem.logs.filter((l) => l.productId !== id);
    return;
  }
  await d.runAsync('DELETE FROM products WHERE id = ?', id);
  await d.runAsync('DELETE FROM usage_logs WHERE productId = ?', id);
}

export async function getLogs(productId?: string): Promise<UsageLog[]> {
  if (IS_WEB) {
    const all = [...webLogs()].sort((a, b) => b.date.localeCompare(a.date));
    return productId ? all.filter((l) => l.productId === productId) : all;
  }
  const d = getDb();
  if (!d) {
    const all = [...mem.logs].sort((a, b) => b.date.localeCompare(a.date));
    return productId ? all.filter((l) => l.productId === productId) : all;
  }
  if (productId)
    return await d.getAllAsync<UsageLog>('SELECT * FROM usage_logs WHERE productId = ? ORDER BY date DESC', productId);
  return await d.getAllAsync<UsageLog>('SELECT * FROM usage_logs ORDER BY date DESC');
}

export async function addUsageLog(log: UsageLog): Promise<void> {
  if (IS_WEB) {
    const logs = webLogs();
    logs.unshift(log);
    webSaveLogs(logs);
    const products = webProducts();
    const p = products.find((x) => x.id === log.productId);
    if (p) {
      p.quantityRemaining = Math.max(0, p.quantityRemaining - log.quantityUsed);
      p.updatedAt = new Date().toISOString();
      webSaveProducts(products);
    }
    return;
  }
  const d = getDb();
  if (!d) {
    mem.logs.unshift(log);
    const p = mem.products.find((x) => x.id === log.productId);
    if (p) {
      p.quantityRemaining = Math.max(0, p.quantityRemaining - log.quantityUsed);
      p.updatedAt = new Date().toISOString();
    }
    return;
  }
  await d.runAsync(
    'INSERT INTO usage_logs (id,productId,date,quantityUsed,crop,field,purposePest,note,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    log.id, log.productId, log.date, log.quantityUsed, log.crop, log.field, log.purposePest, log.note, log.createdAt
  );
  // Subtract stock, never below zero (caller confirms if it would go negative).
  const p = await getProduct(log.productId);
  if (p) {
    p.quantityRemaining = Math.max(0, p.quantityRemaining - log.quantityUsed);
    p.updatedAt = new Date().toISOString();
    await saveProduct(p);
  }
}

export async function deleteUsageLog(id: string): Promise<void> {
  if (IS_WEB) {
    webSaveLogs(webLogs().filter((l) => l.id !== id));
    return;
  }
  const d = getDb();
  if (!d) {
    mem.logs = mem.logs.filter((l) => l.id !== id);
    return;
  }
  await d.runAsync('DELETE FROM usage_logs WHERE id = ?', id);
}

// ---------- P0 v2: filtered helpers ----------
export async function getLogsByCrop(crop: string): Promise<UsageLog[]> {
  const all = await getLogs();
  if (!crop || crop === 'All') return all;
  const t = crop.trim().toLowerCase();
  return all.filter((l) => (l.crop || '').trim().toLowerCase() === t);
}

// ---------- P0 v2: schemes / loans cache (offline-first, online refresh via JSON URL) ----------
export const BUNDLED_SCHEMES: Scheme[] = [
  { id: 'pm-kisan', title_en: 'PM-KISAN Income Support', title_te: 'పీఎం కిసాన్ ఆదాయ మద్దతు', desc_en: 'Rs 6,000/year in 3 instalments of Rs 2,000 by DBT to land-holding farmer families. 23rd instalment released 20-Jun-2026. Needs Aadhaar-seeded bank + e-KYC + land seeding. Check status on pmkisan.gov.in.', desc_te: 'భూమి ఉన్న రైతు కుటుంబాలకు ఏడాదికి రూ.6,000 — 3 విడతల్లో DBT. 23వ విడత 20-జూన్-2026న విడుదల. ఆధార్-బ్యాంకు అనుసంధానం + e-KYC తప్పనిసరి. pmkisan.gov.in లో స్టేటస్ చూడండి.', link: 'https://pmkisan.gov.in', phone: '155261', updatedOn: '2026-06-20' },
  { id: 'pmfby', title_en: 'PM Crop Insurance (PMFBY)', title_te: 'పంటల బీమా (PMFBY)', desc_en: 'Insure notified Kharif/Rabi crops: farmer pays max 2% Kharif, 1.5% Rabi, 5% commercial/horticulture. Voluntary for all including tenants/sharecroppers. Enrol at bank/PACS/CSC or pmfby.gov.in before season cut-off (Kharif ~31 July).', desc_te: 'నోటిఫై చేసిన పంటలకు బీమా: రైతు వాటా ఖరీఫ్ 2%, రబీ 1.5%, వాణిజ్య పంటలు 5%. కౌలు/పాలు రైతులతో సహా అందరికీ స్వచ్ఛందం. గడువుకు ముందు బ్యాంకు/CSC/pmfb.gov.in లో నమోదు (ఖరీఫ్ ~జూలై 31).', link: 'https://pmfby.gov.in', phone: '14447', updatedOn: '2026-07-31' },
  { id: 'soil-health', title_en: 'Soil Health Card', title_te: 'భూసార పరీక్ష కార్డు', desc_en: 'Free soil testing under RKVY Soil Health & Fertility. 12 parameters + fertilizer advice every 2-3 years. 25 crore+ cards, 8,272 labs. Contact agriculture officer / soil lab or soilhealth.dac.gov.in.', desc_te: 'RKVY కింద ఉచిత భూసార పరీక్ష. 12 అంశాలు + ఎరువుల సలహా, 2-3 ఏళ్లకోసారి. 25 కోట్ల+ కార్డులు, 8,272 ల్యాబ్‌లు. వ్యవసాయ అధికారి/ల్యాబ్‌ను కలవండి లేదా soilhealth.dac.gov.in చూడండి.', link: 'https://soilhealth.dac.gov.in', phone: '', updatedOn: '2026-02-01' },
  { id: 'micro-irrigation', title_en: 'Micro-Irrigation Subsidy (Per Drop More Crop)', title_te: 'బిందు/తుంపర సేద్యం రాయితీ', desc_en: '55% subsidy for small/marginal farmers, 45% for others on drip/sprinkler (max 5 ha, 7-yr reuse). Under RKVY since 2022-23. Apply via horticulture / APMIP office or pmksy.gov.in.', desc_te: 'డ్రిప్/స్ప్రింక్లర్‌పై చిన్న/సన్నకారు రైతులకు 55%, ఇతరులకు 45% రాయితీ (గరిష్ఠం 5 హెక్టార్లు). 2022-23 నుంచి RKVY కింద. ఉద్యాన శాఖ/APMIP ద్వారా లేదా pmksy.gov.in లో దరఖాస్తు.', link: 'https://pmksy.gov.in', phone: '', updatedOn: '2026-02-17' },
  { id: 'farm-mechanization', title_en: 'Farm Machinery Subsidy (SMAM)', title_te: 'వ్యవసాయ యంత్రాల రాయితీ', desc_en: '40% subsidy general, 50% for SC/ST/small/marginal/NE on machines; Custom Hiring Centres 40% to Rs 250L, Machinery Banks 80% to Rs 30L. Apply on agrimachinery.nic.in (DBT lottery).', desc_te: 'యంత్రాలపై సాధారణంగా 40%, SC/ST/చిన్న రైతులకు 50% రాయితీ; కస్టమ్ హైరింగ్ కేంద్రాలకు 40% (రూ.250 లక్షల వరకు). agrimachinery.nic.in లో DBT దరఖాస్తు.', link: 'https://agrimachinery.nic.in', phone: '', updatedOn: '2026-07-09' },
  { id: 'midh', title_en: 'Horticulture Support (MIDH)', title_te: 'ఉద్యాన పంటల మద్దతు (MIDH)', desc_en: 'For fruits, vegetables, spices, flowers, coconut, bamboo: planting material, protected cultivation, nurseries, post-harvest units. Centre pays 60% (90% NE/Himalayan). Apply via district horticulture office / SHM, DBT to bank.', desc_te: 'పండ్లు, కూరగాయలు, సుగంధ పంటలు, పూలు, కొబ్బరి, వెదురు కోసం: మొక్కలు, షెడ్‌నెట్/పాలీహౌస్, నర్సరీలు, నిల్వ/ప్యాక్‌హౌస్. కేంద్రం 60% (NE 90%). జిల్లా ఉద్యాన శాఖ ద్వారా దరఖాస్తు, DBT.', link: 'https://www.midh.gov.in', phone: '', updatedOn: '2026-01-27' },
  { id: 'enam', title_en: 'Sell Online (eNAM Mandi)', title_te: 'ఆన్‌లైన్‌లో అమ్మకం (eNAM మండి)', desc_en: 'Free farmer registration on the national online mandi. Transparent auction across mandis, assaying for quality price, direct UPI/RTGS payment. Register on enam.gov.in or at your APMC gate. FPOs welcome.', desc_te: 'జాతీయ ఆన్‌లైన్ మండిలో ఉచిత రైతు నమోదు. పారదర్శక వేలం, నాణ్యతకు తగిన ధర, నేరుగా UPI/RTGS చెల్లింపు. enam.gov.in లో లేదా మండి గేటు వద్ద నమోదు. FPOలకు స్వాగతం.', link: 'https://enam.gov.in', phone: '18002700224', updatedOn: '2026-01-15' },
  { id: 'pmmsy', title_en: 'Fisheries Support (PMMSY)', title_te: 'చేపల పెంపకం మద్దతు (PMMSY)', desc_en: 'For fish farmers: ponds, hatcheries, cages, boats/nets, cold chain, insurance (Rs 5L accident). Govt pays 40% general, 60% women/SC/ST. Rs 20,750 cr outlay. Apply at district fisheries office / pmmsy.dof.gov.in.', desc_te: 'చేపల రైతులకు: చెరువులు, హ్యాచరీలు, కేజ్‌లు, పడవలు/వలలు, కోల్డ్‌చైన్, బీమా (ప్రమాదానికి రూ.5 లక్షలు). ప్రభుత్వం సాధారణంగా 40%, మహిళలు/SC/STలకు 60%. జిల్లా మత్స్య శాఖలో దరఖాస్తు.', link: 'https://pmmsy.dof.gov.in', phone: '18004251660', updatedOn: '2026-03-10' },
  { id: 'nlm', title_en: 'Livestock & Poultry Support (NLM)', title_te: 'పశు/కోళ్ల పెంపకం మద్దతు (NLM)', desc_en: '50% capital subsidy to Rs 50L for poultry, sheep/goat, piggery breeding farms and fodder units (hay/silage/TMR). Individuals, SHGs, FPOs, JLGs eligible via SIDBI/bank. Apply on nlm.udyamimitra.in.', desc_te: 'కోళ్లు, మేకలు/గొర్రెలు, పందుల పెంపకం, పశుగ్రాసం యూనిట్లకు 50% మూలధన రాయితీ (రూ.50 లక్షల వరకు). వ్యక్తులు, SHG, FPO, JLG అర్హులు. nlm.udyamimitra.in లో దరఖాస్తు.', link: 'https://nlm.udyamimitra.in', phone: '', updatedOn: '2026-04-29' },
  { id: 'pm-kmy', title_en: 'Farmer Pension (PM-KMY, Rs 3,000/mo)', title_te: 'రైతు పింఛను (నెలకు రూ.3,000)', desc_en: 'Voluntary pension for small/marginal land-holding farmers age 18-40: pay Rs 55-200/mo till 60, get Rs 3,000/mo after 60 (govt matches). Enrol at CSC or pmkmy.gov.in. LIC manages fund.', desc_te: '18-40 ఏళ్ల చిన్న/సన్నకారు రైతులకు స్వచ్ఛంద పింఛను: 60 ఏళ్ల వరకు నెలకు రూ.55-200 చెల్లిస్తే, 60 తర్వాత నెలకు రూ.3,000 (ప్రభుత్వం సమాన వాటా). CSC లేదా pmkmy.gov.in లో నమోదు.', link: 'https://maandhan.in', phone: '', updatedOn: '2024-09-09' },
  { id: 'annadata-sukhibhava-ap', title_en: 'Annadata Sukhibhava (AP state)', title_te: 'అన్నదాత సుఖీభవ (ఏపీ)', desc_en: 'AP state top-up: Rs 20,000/yr/family total (Rs 14,000 state + Rs 6,000 PM-KISAN) in 3 tranches. Tenant CCRC holders get full state share. Needs Webland + e-Crop + Aadhaar DBT. Village secretariat / annadathasukhibhava.ap.gov.in.', desc_te: 'ఏపీ రాష్ట్ర అదనం: కుటుంబానికి ఏడాదికి రూ.20,000 (రాష్ట్రం రూ.14,000 + కిసాన్ రూ.6,000), 3 విడతల్లో. CCRC కౌలు రైతులకు పూర్తి వాటా. గ్రామ సచివాలయంలో నమోదు.', link: 'https://agriculture.ap.gov.in', phone: '155251', updatedOn: '2026-08-01' },
];
export const BUNDLED_LOANS: Loan[] = [
  { id: 'kcc', title_en: 'Kisan Credit Card (KCC)', title_te: 'కిసాన్ క్రెడిట్ కార్డు', desc_en: 'Crop loan limit raised to Rs 5L under MISS (2025-26). Short loans to Rs 3L at 7%, only 4% if repaid on time. Collateral-free to Rs 2L. ATM card, saturation camps. Apply at any bank with pattadar + Aadhaar; also on jansamarth.in (MH/MP/GJ live, AP via bank).', desc_te: 'MISS కింద పంట రుణ పరిమితి రూ.5 లక్షలకు పెంపు. రూ.3 లక్షల వరకు 7% వడ్డీ, సకాలంలో కడితే 4%. రూ.2 లక్షల వరకు పూచీకత్తు లేదు. పట్టాదార్ + ఆధార్‌తో ఏ బ్యాంకులోనైనా; jansamarth.in లో కూడా.', link: 'https://www.jansamarth.in', phone: '', updatedOn: '2026-03-11' },
  { id: 'allied-kcc', title_en: 'KCC for Dairy / Fishery', title_te: 'పాడి/చేపల పెంపకానికి KCC', desc_en: 'Working-capital KCC for dairy, poultry, fishery: limit raised Rs 2L to Rs 5L (2025-26), same 4% on timely repayment. 5L+ fishery cards issued. Apply at bank; fishery via jansamarth.in KCC-Fisheries.', desc_te: 'పాడి, కోళ్లు, చేపల రైతులకు పెట్టుబడి KCC: పరిమితి రూ.2 లక్షల నుంచి రూ.5 లక్షలకు పెంపు, సకాలంలో కడితే 4% వడ్డీ. బ్యాంకులో దరఖాస్తు; చేపలకు jansamarth.in KCC-Fisheries.', link: 'https://www.jansamarth.in', phone: '', updatedOn: '2026-03-11' },
  { id: 'interest-subvention', title_en: 'Interest Relief on Crop Loans (MISS)', title_te: 'పంట రుణాలపై వడ్డీ రాయితీ', desc_en: 'Short crop loans to Rs 3L at 7% via KCC; 3% extra off for on-time repayment = 4% effective. Auto-applied through bank/Kisan Rin Portal. 2025-26 disbursal Rs 18,367 cr.', desc_te: 'KCC ద్వారా రూ.3 లక్షల వరకు 7% వడ్డీ; సకాలంలో కడితే అదనంగా 3% తగ్గింపు = 4%. బ్యాంకు ద్వారానే వర్తిస్తుంది.', link: 'https://fasalrin.gov.in', phone: '', updatedOn: '2026-08-04' },
  { id: 'agri-infra', title_en: 'Agri Infrastructure Fund', title_te: 'వ్యవసాయ మౌలిక నిధి', desc_en: 'Loans for godowns, cold storage, processing, custom hiring: 3% interest relief to Rs 2 cr x 7 yrs + guarantee to Rs 2 cr. Rs 80,224 cr / 1.5L projects sanctioned. Apply via bank or jansamarth.in AIF; agriinfra.dac.gov.in for details.', desc_te: 'గోదాములు, కోల్డ్ స్టోరేజ్, ప్రాసెసింగ్ కోసం రుణాలు: రూ.2 కోట్ల వరకు 3% వడ్డీ రాయితీ x 7 ఏళ్లు. బ్యాంకు లేదా jansamarth.in AIF ద్వారా దరఖాస్తు.', link: 'https://agriinfra.dac.gov.in', phone: '', updatedOn: '2026-02-03' },
  { id: 'acabc', title_en: 'Agri Clinic / Agri Business (ACABC)', title_te: 'వ్యవసాయ క్లినిక్ / వ్యాపారం', desc_en: 'For agri graduates/diploma holders: free training + loan + back-ended subsidy for clinics, input shops, custom hiring, dairy/poultry units. NABARD channels subsidy. One Branch One Agri Clinic push. Apply on acabcmis.gov.in or jansamarth.in ACABC.', desc_te: 'వ్యవసాయ పట్టభద్రులకు: ఉచిత శిక్షణ + రుణం + వెనుకబడిన రాయితీ — క్లినిక్‌లు, ఇన్‌పుట్ షాపులు, కస్టమ్ హైరింగ్, పాడి/కోళ్ల యూనిట్లు. NABARD ద్వారా రాయితీ. acabcmis.gov.in లో దరఖాస్తు.', link: 'https://acabcmis.gov.in', phone: '', updatedOn: '2025-09-25' },
  { id: 'ekun', title_en: 'Pledge Loan on Stored Crop (eKUN)', title_te: 'నిల్వ పంటపై రుణం (eKUN)', desc_en: 'e-Kisan Upaj Nidhi: pledge your e-Negotiable Warehouse Receipt for a bank loan instead of distress selling. Digital e-KUN via NERL/CCRL on jansamarth.in. Ask your bank for warehouse-receipt finance.', desc_te: 'పంటను అమ్మక తప్పనిసరిగా అమ్మకుండా, గోదాం రసీదు (e-NWR)పై బ్యాంకు రుణం. jansamarth.in eKUN ద్వారా డిజిటల్. బ్యాంకులో అడగండి.', link: 'https://www.jansamarth.in', phone: '', updatedOn: '2026-06-01' },
];

function rowToScheme(r: any): Scheme {
  return { id: r.id, title_en: r.title_en ?? '', title_te: r.title_te ?? '', desc_en: r.desc_en ?? '', desc_te: r.desc_te ?? '', link: r.link ?? '', phone: r.phone ?? '', updatedOn: r.updatedOn ?? '' };
}

export async function getSchemes(): Promise<Scheme[]> {
  if (IS_WEB) {
    const cached = lsGet<Scheme[]>(LS_SCHEMES, []);
    return cached.length ? cached : BUNDLED_SCHEMES;
  }
  const d = getDb();
  if (!d) return BUNDLED_SCHEMES;
  const rows = await d.getAllAsync<any>('SELECT * FROM schemes_cache ORDER BY updatedOn DESC');
  return rows.length ? rows.map(rowToScheme) : BUNDLED_SCHEMES;
}

export async function saveSchemes(list: Scheme[]): Promise<void> {
  if (IS_WEB) { lsSet(LS_SCHEMES, list); return; }
  const d = getDb();
  if (!d) return;
  for (const s of list) {
    await d.runAsync(
      'INSERT OR REPLACE INTO schemes_cache (id,title_en,title_te,desc_en,desc_te,link,phone,updatedOn) VALUES (?,?,?,?,?,?,?,?)',
      s.id, s.title_en, s.title_te, s.desc_en, s.desc_te, s.link ?? '', s.phone ?? '', s.updatedOn
    );
  }
}

export async function refreshSchemesFromNetwork(fetcher?: () => Promise<Scheme[]>): Promise<{ updated: boolean; at: string; error?: string }> {
  const at = new Date().toISOString();
  try {
    let fn = fetcher;
    if (!fn) {
      try {
        const { defaultSchemesFetcher } = require('../utils/schemesSource') as typeof import('../utils/schemesSource');
        fn = defaultSchemesFetcher() ?? undefined;
      } catch { fn = undefined; }
    }
    if (!fn) return { updated: false, at }; // bundled cache only until URL configured
    const list = await fn();
    if (!list.length) return { updated: false, at };
    await saveSchemes(list);
    await setPref('schemes_refreshed_at', at);
    return { updated: true, at };
  } catch (e: any) {
    return { updated: false, at, error: e?.message ?? String(e) };
  }
}

export async function getLoans(): Promise<Loan[]> {
  if (IS_WEB) {
    const cached = lsGet<Loan[]>(LS_LOANS, []);
    return cached.length ? cached : BUNDLED_LOANS;
  }
  const d = getDb();
  if (!d) return BUNDLED_LOANS;
  const rows = await d.getAllAsync<any>('SELECT * FROM loans_cache ORDER BY updatedOn DESC');
  return rows.length ? rows.map(rowToScheme) : BUNDLED_LOANS;
}

export async function saveLoans(list: Loan[]): Promise<void> {
  if (IS_WEB) { lsSet(LS_LOANS, list); return; }
  const d = getDb();
  if (!d) return;
  for (const s of list) {
    await d.runAsync(
      'INSERT OR REPLACE INTO loans_cache (id,title_en,title_te,desc_en,desc_te,link,phone,updatedOn) VALUES (?,?,?,?,?,?,?,?)',
      s.id, s.title_en, s.title_te, s.desc_en, s.desc_te, s.link ?? '', s.phone ?? '', s.updatedOn
    );
  }
}

export async function refreshLoansFromNetwork(fetcher?: () => Promise<Loan[]>): Promise<{ updated: boolean; at: string; error?: string }> {
  const at = new Date().toISOString();
  try {
    let fn = fetcher;
    if (!fn) {
      try {
        const { defaultLoansFetcher } = require('../utils/schemesSource') as typeof import('../utils/schemesSource');
        fn = defaultLoansFetcher() ?? undefined;
      } catch { fn = undefined; }
    }
    if (!fn) return { updated: false, at };
    const list = await fn();
    if (!list.length) return { updated: false, at };
    await saveLoans(list);
    await setPref('loans_refreshed_at', at);
    return { updated: true, at };
  } catch (e: any) {
    return { updated: false, at, error: e?.message ?? String(e) };
  }
}

// ---------- P0 v2: profile + prefs ----------
function rowToProfile(r: any): Profile {
  return {
    id: 'me', phoneE164: r.phoneE164 ?? '', phoneVerified: !!r.phoneVerified,
    name: r.name ?? '', village: r.village ?? '', pincode: r.pincode ?? '',
    acres: Number(r.acres ?? 0) || 0, lang: r.lang === 'te' ? 'te' : 'en',
    lastCrop: (r.lastCrop as Profile['lastCrop']) ?? 'All',
    onboarded: !!r.onboarded, updatedAt: r.updatedAt ?? new Date().toISOString(),
  };
}

export async function getProfile(): Promise<Profile> {
  if (IS_WEB) {
    if (!webStoreOk()) return memWeb.profile ?? defaultProfile();
    return { ...defaultProfile(), ...lsGet<Partial<Profile>>(LS_PROFILE, {}) };
  }
  const d = getDb();
  if (!d) return defaultProfile();
  const row = await d.getFirstAsync<any>("SELECT * FROM profile WHERE id = 'me'");
  return row ? rowToProfile(row) : defaultProfile();
}

export async function saveProfile(p: Profile): Promise<void> {
  const full: Profile = { ...p, id: 'me', updatedAt: new Date().toISOString() };
  if (IS_WEB) {
    if (!webStoreOk()) { memWeb.profile = full; return; }
    lsSet(LS_PROFILE, full);
    return;
  }
  const d = getDb();
  if (!d) return;
  await d.runAsync(
    'INSERT OR REPLACE INTO profile (id,phoneE164,phoneVerified,name,village,pincode,acres,lang,lastCrop,onboarded,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    'me', full.phoneE164, full.phoneVerified ? 1 : 0, full.name, full.village, full.pincode ?? '', full.acres ?? 0, full.lang, full.lastCrop, full.onboarded ? 1 : 0, full.updatedAt
  );
}

export async function getPref(key: string, fallback = ''): Promise<string> {
  if (IS_WEB) {
    const all = lsGet<Record<string, string>>(LS_PREFS, {});
    return all[key] ?? fallback;
  }
  const d = getDb();
  if (!d) return fallback;
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM app_prefs WHERE key = ?', key);
  return row?.value ?? fallback;
}

export async function setPref(key: string, value: string): Promise<void> {
  if (IS_WEB) {
    const all = lsGet<Record<string, string>>(LS_PREFS, {});
    all[key] = value;
    lsSet(LS_PREFS, all);
    return;
  }
  const d = getDb();
  if (!d) return;
  await d.runAsync('INSERT OR REPLACE INTO app_prefs (key,value) VALUES (?,?)', key, value);
}
