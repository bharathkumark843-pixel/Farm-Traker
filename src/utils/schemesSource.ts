import type { Scheme, Loan } from '../db/types';

// Online JSON source for Schemes/Loans.
// Upload src/data/schemes.json and src/data/loans.json to static HTTPS hosting
// with CORS `*` (e.g. GitHub Gist raw / gh-pages / Cloudflare R2), then paste
// the two raw URLs below. Leave empty to use bundled fallback cache only.
// Farmer-only scope: MUDRA/PMEGP/SVANidhi intentionally excluded (non-farm);
// JanSamarth is linked per-card as the apply portal, not a card itself.
export const DEFAULT_SCHEMES_URL = '';
export const DEFAULT_LOANS_URL = '';

function isSchemeLike(r: any): boolean {
  return r && typeof r.id === 'string' && typeof r.title_en === 'string';
}

export function validateSchemeList(data: unknown): Scheme[] {
  if (!Array.isArray(data)) throw new Error('Expected a JSON array of schemes.');
  const list = (data as any[]).filter(isSchemeLike).map((r) => ({
    id: String(r.id),
    title_en: String(r.title_en ?? ''),
    title_te: String(r.title_te ?? ''),
    desc_en: String(r.desc_en ?? ''),
    desc_te: String(r.desc_te ?? ''),
    link: r.link ? String(r.link) : '',
    phone: r.phone ? String(r.phone) : '',
    updatedOn: r.updatedOn ? String(r.updatedOn) : new Date().toISOString().slice(0, 10),
  }));
  if (list.length === 0) throw new Error('No valid schemes in response.');
  return list;
}

export async function fetchJsonList(url: string, timeoutMs = 15000): Promise<Scheme[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return validateSchemeList(data);
  } finally {
    clearTimeout(t);
  }
}

export function defaultSchemesFetcher(): (() => Promise<Scheme[]>) | null {
  if (!DEFAULT_SCHEMES_URL) return null;
  return () => fetchJsonList(DEFAULT_SCHEMES_URL);
}

export function defaultLoansFetcher(): (() => Promise<Loan[]>) | null {
  if (!DEFAULT_LOANS_URL) return null;
  return () => fetchJsonList(DEFAULT_LOANS_URL);
}
