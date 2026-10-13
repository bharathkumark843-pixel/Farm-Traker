import type { Product } from '../db/types';

// Bundled chemical catalog: barcode -> known product details.
// A scanned QR/barcode carries ONLY a code string — never the product name
// or photo — so this table (plus the farmer's own saved products) is what
// lets a scan auto-fill the product form.
//
// Barcodes below are EXAMPLES shipped for demo (the first matches the demo
// product's barcode). Replace/extend with real EANs from bottles sold locally:
// ask the dealer for the bottle's barcode list, or just save products once —
// every saved product is automatically recognised on its next scan.
export interface CatalogEntry {
  barcode: string;
  name: string;
  category: Product['category'];
  manufacturer: string;
  unit: string;
  labelInfo?: string;
}

const CATALOG: CatalogEntry[] = [
  { barcode: '8901234567890', name: 'Sample Insecticide', category: 'Insecticide', manufacturer: 'Demo Agro', unit: 'Litre', labelInfo: 'Official label text from bottle.' },
  { barcode: '8901234567891', name: 'Coragen (Chlorantraniliprole 18.5% SC)', category: 'Insecticide', manufacturer: 'FMC', unit: 'ml', labelInfo: 'Copy dose details from bottle label.' },
  { barcode: '8901234567892', name: 'Confidor (Imidacloprid 17.8% SL)', category: 'Insecticide', manufacturer: 'Bayer', unit: 'ml', labelInfo: 'Copy dose details from bottle label.' },
  { barcode: '8901234567893', name: 'Saaf (Carbendazim + Mancozeb)', category: 'Fungicide', manufacturer: 'UPL', unit: 'gm', labelInfo: 'Copy dose details from bottle label.' },
  { barcode: '8901234567894', name: '2,4-D Amine Salt (Herbicide)', category: 'Herbicide', manufacturer: 'Generic', unit: 'Litre', labelInfo: 'Copy dose details from bottle label.' },
  { barcode: '8901234567895', name: 'Monocrotophos 36% SL', category: 'Pesticide', manufacturer: 'Generic', unit: 'ml', labelInfo: 'Copy dose details from bottle label.' },
  { barcode: '8901234567896', name: 'Neem Oil (Azadirachtin)', category: 'Pesticide', manufacturer: 'Generic', unit: 'ml', labelInfo: 'Copy dose details from bottle label.' },
];

export function lookupCatalog(barcode: string): CatalogEntry | null {
  const t = (barcode || '').trim();
  if (!t) return null;
  return CATALOG.find((c) => c.barcode === t) ?? null;
}
