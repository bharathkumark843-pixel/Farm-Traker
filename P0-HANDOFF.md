# Farm Tracker v2 P0 — Handoff (updated 2026-10-05, P1+P2+P3 done)

## P1 completion 2026-10-05 (tsc green)
- Schemes/Loans: real bundled data (6 schemes + 4 loans EN+TE) + online JSON refresh via `src/utils/schemesSource.ts` (`DEFAULT_SCHEMES_URL/DEFAULT_LOANS_URL` empty = bundled cache; set URL to enable online refresh). Focus reload + reactive lang, offline error surfaced. `tsc --noEmit` green.
- Bilingual: FieldDetail title/cards swap via `pick()` + `syncLang()`, LogUsage group headers dual, Reports chips `EN + TE`, Inventory search name/barcode/category/manufacturer.
- Onboarding: `ScrollView + KeyboardAvoidingView`, stacked language buttons (no row-gap crash on web).
- Cleanup: removed orphan `Home` route (delete → `HomeMain`), added `@expo/vector-icons@14.0.4` to package.json, README structure updated.
- Still needed from user: hosted Schemes/Loans JSON URL (shape: `{id,title_en,title_te,desc_en,desc_te,link?,phone?,updatedOn}` array); smoke test on device/web.

## P2 completion 2026-10-05 (tsc green, web export ok)
- Release: `app.json` icon/splash/scheme/versionCode + generated `assets/` PNGs, `expo-print@13.0.1` PDF export in Reports, `typecheck/export:web` scripts.
- Forms: category/unit chip pickers in AddEdit, delete usage-log entries (stock restored, capped at starting quantity), Reports date validation, Scan debug/version dev-only, web log-quota trim retry.

## P3 completion 2026-10-05 (this pass)
- Account fully bilingual + `syncLang()` on save + stacked language buttons (web-safe).
- Scan `console.log` gated to `__DEV__`; LogUsage date validated (YYYY-MM-DD).
- Deleted deprecated `HomeScreen.tsx`; removed unused `dual()` helper (`useLang` kept).
- Reports totals broken down per unit (Litre/Kg never mixed); log-delete restores stock.
- `app.json` iOS `buildNumber` + `supportsTablet`; new `eas.json` (development/preview/production).
- Docs: README + this handoff rewritten; stale `expo-out.log` removed.
- Deliberately deferred: Expo SDK 52→54 upgrade + real store logo + cloud backup + device smoke test.

## P4 login 2026-10-05 (mobile + OTP, language + PIN code)
- `LoginScreen`: step 1 phone (10-digit) + 6-digit area PIN + language → SEND OTP; step 2 code entry with 30s resend cooldown, change-number, 5-min expiry, 5-attempt lockout.
- `utils/otp.ts` demo provider (code shown on-screen; no SMS gateway offline) with a marked Firebase seam (`ACTIVE='firebase'` + integration notes). Real SMS needs a Firebase project + keys.
- Profile/DB: new `pincode` column (CREATE TABLE + ALTER migration); `phoneVerified=true` only after OTP.
- Account: editable PIN code, changing the number forces OTP re-login (never silent), LOG OUT button via `store/authBus.ts` gate re-check. Old `OnboardingScreen` removed.

## Decisions locked (unchanged)
- 4 bottom tabs: Home OFFLINE / Schemes ONLINE+cache / Loans ONLINE+cache / Account OFFLINE. Tab icons are Ionicons (not emoji).
- Field list = fixed crop chips (Paddy, Chilly, Cotton, Beans, Maize, fruit/forest/medicinal/flower trees, Other + free text when Other). `field` stays free-text plot name.
- Telugu english-first: EN big + TE small, default EN, toggle on onboarding + Account, persisted in profile.
- Home language swap: selected language goes big, other goes small — cards + banner + All button; search matches both EN + TE.
- Fully OFFLINE, on-device, no backend, no OTP (removed 2026-09-30 per user). Phone number is a plain on-device identifier only. `phoneVerified` kept in Profile/DB as legacy always-false for compat.
- Gradle: NEVER hand-edit build.gradle.kts (Expo managed, android/ generated).

## Firebase / OTP
- REMOVED 2026-09-30 per user request. No firebase dependency, no otp.ts/firebase.ts, no .env keys, no google-services.json, no recaptcha. Prior web-OTP work described in older handoffs was never on disk (only .gitignore survived) — nothing to revert in git (not a repo).
- If OTP is ever wanted back, it must be rebuilt from scratch (web-first SDK proof, then native RNFB + SHA-1).

## Code state (tsc green 2026-10-05, web export ok)
- No Firebase/OTP on disk (removed 2026-09-30). No `.env` keys, no `google-services.json`.
- i18n: `en.ts`/`te.ts` + `t()`/`syncLang()`/`getLang()`/`useLang()` in `i18n/index.ts`.
- HomeMainScreen: language-aware cards/banner/All-button + bilingual search.
- AccountScreen: editable mobile (+91, 10-digit validated) + acres decimal + bilingual labels + stacked language buttons.
- Profile: `acres: number` (default 0). DB: ALTER TABLE migration for old native installs.
- OnboardingScreen: phone (offline ID only) + language, scrollable + keyboard-aware.
- ReportsScreen: per-unit totals + date validation + CSV + PDF (`expo-print`).
- Expo web: `npx expo start --web -c` via run-web.cmd, http://localhost:8081.

## Pending (only external items)
1. Frontend smoke on device/web: search chi/Chilly/మిరప, Scan, Reports CSV+PDF, lang toggle EN↔TE, airplane-mode Home/Account.
2. Hosted Schemes/Loans JSON URL, then set `DEFAULT_*_URL` in `src/utils/schemesSource.ts`.
3. Later / risky (separate task): Expo SDK 52→54 upgrade, real store logo, cloud backup, EAS store submission.
