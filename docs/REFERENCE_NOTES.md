# REFERENCE_NOTES.md — Paddy Project V2 (Behavioral Reference)

> **Purpose.** This document records the observable behavior, features, structure,
> and key implementation details of the **existing Paddy Project** (the working
> production/reference application) so that V2 can be rebuilt to **preserve**
> those features and behaviors. It is **documentation only** — no source code is
> copied here, and nothing here grants permission to modify the reference project.
>
> **Source of truth.** The reference application lives in the sibling repository
> `~/paddyprice` (git `origin/main`, reference commit `4aa3716`
> "Add scroll-aware top bar animation"). Where this document and that repository
> disagree, **the reference repository wins** — this document is a snapshot.
>
> **Precedence.** For authoritative business rules and calculations see
> `docs/DOMAIN_RULES.md`. For V2 feature requirements see `docs/PROJECT_SPEC.md`.
> This file answers "what does the current app actually do?"

---

## 1. Product identity

| Attribute | Value |
| --- | --- |
| Product / brand names | "Paddy", "PadDy", "PSO — Paddy Stock Office", "Paddy Price App" |
| `package.json` name | `paddy-price-app` |
| Electron-builder `productName` / `appId` | `Paddy` / `mm.paddyprice.app` |
| Capacitor `appId` / `appName` | `com.paddyprice.app` / `PadDy` |
| Description | "Offline-first paddy/rice purchasing app" |
| Version | `1.0.0` |

### 1.1 Business context

- The app records **paddy (unhusked rice) bag weights** bought from farmers and
  calculates totals in **bags / pounds / tins / MMK amount** (Myanmar currency).
- It produces **PDF vouchers**, optional **Bluetooth thermal receipts**, and lets
  the office manage **farmers (customers)**, **paddy (rice) types**, **daily rice
  prices**, and **per-customer moisture configurations**.
- The app is **fully offline**: SQLite local database, no cloud, no internet
  required at runtime. Internet is only needed for `npm install` and CI.
- Target devices: **Arch Linux desktop** (Electron AppImage / browser) and
  **Android tablet/phone** (Capacitor) — one shared React codebase.
- A web demo is also published to GitHub Pages via CI.

### 1.2 Platform summary

| Platform | How it runs | Notes |
| --- | --- | --- |
| Android | Capacitor WebView (`androidScheme: https`, offline, `allowMixedContent: false`) | Native Java plugins: biometric, Bluetooth printer, device activation |
| Linux desktop | Vite build + Electron (`electron/main.cjs`); AppImage via electron-builder | Secure webPreferences; download interception to `~/PSO/...`, `~/Downloads` |
| Web / browser | Vite build (HashRouter) | Dev server and GitHub Pages demo |
| Local persistence | Desktop/browser: IndexedDB; Android: app-data file via Capacitor Filesystem | The database itself is always real SQLite (sql.js WASM) |
---

## 2. Tech stack (current project)

| Layer | Technology | Version(s) observed |
| --- | --- | --- |
| UI framework | React + ReactDOM + JSX | React 18.3.x |
| Language | TypeScript (strict `tsc --noEmit`) | TS ~5.5 |
| Build tool | Vite + `@vitejs/plugin-react` | Vite 5.4 |
| Styling | Tailwind CSS + PostCSS + Autoprefixer | Tailwind 3.4 |
| Routing | react-router-dom (**HashRouter**) | 6.26 |
| State | Zustand (4 stores) | 4.5 |
| Database | sql.js (SQLite → WebAssembly), `PRAGMA foreign_keys = ON` | 1.11 |
| Native container | Capacitor core + Capacitor Filesystem (Android 6) | 6.x |
| PDF | jsPDF + html2canvas (HTML → raster → PDF) | jsPDF 2.5, html2canvas 1.4 |
| Spreadsheet / CSV | SheetJS (`xlsx`) | 0.18 |
| Desktop shell | Electron + electron-builder (AppImage) | Electron 43, builder 26 |
| Testing | Vitest + jsdom (6 test files, **93 tests passing** at reference commit) | Vitest 2 |
| Lint | ESLint 8 + `typescript-eslint` + `eslint-plugin-react-hooks` | 8.57 |
| VCS / CI | Git; GitHub Actions `deploy.yml` (Pages demo) | — |

### 2.1 npm scripts (observed)

`dev`, `build` (`tsc --noEmit && vite build`), `preview`, `test` (Vitest once),
`test:watch`, `lint`, `typecheck`, `desktop` (build + `electron .`),
`desktop:appimage`, `desktop:dir`, `linux:build` (AppImage), and Capacitor
scripts `cap:*` / `android:*` (add/sync/open Android, build debug APK).

---

## 3. Current project structure (reference layout)

