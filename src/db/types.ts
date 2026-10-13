// P0 v2 contracts: fixed field/crop list, schemes/loans cache, offline profile (no OTP — phone is an on-device ID only).
export type Category = 'Pesticide' | 'Insecticide' | 'Herbicide' | 'Fungicide' | 'Other';

export type FieldCrop =
  | 'Paddy' | 'Chilly' | 'Cotton' | 'Beans' | 'Maize'
  | 'Neem' | 'Banyan' | 'Peepal' | 'Tamarind' | 'Palmyra'
  | 'Mango' | 'Guava' | 'Jamun' | 'CustardApple' | 'Coconut' | 'Jackfruit' | 'Papaya'
  | 'Teak' | 'RedSanders' | 'Rosewood' | 'Axlewood' | 'Eucalyptus' | 'Subabul'
  | 'Moringa' | 'Tulsi' | 'AloeVera'
  | 'Jasmine' | 'Hibiscus' | 'Marigold'
  | 'Other';

export const FIELD_CROPS: FieldCrop[] = [
  'Paddy', 'Chilly', 'Cotton', 'Beans', 'Maize',
  'Mango', 'Guava', 'Jamun', 'CustardApple', 'Coconut', 'Jackfruit', 'Papaya',
  'Neem', 'Banyan', 'Peepal', 'Tamarind', 'Palmyra',
  'Teak', 'RedSanders', 'Rosewood', 'Axlewood', 'Eucalyptus', 'Subabul',
  'Moringa', 'Tulsi', 'AloeVera',
  'Jasmine', 'Hibiscus', 'Marigold',
  'Other',
];

export type PlantKind = 'crop' | 'fruit' | 'forest' | 'medicinal' | 'flower' | 'other';

export const PLANT_KIND: Record<FieldCrop, PlantKind> = {
  Paddy: 'crop', Chilly: 'crop', Cotton: 'crop', Beans: 'crop', Maize: 'crop',
  Mango: 'fruit', Guava: 'fruit', Jamun: 'fruit', CustardApple: 'fruit', Coconut: 'fruit', Jackfruit: 'fruit', Papaya: 'fruit',
  Neem: 'forest', Banyan: 'forest', Peepal: 'forest', Tamarind: 'forest', Palmyra: 'forest',
  Teak: 'forest', RedSanders: 'forest', Rosewood: 'forest', Axlewood: 'forest', Eucalyptus: 'forest', Subabul: 'forest',
  Moringa: 'medicinal', Tulsi: 'medicinal', AloeVera: 'medicinal',
  Jasmine: 'flower', Hibiscus: 'flower', Marigold: 'flower',
  Other: 'other',
};

export const PLANT_GROUPS: { kind: Exclude<PlantKind, 'other'>; title_en: string; title_te: string }[] = [
  { kind: 'crop', title_en: 'Crops', title_te: 'పంటలు' },
  { kind: 'fruit', title_en: 'Fruit Trees', title_te: 'పండ్ల చెట్లు' },
  { kind: 'forest', title_en: 'Forest & Timber Trees', title_te: 'అటవీ చెట్లు' },
  { kind: 'medicinal', title_en: 'Medicinal Plants', title_te: 'ఔషధ మొక్కలు' },
  { kind: 'flower', title_en: 'Flowers', title_te: 'పూలు' },
];

// Common farmer-spoken aliases (English transliteration) -> canonical id.
const CROP_ALIASES: Record<string, FieldCrop> = {
  vepa: 'Neem', neem: 'Neem',
  marri: 'Banyan', banyan: 'Banyan',
  ravi: 'Peepal', peepal: 'Peepal', pipal: 'Peepal',
  chinta: 'Tamarind', tamarind: 'Tamarind',
  tati: 'Palmyra', palmyra: 'Palmyra', tatikallu: 'Palmyra',
  mamidi: 'Mango', mango: 'Mango',
  jama: 'Guava', guava: 'Guava',
  neredu: 'Jamun', jamun: 'Jamun',
  seethaphalam: 'CustardApple', custardapple: 'CustardApple', 'custard apple': 'CustardApple',
  kobbari: 'Coconut', coconut: 'Coconut',
  panasa: 'Jackfruit', jackfruit: 'Jackfruit',
  boppayi: 'Papaya', papaya: 'Papaya',
  teku: 'Teak', teak: 'Teak',
  'erra chandanam': 'RedSanders', errachandanam: 'RedSanders', redsanders: 'RedSanders', 'red sanders': 'RedSanders',
  jittegi: 'Rosewood', rosewood: 'Rosewood',
  velama: 'Axlewood', axlewood: 'Axlewood',
  nilgiri: 'Eucalyptus', eucalyptus: 'Eucalyptus',
  subabul: 'Subabul',
  malle: 'Jasmine', jasmine: 'Jasmine',
  mandara: 'Hibiscus', hibiscus: 'Hibiscus',
  mulaga: 'Moringa', munaga: 'Moringa', moringa: 'Moringa',
  tulsi: 'Tulsi', tulasi: 'Tulsi',
  kalabanda: 'AloeVera', aloevera: 'AloeVera', 'aloe vera': 'AloeVera',
  banti: 'Marigold', marigold: 'Marigold',
  paddy: 'Paddy', vari: 'Paddy',
  chilly: 'Chilly', mirap: 'Chilly',
  cotton: 'Cotton', patti: 'Cotton',
  beans: 'Beans',
  maize: 'Maize', mokkajonna: 'Maize',
};

