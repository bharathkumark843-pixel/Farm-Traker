# Farm Tracker — Pesticide / Insecticide Tracker for Farmers

Simple, senior-friendly mobile app. Very large buttons, minimal typing, green + white design.
Offline-first with SQLite on the device.

## 1. Folder structure

```
farm-tracker/
  App.tsx                  — app entry, providers + navigation
  app.json                 — Expo config (camera permission, package name)
  package.json
  src/
    theme.ts               — colors, font sizes, touch sizes
    i18n/en.ts, te.ts, index.ts — English-first bilingual strings (EN big + TE small, swap when lang==='te')
    db/types.ts            — Product + UsageLog + Scheme/Loan + Profile data model
    db/database.ts         — SQLite offline storage (web: localStorage) + schemes/loans cache + profile
    utils/schemesSource.ts — online JSON fetcher for Schemes/Loans (set DEFAULT_*_URL, else bundled fallback)
    store/AppContext.tsx   — global products + logs state
    utils/alerts.ts        — low-stock / expiring-soon / expired rules
    utils/csv.ts           — CSV export for reports
    navigation/RootNavigator.tsx — 4 tabs: Home (HomeMain+FieldDetail stack) / Schemes / Loans / Account + Onboarding gate
    components/BigButton.tsx, SummaryCard.tsx, ProductCard.tsx
    screens/
      HomeMainScreen.tsx   — crop grid + bilingual search (offline entry)
      FieldDetailScreen.tsx — crop-filtered summary (bilingual title/cards)
      ScanScreen.tsx       — QR/barcode scanner (expo-camera + web BarcodeDetector + jsQR fallback, debug dev-only)
      WebQrScanner.tsx     — web live raw-frame scanner
      AddEditProductScreen.tsx — manual form + product photo (camera)
      ProductDetailsScreen.tsx — details + usage history
      LogUsageScreen.tsx   — bilingual crop chips, log usage, subtracts stock
      InventoryScreen.tsx  — searchable list (name/barcode/category/manufacturer)
      ReportsScreen.tsx    — bilingual crop chips + per-unit totals + filters + CSV + PDF export
      SchemesScreen.tsx / LoansScreen.tsx — bundled real data + online JSON refresh + offline cache
      LoginScreen.tsx        — mobile + OTP login, language + area PIN code
      AccountScreen.tsx    — editable profile + acres + PIN code + logout
```

## 2. Data model

```ts
Product {
  id, name, category (Pesticide|Insecticide|Herbicide|Fungicide|Other),
  barcode, photoUri, unit,
  quantityTotal, quantityRemaining, lowStockThreshold,
  pricePaid, purchaseDate, expiryDate,
  manufacturer, labelInfo,  // official label text only — app gives NO dosage advice
  createdAt, updatedAt
}

UsageLog {
  id, productId, date, quantityUsed,
  crop, field, purposePest, note, createdAt
}
```

Alerts:
- Low stock when `remaining <= lowStockThreshold`
- Expiring soon when `0 <= daysUntilExpiry <= 30`
- Expired when `daysUntilExpiry < 0` (red banner)

## 3. Run the app

```bash
cd farm-tracker
npm install
npx expo start
# then press `a` for Android or `i` for iPhone, or scan QR with Expo Go
npm run typecheck   # tsc --noEmit
npm run export:web  # web build into dist/
```

> Camera scanning needs a real device or dev build (`expo run:android/ios`).
> On web, products persist in localStorage (survive reloads); on device they use SQLite.

4 bottom tabs: Home OFFLINE / Schemes ONLINE+cache / Loans ONLINE+cache / Account OFFLINE.
Schemes/Loans ship with bundled data and refresh from a hosted JSON array when
`DEFAULT_SCHEMES_URL` / `DEFAULT_LOANS_URL` are set in `src/utils/schemesSource.ts`.

## 3b. Cloud backup (Supabase, optional)

Local SQLite/localStorage stays the source of truth — the app works fully offline
with no keys. When `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`
are set (see `.env.example`), the app mirrors products, usage logs, and the
profile to Supabase: background sync on launch + a big SYNC NOW button in
Account (bilingual). Last-write-wins by timestamp; deletes sync via tombstones.
One farmer = one phone in v1 (rows namespaced by verified phone number).

Setup: create a free project at supabase.com → run `supabase/schema.sql` once in
the SQL Editor → copy `.env.example` to `.env` with your URL + anon key
(EAS builds: `eas env:create` instead) → rebuild. RLS policies ship permissive
for the pilot — tighten before wide release (see comment in `schema.sql`).

## 4. Notes / next steps

- No dosage, mixing, or safety recommendations — only label text + farmer's own records.
- Cloud backup: not built yet (e.g. Firebase/Supabase sync of the two tables).
- Deleting a usage entry restores stock (capped at the starting quantity).
- Bilingual: EN big + TE small, swaps when language is తెలుగు (`src/i18n/`).