```
paddyprice/
├── src/
│   ├── main.tsx                 # entry: pre-render theme/font-size, ErrorBoundary, I18nProvider
│   ├── App.tsx                  # gate order + HashRouter + routes
│   ├── index.css                # Tailwind + semantic CSS variables + font-scale var
│   ├── i18n.tsx                 # Myanmar/English bilingual provider (localStorage)
│   ├── components/              # Layout, LockScreen, DeviceGate, ConfirmDialog,
│   │                            #   ErrorBoundary, FarmerSearchInput, PatternPad,
│   │                            #   PrinterSettings, SecuritySettings, DeviceAuthSettings
│   │   └── settings/            # Android-style SettingsRow/Section/Select/Toggle/Dialog/Icons/ThemeDialog
│   ├── pages/                   # Dashboard, Farmers, RiceTypes, RicePrices,
│   │                            #   NewPurchase, Purchase, History, Moisture,
│   │                            #   ProfitLoss, Settings (master–detail two-pane)
│   ├── database/                # sqlite.ts (wrapper), migrations.ts, dao.ts,
│   │                            #   persistence.ts (IndexedDB + Capacitor FS adapters),
│   │                            #   index.ts (auto-init), db.test.ts
│   ├── services/                # pdf.ts, export.ts (CSV/XLSX), backup.ts, storage.ts,
│   │                            #   SecurityService.ts, BiometricService.ts,
│   │                            #   DeviceAuthService.ts, printer/ (service + adapters)
│   ├── store/                   # Zustand: useAppStore, usePurchaseStore,
│   │                            #   useSecurityStore, useDeviceAuthStore
│   ├── theme/                   # themes.ts (semantic CSS-var themes), fontSize.ts
│   ├── utils/                   # calc.ts, moisture.ts, price.ts, format.ts, security.ts (+ tests)
│   ├── types/                   # index.ts (all shared interfaces)
│   └── vite-env.d.ts
├── electron/main.cjs            # desktop shell (download interception, secure prefs)
├── android/                     # Capacitor Android project + native Java plugins:
│   │                            #   MainActivity, BiometricPlugin, BiometricSelfTest,
│   │                            #   BluetoothPrinterPlugin, DeviceAuthPlugin
├── paddy-installer/             # Linux installer shell script (multi-platform activation)
├── .github/workflows/deploy.yml # GitHub Pages demo build/deploy
├── capacitor.config.ts          # appId/appName/webDir/androidScheme
├── vite.config.ts               # base path env, '@' alias, vitest config
├── tailwind.config.js           # semantic color tokens → CSS variables
├── build/icon.png               # app icon for AppImage
└── release/                     # electron-builder output (AppImage + yml)
```

### 3.1 Routing (HashRouter) — all routes nested inside `Layout`

| Path | Page |
| --- | --- |
| `/` (index) | DashboardPage |
| `/purchase/new` | NewPurchasePage |
| `/purchase/:id` | PurchasePage |
| `/history` | HistoryPage |
| `/history/:farmerId` | HistoryPage (farmer-filtered; picker synced with route) |
| `/moisture` | MoisturePage |
| `/profit-loss` | ProfitLossPage |
| `/farmers` | FarmersPage |
| `/rice-types` | RiceTypesPage |
| `/rice-prices` | RicePricesPage |
| `/settings` | SettingsPage |
| `*` (unknown) | DashboardPage |

Gate order in `App.tsx`: **Device Authorization → App Lock → Paddy app**. While
the device gate or lock screen is up, **no routes/layout/data render**.
---

## 4. Database & storage

### 4.1 Engine and lifecycle

- Real SQLite via **sql.js (WebAssembly)**. No native SQLite plugin.
- `src/database/index.ts` exposes `initDatabase()` (idempotent, memoized): opens
  the DB then runs migrations. Called on app start; DB errors show a retry screen.
- Every write schedules a **debounced (150 ms) persist** of the whole DB byte
  image; `flushSave()` forces an immediate persist (before finalize/backup);
  `replaceDatabase(bytes)` (used by restore) validates the `SQLite format 3`
  header before swapping.
- `PRAGMA foreign_keys = ON` on every connection. Writes use `BEGIN/COMMIT` via a
  small `transaction()` helper (rolls back on error).
- Migrations run automatically on first start (creates tables + default settings)
  and each migration records its version in `schema_migrations`.

### 4.2 Schema (tables + key columns + constraints)

| Table | Columns / constraints (abridged) |
| --- | --- |
| `settings` | `key` TEXT PK, `value` TEXT (key-value store) |
| `farmers` | `id`, `name`, `address`, `phone`, `created_at`, `updated_at`; index on `name` |
| `rice_types` | `id`, `name` UNIQUE, `description`, `active` (1/0), `created_at` |
| `rice_prices` | `id`, `date` (YYYY-MM-DD), `rice_type_id` FK, `price_100_tin`, `price_per_tin`, `created_at`, `updated_at`; **UNIQUE(date, rice_type_id)**; index `(date, rice_type_id)` |
| `purchases` | `id`, `purchase_no` UNIQUE (`PSO-YYYYMM-NNNN`), `farmer_id` FK, `date`, `rice_type_id` FK, `price_100_tin`, `price_per_tin` (snapshot), `total_bags`, `total_pounds`, `total_tins`, `total_amount`, `finalized` (0/1), `pdf_path`, timestamps; migration v2 adds `moisture_label`, `moisture_deduction`, `gross_pound`, `moisture_loss`, `net_pound`; indexes `(farmer_id, date)` and `(date)` |
| `bags` | `id`, `purchase_id` FK **ON DELETE CASCADE**, `seq`, `weight_lb`, `recorded_at` (UTC ISO); UNIQUE(purchase_id, seq); migration v2 adds per-row `moisture_label` |
| `moisture_configs` (v2) | `id`, `farmer_id` FK, `rice_type_id` FK, `status` ('default'\|'active'), `label` (17/18/19/20), timestamps; **UNIQUE(farmer_id, rice_type_id)** |
| `schema_migrations` | `version` PK, `name`, `applied_at` |

