# Paddy Project V2

> Offline-first paddy/rice purchasing application for Android, Linux desktop, and web.
> **Status: architecture & documentation phase — application source code has not
> been created yet.**

## 1. Project overview

Paddy is an **offline-first rice-purchasing application** used by a rice-buying
office. It records **paddy bag weights** purchased from farmers and calculates
totals in **bags / pounds / tins / MMK** (Myanmar Kyat). It produces **PDF
vouchers**, optional **Bluetooth thermal receipts**, and lets the office manage
**farmers (customers)**, **paddy (rice) types**, **daily rice prices**, and
**per-customer moisture configurations**.

- **Fully offline at runtime** — real SQLite locally; no cloud, no internet
  required (internet is only needed to install dependencies).
- **One shared codebase** for all supported platforms.
- **Bilingual UI** — Myanmar (default) and English — with multiple themes and
  font sizes; preferences apply on first paint.
- Branding seen in the docs/code: "Paddy" / "PadDy" / "PSO — Paddy Stock Office".

## 2. V2 purpose — architectural rebuild

V2 is an **architectural rebuild** of the existing, working Paddy Project.
It is **not a feature expansion**:

- V2 must **preserve the existing product features and business behavior**
  exactly as documented.
- The **only** explicitly requested behavior change: **moisture deduction rates
  become configurable in Settings** (same shipped defaults — 17→1, 18→2, 19→3,
  20→4 lb per 50 lb of actual weight), with the snapshot rule that changing the
  setting never alters saved/finalized purchases, History, Profit & Loss, or
  generated documents.
- The rebuild replaces the existing code organization with a **feature-oriented
  structure**: a pure domain layer, isolated infrastructure, and small
  orchestrating services (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)).
- Business rules are **never invented or re-derived**: they come from
  [`docs/DOMAIN_RULES.md`](docs/DOMAIN_RULES.md) and nothing else.

## 3. Development status

