import { UsageLog } from '../db/types';

// Build a simple CSV string for export. Beginner-friendly, no library needed.
export function logsToCSV(logs: UsageLog[], productNameOf: (id: string) => string): string {
  const header = 'date,product,crop,field,pest_purpose,quantity,note';
  const rows = logs.map((l) => {
    const esc = (v: unknown) => String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
    const cells = [
      esc(l.date),
      esc(productNameOf(l.productId)),
      esc(l.crop),
      esc(l.field),
      esc(l.purposePest),
      esc(l.quantityUsed),
      esc(l.note),
    ];
    return cells.map((c) => `"${c}"`).join(',');
  });
  return [header, ...rows].join('\n');
}