### 4.3 Default settings (inserted on first run)

`company_name='Paddy'`, `company_address=''`, `company_phone=''`,
`company_logo=''`, `company_footer_text=''`, `tin_formula='50'`,
`theme='tokyo-night'`, `pdf_dir='PSO/pdf'`, `font_size='normal'`.

Other settings keys written at runtime (same key-value table):

- Printer: `printer_type`, `printer_paper_width`, `printer_copies`,
  `printer_device_name`, `printer_device_address`
- Security: `security.enabled`, `security.pattern` (verifier),
  `security.pin` (verifier), `security.biometric` (legacy flag),
  `security.biometric.fingerprint`, `security.timeout`
- Device auth: `device.fp`, `device.cert`

### 4.4 Persistence per platform

| Platform | Where the SQLite bytes live |
| --- | --- |
| Desktop / browser | **IndexedDB** (`paddyprice` db, `files` store, key `paddyprice.sqlite`) |
| Android | **App data directory** `sqlite/paddyprice.sqlite` via `@capacitor/filesystem` (base64 chunked writes) |

- `localStorage` is used **only** for non-application preferences and pre-render
  mirrors: language (`paddyprice.lang`), theme, font-size (`paddyprice.font_size`).
  It is never used for application data.
- Files produced by exports/PDFs/backups (see §8–10) go to a platform file
  layer (`src/services/storage.ts`): Android → app **Documents** directory under
  the configured relative path; desktop/browser → browser download with the
  relative path encoded into the filename (slashes → underscores).
- `saveBinaryFile` sanitizes path segments (keeps Myanmar Unicode, strips
  `\ / : * ? " < > |`).
---

## 5. Business rules — observable behavior

> These are the behaviors implemented in the reference app. V2 must reproduce
> them exactly. `docs/DOMAIN_RULES.md` is the authoritative written form.

1. **Myanmar price shorthand `A/B`.** A price such as `18/50000` means
   **100 tins = 1,850,000 MMK** → **1 tin = 18,500 MMK**. It is **not** a
   fraction. Rule: `price_100_tin = A × 100_000 + B`; `price_per_tin =
   price_100_tin / 100`. Accepted input matches `A/B` where A is 1–3 digits and
   B is 1–5 digits; result must be > 0. Formatting rounds to `A/BBBBB`.
   (Implementations: `src/utils/price.ts`; shown on Rice Prices page with a live
   parse preview.)
2. **Price lookup on purchase screen.** The price is found by **exact
   `date + rice type`** match and displayed read-only. If none exists the UI says
   "no rice price found" and the purchase **cannot be created** — there is
   **no fallback** to another date's price. (`findRicePrice`. The
   `UNIQUE(date, rice_type_id)` constraint prevents duplicate conflicts.)
3. **Price snapshot immutability.** Every purchase copies `price_100_tin` /
   `price_per_tin` at creation time. Later edits to the Rice Prices table
   **never change historical purchases** (the snapshot columns are the source
   used by reports/PDFs/receipts).
4. **Purchase numbers.** Auto-generated **`PSO-YYYYMM-NNNN`** where `NNNN` is a
   **monthly** sequence (resets each calendar month), zero-padded to 4 digits,
   unique, and **immutable after creation**. (Note: the project README text still
   says `PSO-YYYYMMDD-NNNN` — the code and tests use the **monthly** format.)
5. **Weight validation.** Enter key (or Insert button) submits the weight:
   decimals allowed (`98.4`, `100.25`); empty / non-numeric / negative / zero are
   rejected with bilingual inline messages; the input clears and refocuses after
   each success. A duplicate-weight warning is **not** implemented in the current
   code (it was intentionally removed in commit `96d75dc`); the earlier README
   reference to a "duplicate warns but allows Continue" is stale.
6. **Tin calculation.** `1 tin = 50 lb` by default, **configurable** in
   Settings → Calculation ("1 Tin = ? Pounds"). `total_tins = net_pounds /
   lbPerTin` with **full precision (unrounded)**; payment
   `total_amount = total_tins × price_per_tin`. Totals are recomputed on every
   add / edit / delete / undo of a bag.
7. **Undo.** `Ctrl+Z` removes only the **most recent bag of the currently open
   purchase session** and recalcs totals (there is no multi-step history stack).
8. **Finalize.** "Finalize & Save PDF" first generates the Purchase Voucher PDF,
   then marks `finalized = 1` and stores `pdf_path`. While finalized, the
   purchase is read-only for editing (weight input, moisture label, and finalize
   are disabled; viewing/re-exports/printing remain possible). Finalize fails
   safely: if PDF generation throws, the data stays saved and the user is told.

### 5.1 Moisture loss rules (fixed — not configurable)

| Moisture label (17/18/19/20) | Deduction rate (lb per 50 lb) |
| --- | --- |
| 17 | 1 |
| 18 | 2 |
| 19 | 3 |
| 20 | 4 |

- **Formula (Pattern 1, purchase-level):**
  `MoistureLoss = GrossPound ÷ 50 × rate`; `NetPound = GrossPound − MoistureLoss`.
- Loss is **always calculated from the actual total gross pound weight of the
  purchase** — never from bag count or fixed per-bag weight.