export function normalizeCrop(v: string): FieldCrop {
  const t = (v || '').trim().toLowerCase();
  if (!t) return 'Other';
  const direct = FIELD_CROPS.find((c) => c.toLowerCase() === t);
  if (direct) return direct;
  const alias = CROP_ALIASES[t];
  if (alias) return alias;
  // Telugu script match
  const teMatch = FIELD_CROPS.find((c) => cropLabel(c, 'te') === (v || '').trim());
  if (teMatch) return teMatch;
  return 'Other';
}

export function cropLabel(c: FieldCrop, lang: 'en' | 'te' = 'en'): string {
  if (lang === 'te') {
    const te: Record<FieldCrop, string> = {
      Paddy: 'వరి', Chilly: 'మిరప', Cotton: 'పత్తి', Beans: 'బీన్స్', Maize: 'మొక్కజొన్న',
      Neem: 'వేప', Banyan: 'మర్రి', Peepal: 'రావి', Tamarind: 'చింత', Palmyra: 'తాటి',
      Mango: 'మామిడి', Guava: 'జామ', Jamun: 'నేరేడు', CustardApple: 'సీతాఫలం', Coconut: 'కొబ్బరి', Jackfruit: 'పనస', Papaya: 'బొప్పాయి',
      Teak: 'టేకు', RedSanders: 'ఎర్రచందనం', Rosewood: 'జిట్టేగి', Axlewood: 'వేలమ', Eucalyptus: 'నీలగిరి', Subabul: 'సుబాబుల్',
      Moringa: 'మునగ', Tulsi: 'తులసి', AloeVera: 'కలబంద',
      Jasmine: 'మల్లె', Hibiscus: 'మందార', Marigold: 'బంతి',
      Other: 'ఇతర',
    };
    return te[c] ?? c;
  }
  return c;
}

export interface Scheme {
  id: string;
  title_en: string; title_te: string;
  desc_en: string; desc_te: string;
  link?: string; phone?: string;
  updatedOn: string; // YYYY-MM-DD
}

export interface Loan extends Scheme {}

export type Lang = 'en' | 'te';

export interface Profile {
  id: string; // always 'me' (fully offline, no backend)
  phoneE164: string; // e.g. +919999999999, '' until logged in
  phoneVerified: boolean; // true after OTP verify (demo provider) or real SMS provider
  name: string; village: string;
  pincode: string; // 6-digit location PIN code, '' until entered
  acres: number; // total land in acres, editable in Account
  lang: Lang;
  lastCrop: FieldCrop | 'All';
  onboarded: boolean;
  updatedAt: string;
}

export function defaultProfile(): Profile {
  return {
    id: 'me', phoneE164: '', phoneVerified: false,
    name: '', village: '', pincode: '', acres: 0, lang: 'en',
    lastCrop: 'All', onboarded: false,
    updatedAt: new Date().toISOString(),
  };
}

export function isValidPincode(pin: string): boolean {
  return /^[1-9]\d{5}$/.test((pin || '').trim());
}

export function toE164India(digits: string): string | null {
  const d = (digits || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return /^\d{10}$/.test(d) ? `+91${d}` : null;
}

export interface Product {
  id: string; // uuid
  name: string;
  category: Category;
  barcode: string; // QR or barcode value, may be empty
  photoUri: string; // local file uri, may be empty
  unit: string; // e.g. "Litre", "Kg", "Bottle"
  quantityTotal: number; // starting stock
  quantityRemaining: number; // current stock
  lowStockThreshold: number; // warn when remaining <= this
  pricePaid: number; // for spending reports
  purchaseDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  manufacturer: string;
  labelInfo: string; // official label text only (no dosage advice from app)
  createdAt: string; // ISO string
  updatedAt: string;
}

export interface UsageLog {
  id: string;
  productId: string;
  date: string; // YYYY-MM-DD
  quantityUsed: number;
  crop: string;
  field: string;
  purposePest: string;
  note: string;
  createdAt: string;
}

export function newId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