- **Done:** the documentation set — product spec, domain rules, architecture,
  and reference behavior notes (see [Documentation](#11-documentation)).
- **Not started:** application source code (no `src/` yet), build config, CI.
  The repository currently contains only `AGENTS.md`, this `README.md`, and
  `docs/`.
- The reference test suite (**93 tests across 6 files**) is treated as a
  **behavioral specification** the future implementation must satisfy.
- The Android section is confirmed working (Capacitor). The Electron
  and static web deployment sections are still placeholders.

## 4. Technology stack (as documented)

| Concern | Technology |
| --- | --- |
| UI | React 18 + TypeScript (strict, `tsc --noEmit`) |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Routing | react-router-dom with **HashRouter** (static-hostable) |
| State | Zustand (only for genuinely shared state; local `useState` otherwise) |
| Database | **sql.js** — real SQLite compiled to WebAssembly, `PRAGMA foreign_keys = ON` |
| Persistence | IndexedDB (desktop/browser) · Capacitor Filesystem (Android); debounced byte-persist |
| PDF | jsPDF + html2canvas (HTML → raster → A4; image-based — a preserved limitation) |
| Spreadsheets | SheetJS (`xlsx`) for Excel export; CSV generated directly |
| Security | WebCrypto PBKDF2 verifiers (App Lock); Android Keystore via native plugins (device authorization) |
| Android shell | Capacitor + native Java plugins (biometric, Bluetooth printer, device authorization) |
| Desktop shell | Electron (`electron/main.cjs`, AppImage via electron-builder) |
| Testing | Vitest + jsdom; db tests run against a real SQLite engine in memory |

## 5. Supported platforms

| Platform | How it runs | Notes |
| --- | --- | --- |
| Android tablet/phone | Capacitor WebView | offline; native plugins for fingerprint biometric, Bluetooth ESC/POS printing, device authorization |
| Arch Linux desktop | Electron (AppImage) or browser | download interception: `.pdf` → `~/PSO/pdf`, `.ppbak` → `~/PSO/backup`, anything else → `~/Downloads` |
| Web | static build with HashRouter | hostable as a demo (e.g. GitHub Pages) |

Device Authorization and fingerprint biometric are **Android-only**; desktop/web
skip those gates. Desktop has no direct USB/thermal output — printing uses the
system print dialog.

---

## 6. Architecture at a glance

V2 uses a **feature-oriented structure** with domain/infrastructure separation
(full rules in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

- **`src/domain`** — pure Paddy business rules (weights, moisture, prices,
  purchases, P&L, summaries). No React, SQLite, Capacitor, or platform code;
  implements `docs/DOMAIN_RULES.md` exactly.
- **`src/infrastructure`** — all SQLite/sql.js code (schema, migrations, DAOs,
  persistence) plus platform adapters (Capacitor plugins, filesystem, printer
  transports) behind small port interfaces.
- **`src/services`** — use-case orchestration (purchases, reports, PDF,
  printing, export, backup, security, device auth, settings). Coordinates
  domain + infrastructure; never re-implements rules; no UI.
- **`src/features`** — self-contained product areas (pages, components, store
  slice, tests). Features never import other features.
- **`src/shared`** — generic UI, i18n, theming, formatting, the app-wide
  settings store.
- **`src/types`** — type-only contracts and adapter ports shared by all layers.
- **`src/app`** — bootstrap, HashRouter routes, layout shell, and the gate
  order **Device Authorization → App Lock → app**.

Dependency direction: `app` → `features` → (`services` → `infrastructure` /
`domain`) → `shared`/`types`. Each layer may depend only on the layers listed
in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5; the forbidden edges
(e.g. domain → UI/SQLite, features → features) are hard rules.

## 7. Target source structure

```
paddyprice-v2/
├─ AGENTS.md  README.md  docs/
├─ electron/                  # Electron main process (outside src)
├─ android/                   # Capacitor Android shell + native Java plugins (outside src)
└─ src/
   ├─ app/                    # main.tsx, App, router, Layout, gates wiring, app store
   ├─ features/               # dashboard · purchases · history · farmers · rice-types
   │                          # rice-prices · moisture-configs · profit-loss ·
   │                          # settings · security · device-auth
   ├─ services/               # purchase · settings · reports · pdf · printing ·
   │                          # export · backup · security · device-auth
   ├─ infrastructure/
   │  ├─ db/                  # connection · migrations · persistence · dao/
   │  └─ platform/            # environment · fs · printers · biometric · device-auth
   ├─ domain/                 # calc · moisture · price · purchase · pnl · summaries
   ├─ shared/                 # ui · i18n · theme · format · state · hooks · utils
   └─ types/                  # entities · settings · reports · ports/
```

## 8. Preserved feature areas

V2 preserves the full existing feature set (details in
[`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md)):

- **Dashboard** — Today / Month / Year modes with navigation and date picker;
  per Farmer + Paddy Type + Applied Price grouping with TOTAL row; net-pound
  summary chips; summary PDF and 80 mm thermal receipt.
- **New Purchase / Purchase** — farmer search or quick create, date, active
  paddy types, exact-date price (no fallback), moisture pre-fill and override,
  keyboard-first weight entry with sticky input, bag rows (edit/delete),
  1-based contiguous bag numbering, Undo (most recent bag), live totals,
  Finalize → voucher PDF → finalized/read-only.
- **History** — date-grouped records, newest/oldest toggle, farmer/range/paddy
  type filters, CSV / Excel exports, per-purchase voucher PDF, farmer
  Bag-Weights PDF, delete with confirmation.
- **Customers (Farmers)** — CRUD; delete cascades purchases + bags.
- **Paddy Types** — CRUD with `active` toggle (inactive excluded from New
  Purchase).
- **Prices** — `A/B` shorthand entry with live parse preview; one price per
  (date, paddy type), upsert semantics.
- **Moisture** — per-customer + per-paddy-type configs used only to pre-fill
  new purchases (never retroactive).
- **Profit & Loss** — read-only report from saved snapshots with per-row
  moisture breakdown and report summary chips.
- **Settings** — master–detail page: General (language/font size/themes),
  Company, Calculation (tin formula **and the V2-configurable moisture
  deduction rates**), PDF directory, Printer Settings, Backup & Restore.
- **Security / App Lock** — pattern or PIN (salted PBKDF2 verifiers),
  optional fingerprint unlock (Android), auto-lock on timeout/background,
  brute-force cooldown.
- **Device Authorization (Android)** — Keystore-backed activation via USB to
  the Linux installer; the app gates on it before App Lock.
- **Documents & data** — five PDF report kinds, CSV/Excel export columns,
  `.ppbak` backup with validated restore, 80 mm Bluetooth thermal printing
  with copies and test print.

---

## 9. Business-rule principles (summary only)

The precise formulas, constants, thresholds, and rounding live in
[`docs/DOMAIN_RULES.md`](docs/DOMAIN_RULES.md) — the single authoritative
source. Principles every change must respect:

1. **No invented rules.** Calculations come from `DOMAIN_RULES.md` and nothing
   else — no new formulas, constants, or rounding.
2. **Weight-first math.** Bag count never factors into pound/moisture math;
   gross pound is the exact sum of bag weights; moisture loss is computed from
   actual weight (`W / 50 × rate`), never per-bag.
3. **Net pound drives tins.** Tin conversion uses net pound when moisture
   applies; formulas never round — rounding happens only at display/export.
4. **Snapshots are immutable.** Each purchase stores its own price and
   moisture snapshot at save time; later edits to prices, moisture configs,
   or Settings rates never change saved/finalized purchases, History, P&L, or
   generated documents.
5. **Exact price lookup, no fallback.** A purchase requires a price for the
   exact (date, paddy type) — no borrowing another date's price.
6. **Presentation is not calculation.** UI and reports read domain results and
   stored snapshots; they never re-derive rules.

## 10. The reference project — behavioral reference only

The existing, working Paddy Project lives in the sibling repository
`~/paddyprice` (reference commit `4aa3716`) and is recorded in
[`docs/REFERENCE_NOTES.md`](docs/REFERENCE_NOTES.md).

- It is used **only to understand behavior and responsibilities** — never as
  code to copy, and **never modified from any V2 task**.
- Where its `README` and its code/tests disagree, the **code/tests win**;
  known stale claims are listed in `REFERENCE_NOTES.md` §18 (e.g. daily vs
  monthly voucher numbering, rows per PDF page, test count).
- If behavior is unclear, check `REFERENCE_NOTES.md` first, then the reference
  repository — do not guess.

## 11. Documentation

| Document | Role |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Global development rules and the AI-assisted workflow — read first before any change |
| [`docs/DOMAIN_RULES.md`](docs/DOMAIN_RULES.md) | **Authoritative** Paddy business rules and calculations |
| [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) | V2 feature requirements and expected user-facing behavior |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | V2 module boundaries, structure, and dependency rules |
| [`docs/REFERENCE_NOTES.md`](docs/REFERENCE_NOTES.md) | What the existing reference project actually does (behavioral reference) |

Precedence for business behavior: `DOMAIN_RULES.md` > `PROJECT_SPEC.md` >
`REFERENCE_NOTES.md`. `AGENTS.md` governs *how* to work; `ARCHITECTURE.md`
governs *how V2 is structured*.

**Reading order**

- *AI developers / contributors:* `AGENTS.md` → `docs/DOMAIN_RULES.md` →
  `docs/PROJECT_SPEC.md` → `docs/ARCHITECTURE.md` → `docs/REFERENCE_NOTES.md`
  (then inspect the reference repository before implementing).
- *Human developers (product-oriented):* `docs/PROJECT_SPEC.md` →
  `docs/DOMAIN_RULES.md` → `docs/ARCHITECTURE.md` → `REFERENCE_NOTES.md` /
  reference repository as needed.

## 12. Installation

> Placeholder — no package manifest exists yet. Commands will be documented
> here once implementation begins.

## 13. Development

> Placeholder — dev-server commands will be documented here once the Vite
> setup exists.

## 14. Testing

> Placeholder — test commands will be documented here once Vitest is set up.
> The target baseline is the preserved behavioral suite (see
> `docs/PROJECT_SPEC.md` §11).

## 15. Build

> Placeholder — build commands will be documented here once the build
> configuration exists.

## 16. Android (Capacitor)

The Paddy app is packaged for Android via **Capacitor**: the existing web
bundle (`dist/`) is loaded by a native WebView, so the same offline-first
IndexedDB + sql.js persistence layer used on desktop/web continues to work
inside Android with no backend, no cloud sync, and no network calls.

### 16.1 App identity

| Field        | Value                  |
|--------------|------------------------|
| App name     | `Paddy`                |
| App ID       | `com.paddy.paddyprice` |
| Version      | `1.0` (versionCode 1)  |
| Min SDK      | 24 (Android 7.0)       |
| Target SDK   | 36                     |
| Permissions  | `INTERNET` (Capacitor WebView default — no network endpoints are contacted at runtime) |

### 16.2 Icon

The launcher icon is generated from the existing `icon_source.jpg` by
`scripts/build-android-icons.mjs`. The script:

1. Centre-crops the JPG to a square.
2. Resizes it to all required Android densities
   (`mdpi` → `xxxhdpi`, both `ic_launcher.png`, `ic_launcher_round.png`,
   and the adaptive `ic_launcher_foreground.png`).
3. Samples the dominant colour from the JPG and writes it to
   `res/values/colors.xml` as `ic_launcher_background`, so the adaptive
   icon background blends with the original artwork.

The original JPG is not modified, the icon is not redesigned, and the
visual identity is preserved.

### 16.3 Build

```bash
# 1. Install Android SDK + platform-36 + build-tools 36.0.0 if not present.
# 2. Build the web bundle and copy it into the Android assets.
npm run cap:sync

# 3. Assemble a debug APK.
npm run android:assemble:debug
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# 4. (optional) Re-generate launcher icons from icon_source.jpg.
npm run icons:android
```

The Capacitor config lives in `capacitor.config.ts` and points at
`com.paddy.paddyprice` + the `dist/` web directory. The Android shell
(Gradle / manifest / resources) lives under `android/`.

## 17. Desktop (Electron)

> Placeholder — Electron dev/build (AppImage) steps will be documented here
> once the desktop shell is added.

## 18. Web

> Placeholder — static/HashRouter deployment steps (e.g. GitHub Pages) will be
> documented here once CI exists.