- **Pattern 1:** the purchase carries one moisture label (None/17/18/19/20).
  Newly inserted bags **inherit the purchase label**; changing the purchase label
  later affects **only new rows** — existing rows keep their own stored labels.
- **Pattern 2 (row-level, for PDF/P&L display):** each bag row can also carry its
  own moisture label (editable per row). The P&L "Moisture Breakdown" column
  shows **label counts only** (e.g. `17:2, 18:1`, no "lb" unit), ascending label
  order, ignoring rows with no label.
- **Display weight in PDFs:** moisture-adjusted bag weight =
  `weight − (weight ÷ 50 × rate)` per row; the sum of adjusted rows equals the
  purchase `net_pound` exactly (Pattern 1), which is why the voucher's bag-weight
  details use adjusted weights.
- `moisture_configs` (Moisture page) remembers a per-customer + per-paddy-type
  default: status `default` = no deduction, `active` = the configured label
  applies. New purchases **pre-fill** the label; the operator may override per
  purchase.
- **Display of pound columns:** Dashboard (all modes), History, and the voucher
  PDF use **net pound** (after moisture), not gross pound, for the pound values.

### 5.2 SQLite-level notes worth preserving

- `recalcPurchaseTotals` recomputes totals from the live `bags` rows
  (gross/pounds/tins/amount/moisture fields) — the purchases row is derived, not
  independently edited.
- Deleting a farmer deletes their purchases (and bags cascade); deleting a bag
  re-sequences remaining bag numbers so they stay contiguous.
- Deleting a rice type is a plain delete (historical purchases keep their
  snapshot; the join then shows no name — behavior as implemented).
---

## 6. Features and important pages

### 6.1 Dashboard / Home page (`DashboardPage`)

- Three view modes: **Today** (single day), **Month**, **Year**. Navigation via
  `◀`/`▶` buttons, a date picker, and a "Today" button (shown only when not
  already on today). Default = today.
- **Paddy-type filter** applies to both chips and the table in every mode.
- Rows are **grouped by Farmer + Paddy Type + Applied Price** — records that used
  different prices or paddy types are **never merged**. A bold **TOTAL** row
  closes the table.
- Compact summary chips: Farmers · Purchases · Bags · Pounds · (Tins) · Total
  Amount. Pound chip/columns show **net pound** after moisture.
- No summary tables are stored; every query hits the `purchases(date)` index —
  the DB stays the single source of truth.
- Actions: **Summary PDF** export (day/month/year per active view/filter) and
  optional 80 mm thermal print of the active summary.

### 6.2 New Purchase page (`NewPurchasePage`)

- Farmer: **search as-you-type** (`FarmerSearchInput`, matches name/address/phone,
  Myanmar-Unicode safe) or instant "create new" inline.
- Date defaults to today. Paddy-type select (active types only).
- Price block: auto-loaded via exact `date + type` lookup, shown read-only with
  shorthand and per-tin values; "no price found" prevents creation.
- Moisture label: pre-filled from `moisture_configs` when an active config
  exists; operator may override for this purchase only.
- On create: `createPurchase(...)` (no bags yet) → navigate to
  `/purchase/:id` (the weight-entry screen).

### 6.3 Purchase (weight-entry) page (`PurchasePage`)

- Keyboard-first: **Enter** inserts a bag (form-wrapped so the Android soft
  keyboard Enter always works), **Esc** clears input, **Ctrl+Z** undo last,
  **Ctrl+F** → farmers, **Ctrl+P** export PDF. Android shows equivalent visible
  buttons.
- Sticky weight input keeps the Insert button visible while the bag list grows.
- Pattern 1 moisture: a purchase-level label `<select>` (None/17–20);
  **affects newly inserted rows only**; disabled after finalize. Per-row
  moisture edition (Pattern 2) is available on each bag.
- Bag rows: sequence number, weight, moisture label, per-row edit (weight and
  moisture), delete with a confirmation dialog (totals recalc after each).
- Live totals summary chips: Bags · Pounds · Tins · **Total Amount (MMK)**.
- Action buttons: **Undo Last**, **Print Receipt** (thermal), **Export PDF**,
  **Finalize & Save PDF** (generates voucher PDF, sets `finalized=1`, navigates
  to History). Print/PDF failures never damage the saved purchase.

### 6.4 History page (`HistoryPage`)

- Records **grouped by purchase date**; a header per date shows that day's
  Farmers / Purchases / Bags / Pounds / Tins / Total. Newest date first by
  default; **one tap toggles oldest-first**.
- Filters: farmer (route `history/:farmerId`, with a farmer picker kept in sync
  with the route), **Date From / Date To** range, and **paddy-type filter**.
- Exports: **CSV** and **Excel** respect the active filters.
- Per-purchase actions: view / re-export **PDF**; **delete** (with confirmation).
- **Bag Weights PDF** button: exports ALL bag weights of the selected farmer
  (optionally filtered by paddy type) as one paginated PDF.

### 6.5 Other pages

