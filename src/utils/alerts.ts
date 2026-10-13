import { Product, UsageLog } from '../db/types';

// Alert rules (from requirements):
// - Low stock when remaining <= lowStockThreshold
// - Expiring soon = within 30 days (and not yet expired)
// - Expired = expiry date < today

export function daysUntilExpiry(expiryDate: string, now = new Date()): number {
  if (!expiryDate) return 9999;
  const exp = new Date(expiryDate + 'T23:59:59');
  const diff = exp.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isExpired(p: Product): boolean {
  return daysUntilExpiry(p.expiryDate) < 0;
}

export function isExpiringSoon(p: Product): boolean {
  const d = daysUntilExpiry(p.expiryDate);
  return d >= 0 && d <= 30;
}

export function isLowStock(p: Product): boolean {
  return p.quantityRemaining <= p.lowStockThreshold;
}

export function productStatus(p: Product): ('expired' | 'expiring' | 'low')[] {
  const out: ('expired' | 'expiring' | 'low')[] = [];
  if (isExpired(p)) out.push('expired');
  else if (isExpiringSoon(p)) out.push('expiring');
  if (isLowStock(p)) out.push('low');
  return out;
}

export function totalSpent(products: Product[]): number {
  return products.reduce((s, p) => s + (Number(p.pricePaid) || 0), 0);
}

export function totalUsed(logs: UsageLog[]): number {
  return logs.reduce((s, l) => s + (Number(l.quantityUsed) || 0), 0);
}