| Page | Behavior |
| --- | --- |
| `FarmersPage` (Customers) | CRUD: name/address/phone; search by name/address/phone; delete cascades purchases + bags (confirm dialog) |
| `RiceTypesPage` (Paddy Types) | CRUD; `active` toggle (inactive types excluded from New Purchase list) |
| `RicePricesPage` (Prices) | Add/update price per date + paddy type using the `A/B` shorthand with live parse preview + formatted totals; upsert semantics (`UNIQUE(date, rice_type_id)`); list sorted date desc; edit prefills shorthand |
| `MoisturePage` | CRUD of per-customer + per-paddy-type moisture configs (status default/active + label 17–20) used to pre-fill new purchases |
| `ProfitLossPage` | Read-only P&L report of **all** purchases: date, customer, paddy type, gross pound, moisture label, deduction (lb), moisture breakdown (Pattern 2 label counts), net pound, total amount; summary chips (count, gross, loss, net, total); reads **saved snapshots** (never recalculates from current moisture settings) |
| `SettingsPage` | Master–detail two-pane layout (sidebar groups + detail pane) on tablet/desktop; single-pane menu→detail on narrow screens. Groups: **General** (Language, Font Size, Themes) · **Company** (name/address/phone/PDF footer text) · **Calculation** (1 Tin = ? Pounds) · **PDF & Documents** (PDF directory) · **Printer Settings** · **Security** (App Lock etc.) · **Device Authorization** · **Backup & Restore** |

### 6.6 Components (notable)

- `Layout` — top-bar nav: wide screens show all links inline (wrap); narrow
  screens use a hamburger menu. Scroll-aware **hide/show top bar** animation
  (threshold ~8 px, requestAnimationFrame).
- `LockScreen` — full-screen lock UI: pattern pad / PIN pad / fingerprint,
  brute-force cooldown, auto-lock; the only thing rendered while locked.
- `DeviceGate` — shown when Android device is unauthorized; auto-starts the
  activation server and shows "Waiting for activation…".
- `ErrorBoundary` — top-level render guard around the app.
- `ConfirmDialog` — shared destructive-action confirmation.
- `FarmerSearchInput`, `PatternPad` — search and pattern-drawing controls.
- `settings/*` — SettingsRow/Section/Select/Toggle/Dialog/ThemeDialog and the SVG
  icon set used by the settings UI.
---

## 7. State management (Zustand stores)

| Store | Holds | Key actions |
| --- | --- | --- |
| `useAppStore` | DB readiness (`dbReady`/`dbError`), full `Settings` object | `initialize()` (init DB + settings + theme), `refreshSettings`, `updateSetting`, `setTheme`, `setFontSize` |
| `usePurchaseStore` | The **currently open purchase session**: `purchaseId`, `summary`, `bags`, `busy`, `error` | `load`, `clear`, `insertWeight`, `editWeight`, `editBagMoisture`, `setPurchaseMoisture`, `removeBag`, `undoLast`, `finalize(pdfPath)` |
| `useSecurityStore` | App Lock config, `locked`, `failedAttempts`, `lockedUntil` | `initialize`, lifecycle (`handleBackground`/`handleForeground`), `lockNow`, `unlockWithPattern/Pin/Biometric`, `recordFailure`, `isThrottled`, config actions (enable, pattern/PIN save/change/remove, biometric toggle, auto-lock timeout) |
| `useDeviceAuthStore` | `state` (`checking\|unsupported\|unauthorized\|authorized`), `fingerprint`, `error` | `initialize`, `beginActivation`, `deactivateLocal` |

Notes:

- Stores wrap the DAO/services; components read store output. The purchase store
  re-reads bags + summary from the DB after each mutation.
- App Lock lifecycle: app starts **locked** when enabled; `document.visibilitychange`
  drives background/foreground; returning after the auto-lock timeout re-locks.
- Brute-force throttling: **5 consecutive failures → 30 s cooldown**, then
  doubling per extra failure, **capped at 5 minutes**.
- Fail-safes: App Lock enabled with no credentials never locks the user out;
  removing the **last** credential auto-disables App Lock (and biometric helper).

---

## 8. PDF generation (`services/pdf.ts`)

**Pipeline.** Reports are written as real HTML (the browser text engine renders
Myanmar Unicode correctly with Noto Sans Myanmar / Padauk), rasterized with
`html2canvas`, then placed into **A4 pages** via **jsPDF**. Output is therefore
**image-based** (no text selection in the PDFs) — documented as a known
limitation.

**Report kinds + on-disk paths** (relative to the configured `pdf_dir` /
platform storage):

| Report | Path pattern | Contents |
| --- | --- | --- |
| Purchase Voucher | `pdf/YYYY/MM/{date}_{farmer}_{paddy-type}.pdf` | English labels; company letterhead; **Voucher No + date + purchase/generated time**; farmer info block; purchase details table (incl. moisture-adjusted bag weights, TOTAL row); price info; remark lines; **Farmer / Authorized signature lines**; "Thank you for your business" footer + optional Myanmar company footer text |
| Bag Weight Details | `pdf/bag-weights/{farmer}_bag_weights[_{type}].pdf` | **All** bag weights of one farmer (optionally one paddy type), paginated **100 rows/page** (code constant; older README text says 50 — code wins), compact two-pair layout (No\|Weight\|No\|Weight), one table per consecutive paddy type, **No restarts at 1 per type**, voucher No(s) in header, purchase date/time from the original record |
| Yearly Report | `pdf/reports/yearly/paddyprice_yearly_report_{year}.pdf` | Annual totals + per-month totals + per-paddy-type totals for a year |
| Period Summary | `pdf/reports/summary/paddyprice_report_{tag}.pdf` | Day / Month / Year summary (per-paddy-type rows + totals), filter-aware, used by the Dashboard PDF button |
| Farmer Report | `pdf/reports/farmer/paddyprice_farmer_report_{farmer}_{year\|from_to\|all_time}.pdf` | Farmer info, yearly summary (records/dates/pounds/tins/amount), per-paddy-type breakdown, purchase list (filterable by year or date range) |

The voucher and summary footers show `Generated:` timestamp on each export.

---

## 9. Spreadsheet export (`services/export.ts`)

- CSV and `.xlsx` (via SheetJS `xlsx`) with identical column set:
  `Purchase No, Date, Farmer, Address, Phone, Rice Type, Price 100 Tin,
  Price Per Tin, Bags, Pounds, Tins, Amount MMK`.
- Tins rounded to 3 decimals; amount rounded to whole MMK for export.
- File pattern `export/purchases_{timestamp}.csv|xlsx` via the storage layer.
- History's CSV/Excel buttons respect the active filters (farmer, date range,
  paddy type).

---

## 10. Backup & restore (`services/backup.ts`)

- **Backup file format `.ppbak`:** `[4-byte little-endian manifest length] +
  [JSON manifest] + [raw SQLite bytes]`. Manifest = `{ magic: "PPBK", version: 1,
  created_at }`.
- Default filename `paddyprice_backup_YYYY-MM-DD.ppbak`, saved under
  `backup/` through the platform storage layer (desktop Electron routes
  `.ppbak` downloads to `~/PSO/backup`).
- **Restore** accepts `.ppbak` (validated: magic + version) and falls back to a
  raw `.sqlite/.db` file; validates the `SQLite format 3` header in
  `replaceDatabase`; requires explicit user confirmation before replacing data.
- `createBackupWithOptions({directory, filename})` exists; `listBackups`,
  `cleanupOldBackups`, and `createAutomaticBackupIfEnabled` are currently
  **placeholders** (no automatic backup feature in the shipped app).
---

## 11. Printing — Bluetooth thermal receipts (`services/printer/`)

- **Settings → Printer:** printer type (**None / Mock / Bluetooth Thermal /
  System**), paper width (**58 mm ≈ 32 chars / 80 mm ≈ 48 chars**), copies
  (**1–5**), scan/connect to paired devices (BLUETOOTH_CONNECT permission on
  Android 12+), and a **test print** that verifies Myanmar text rendering.
- **Architecture:** React UI → `PrinterService` (sole entry point) →
  `PrinterAdapter` (`android-bluetooth`, `desktop`, `mock`) → platform.
  Adapters expose capabilities + a human-readable `limitation`; errors map to
  `PrinterError` codes with friendly bilingual messages.
- **Bluetooth (Android):** native `BluetoothPrinter` Capacitor plugin (Java);
  the adapter builds **ESC/POS bytes** (`EscPosFormatter`: init, alignment, bold,
  feed, cut) and streams them base64 over the socket. Copies loop in the adapter.
- **Desktop:** prints plain-text receipt via a hidden `<iframe>` + the **system
  print dialog** (no direct USB/thermal output on desktop).
- **Mock:** prints to the browser console; exposes `lastOutput` / `failNextPrint`
  for tests.
- **Receipt layout** (`ReceiptFormatter`, fixed-char table): header rules +
  centered **PADDY PURCHASE** + company block; `Invoice`, `Purchase Date`,
  `Purchase Time`, `Generated`; **Customer** block; per-paddy-type rows
  (type, pound, tin, price shorthand, amount) — **paddy types are never merged**;
  per-bag weight rows (`#seq weightlb`, multi-column); `Total Pound`, `Total Tin`,
  `Total Amount (MMK)`, `Remark`, `Thank you` footer.
- **Data source:** receipts are built from **saved purchase records**
  (`buildReceiptFromPurchase`: summary + bags); prices come from the purchase's
  own snapshot columns.
- **Myanmar rendering caveat:** ESC/POS text mode sends UTF-8; it renders
  correctly **only on printers with Myanmar font support**. Raster printing is
  not implemented — surfaced in the UI as a documented limitation.

---

## 12. Security (two phases)

### 12.1 Gate order

**Device Authorization (Phase 2) → App Lock (Phase 1) → Paddy app.** On desktop/
web the device gate reports `unsupported` and is skipped; the app keeps working
exactly as before with Pattern/PIN only.

### 12.2 App Lock (Phase 1)

- Master switch plus credentials: **pattern** (≥ 4 unique dots, indices 0–8) or
  **PIN** (4–8 digits) and/or **fingerprint** biometric. Auto-lock timeout:
  `immediately / 60 / 300 / 900` seconds. "Lock Now" locks immediately.
- **Secrets are never stored.** Only a salted verifier:
  `pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>`
  (PBKDF2-SHA256, **100,000 iterations**, 16-byte random salt, constant-time
  comparison). Raw pattern/PIN exist only transiently in memory.
- Brute-force throttling (see §7) applies to pattern and PIN unlock paths.
- Re-locks at launch and after backgrounding past the configured timeout
  (`document.visibilitychange`).

### 12.3 Biometric

- Android only via the native `PaddyBiometric` plugin (system BiometricPrompt).
  Web/desktop report `unsupported_platform` (never faked).
- **Fingerprint only.** Face Lock was **removed**: Class-1 face sensors on common
  devices (e.g. OPPO) cannot be used by third-party apps.
- Capability states surfaced in settings: available / no_hardware / not_enrolled /
  temporarily_unavailable / unsupported_platform / unknown; includes a link to
  open the OS enrollment screen.
### 12.4 Device Authorization (Phase 2) + Linux installer

- Android only. A **non-exportable EC P-256 key pair** is generated inside the
  **Android Keystore**; the app's public-key fingerprint (`SHA-256`) uniquely
  identifies the device. A **copied APK on another device cannot pass** the
  check.
- **Activation flow:** app starts a **loopback activation server** on port
  `18777` → Linux PC runs `~/paddy-installer/install.sh` →
  `adb forward tcp:18777` → fetch `/challenge` returns `{fp, nonce}` → the PC
  signs `"1|fp|nonce|timestamp"` (ECDSA-SHA256) with an **EC P-256 master key
  protected by `keypass.txt` (AES-256)** → `POST /activate` with the signed
  certificate → native plugin verifies and emits `deviceActivated` → the app
  stores `device.fp` + `device.cert` in the SQLite settings table →
  authorized.
- Authorization state is persisted as `device.fp` / `device.cert` settings;
  mismatches between DB and Keystore treat the device as unauthorized.
- Installer menu (PC-side): **[1] Install/Activate · [2] Transfer to a new
  device · [3] Check device · [4] Rebuild APK**. `devices.reg` records
  `fingerprint|timestamp|status|label` (active/revoked/replaced). Transfer
  revokes the old phone, then activates the new one.
- Secrets (`keypass.txt`, `master.pem`, `devices.reg` …) stay in the installer
  folder and are never committed.

---

## 13. Platform integrations

### 13.1 Android (Capacitor)

- `capacitor.config.ts`: `appId com.paddyprice.app`, `appName PadDy`,
  `webDir dist`, `androidScheme https`, `allowMixedContent false`, no dev server
  in production (fully offline).
- Native Java plugins under `android/app/src/main/java/...`:
  `MainActivity`, `BiometricPlugin`, `BiometricSelfTest`, `BluetoothPrinterPlugin`,
  `DeviceAuthPlugin`.
- App data: DB at `<app data>/sqlite/paddyprice.sqlite`; documents under the app
  **Documents** directory (PDFs, exports, backups).

### 13.2 Electron desktop shell (`electron/main.cjs`)

- Window 1280×860 (min 900×640), `autoHideMenuBar`, secure webPreferences
  (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`); loads
  the built `dist/index.html` (works packaged as AppImage too).
- External `http(s)` links open in the system browser.
- **Download interception:** `.pdf` → `~/PSO/pdf`, `.ppbak` → `~/PSO/backup`,
  everything else → `~/Downloads`; shows a "File saved" dialog on completion.
- Packaged as a Linux **AppImage** (appId `mm.paddyprice.app`, productName
  `Paddy`, category Office).

### 13.3 Web / static hosting

- `HashRouter` so the SPA works on GitHub Pages without server-side routing.
- Vite `base` is overridable via `VITE_BASE_PATH` (CI builds with
  `--base=/paddyprice/`).
- CI: `.github/workflows/deploy.yml` (on push to `main`): `npm ci` → `tsc --noEmit`
  → `npm test` → build → deploy Pages.
---

## 14. Theming, language, and font size

- **Themes:** the code currently defines **21 themes** (10 original dark themes +
  `midnight` + 10 light themes; the README's "10 dark themes" section is stale).
  Default = `tokyo-night`. Legacy `light`/`dark` values migrate to `tokyo-night`.
  Themes are **semantic CSS variables** (`--c-background`, `--c-surface`,
  `--c-accent`, …) mapped to Tailwind color tokens (e.g. `bg-surface`,
  `text-muted`, `border-border`); switching re-themes the whole app instantly and
  **no theme logic lives inside components**. Selection persists in SQLite
  settings + a localStorage mirror applied **pre-render** (`applyStoredTheme`).
  A `ThemeDialog` shows live color-swatch previews.
- **Language:** Myanmar (default) / English, toggled in Settings → General.
  Bilingual pairs are `{my, en}` objects or `"my / en"` strings; `Bilingual`
  component renders the active language. Persisted in localStorage
  (`paddyprice.lang`); `index.html` default `lang="my"`; also set as
  `data-lang` on `<html>`.
- **Font size:** Small (0.90) / Normal (1.00) / Large (1.10) / Extra Large (1.20)
  applied as `--app-font-scale` on `:root` (scales the `html` font size), stored
  in SQLite + a localStorage mirror for pre-render (`paddyprice.font_size`).

---

## 15. Keyboard shortcuts (desktop; Android shows equivalent buttons)

| Key | Action |
| --- | --- |
| `Enter` | Insert bag weight (form-wrapped so mobile soft keyboards work) |
| `Esc` | Clear weight input |
| `Ctrl+Z` | Undo last bag of the open purchase |
| `Ctrl+P` | Export purchase PDF |
| `Ctrl+F` | Go to Farmers page |

---

## 16. Important end-to-end workflows

1. **Daily purchase run:**
   Rice Prices (today, each paddy type) → New Purchase (customer/date/type →
   price auto-loads) → weight entry (Enter per bag, moisture label set once) →
   Print Receipt (optional) → Finalize & Save PDF → auto-navigates to History.
2. **New customer with moisture defaults:**
   Farmers → create → Moisture → add config for customer+paddy type (Active +
   label) → next New Purchase pre-fills that label (still overridable).
3. **Looking up history / exporting:**
   History → pick date group or filter by farmer/range/paddy type → CSV / Excel /
   per-purchase PDF / **Bag Weights PDF** for a farmer.
4. **Backup / restore:**
   Settings → Backup & Restore → Backup Now (`.ppbak`) or Restore… (file picker →
   validation → confirmation → replace DB).
5. **Printer setup:**
   Settings → Printer → type + width + copies → scan/connect device → test print
   (verifies Myanmar rendering).
6. **First launch on a new Android device:**
   Install APK → open app → Device Authorization screen → USB to Linux PC →
   installer [1] Install/Activate → signed challenge → authorized → App Lock
   setup → use. Transferring devices uses installer [2].
7. **App Lock setup:**
   Settings → Security → App Lock ON → set Pattern or PIN (and enable
   fingerprint if desired) → choose auto-lock timeout.
---

## 17. Verification, tests, and CI (reference baseline)

- **Scripts:** `npm run lint` (zero errors/warnings), `npm run typecheck`
  (`tsc --noEmit`), `npm test` (Vitest), `npm run build`, Android debug build via
  Gradle/Capacitor.
- **Test suite at the reference commit: 6 files / 93 tests passing** (Vitest +
  jsdom). Coverage areas: DB auto-init, price lookup uniqueness, purchase session
  + **price snapshot immutability**, weight entry/totals, farmer history,
  **Pattern 1 moisture**, moisture-config upsert, history netPound regression,
  tin conversion, totals, payment math, weight validation, moisture formula +
  acceptance scenarios + Pattern 2, moisture-adjusted PDF weights, label-count
  formatting, price `A/B` parsing, security verifier (PBKDF2) + validation +
  constant-time equality, and printer receipt/ESC-POS/mock/service tests.
  Database tests run against a **real SQLite engine in memory** (test hooks
  override the WASM locator + persistence adapter).
- **CI:** `.github/workflows/deploy.yml` gates on typecheck + tests, then builds
  and deploys the Pages demo. (The reference README claims "53 tests" — stale;
  the actual suite is 93 at the pinned commit.)

---

## 18. Observable behaviors & discrepancies (read carefully)

1. **Purchase numbers are monthly:** code emits `PSO-YYYYMM-NNNN` (resets each
   month). The README text `PSO-YYYYMMDD-NNNN` is **stale** — trust the code and
   tests.
2. **Bag Weights PDF rows/page = 100** (code constant). The README text "50 rows
   per page" is **stale**.
3. **Duplicate-weight prompt does not exist** in the current code (removed in
   `96d75dc`). The README rule #5 mentioning it is **stale**.
4. **Themes:** current code ships 21 themes (dark + light + `midnight`); the
   README's "10 dark themes" section predates the light-theme work.
5. **Test count:** README says 53; actual = 93 at the pinned commit.
6. **App name:** UI/branding is "Paddy" (web `<title>` "Paddy", electron
   `productName`); Capacitor `appName` is `PadDy`; older READMEs/titles also use
   "PSO — Paddy Stock Office".
7. **PDFs are rasterized** (html2canvas → jsPDF): no text selection inside PDFs.
   This is a known, accepted limitation; V2 should preserve fidelity for Myanmar
   text or improve only if explicitly requested.
8. **Desktop "save to folder"** uses browser downloads (Electron intercepts them
   to `~/PSO/pdf`, `~/PSO/backup`).
9. **Automatic backup / backup listing / cleanup** functions are placeholders —
   they do nothing in the shipped app.
10. **Deleting a rice type** that still appears in historical purchases leaves
    those purchases intact (their stored name join may display without a name).

---

## 19. V2 implementation checklist (what must be preserved)

- Offline-first React + TypeScript app; one codebase for Android + Linux desktop
  + browser demo.
- Real SQLite (sql.js WASM) with the exact schema, indexes, constraints, and the
  two migrations; auto-init + idempotent migrations; debounced byte-persist;
  per-platform persistence (IndexedDB vs Capacitor Filesystem).
- All business rules in §5 and moisture rules in §5.1, verified against
  `docs/DOMAIN_RULES.md` and the reference tests.
- Full navigation/page set (§3.1, §6) including the four Zustand stores (§7).
- PDF pipeline with all five report kinds + deterministic paths (§8); voucher
  layout elements (letterhead, voucher no/dates, farmer block, details table with
  TOTAL, price info, remarks, signatures, footer).
- CSV/Excel export columns (§9), backup `.ppbak` format + validated restore
  (§10).
- Printer service with adapter pattern, ESC/POS formatting, receipt layout,
  paper widths, copies, test print, and the Myanmar-rendering caveat (§11).
- App Lock (PBKDF2 verifiers, pattern/PIN/fingerprint, auto-lock, throttling,
  fail-safes) and Device Authorization (Keystore EC P-256, loopback activation
  server, installer scripts) (§12).
- HashRouter + static-hostable build; GitHub Pages CI; Electron shell with
  download interception; capacitor config (§13).
- Theming system (semantic CSS vars), Myanmar/English i18n, font-size scaling
  (§14).
- The 93-test baseline as a behavioral specification, not just a suite.
