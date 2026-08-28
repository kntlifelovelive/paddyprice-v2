# ARCHITECTURE.md — Paddy Project V2 Module Boundaries and Structure

> **Purpose.** This document defines the V2 source structure, the responsibility
> of every layer and feature module, and the dependency rules that keep the
> rebuild clean. It implements the mandatory separation rules in `AGENTS.md`
> (§4, §5, §9, §10, §11, §12) and describes **where things belong** for every
> kind of code in this project.
>
> **Sources.** Behavioral knowledge comes from `docs/REFERENCE_NOTES.md`
> (what the reference app does) and `docs/PROJECT_SPEC.md` (what V2 must do).
> Business rules live in `docs/DOMAIN_RULES.md` — this document never redefines
> them; it only says *where they live*. The reference project (`~/paddyprice`)
> was used to understand responsibilities only; **no implementation is copied**.
>
> **Precedence.** `AGENTS.md` rules always win. Where this document adds detail
> (e.g. the `src/types` layer, path aliases), it refines — never contradicts —
> `AGENTS.md`.

---

## 1. Architectural principles

1. **Feature-oriented.** Each product area is a self-contained module under
   `src/features`. Cross-feature needs move down to `shared` / `services` /
   `domain` — never sideways into another feature.
2. **Pure domain.** All Paddy business rules are pure TypeScript functions with
   no I/O, no React, no SQLite, no platform imports. They are unit-tested
   directly against `docs/DOMAIN_RULES.md`.
3. **Infrastructure at the edges.** SQL, sql.js, Capacitor plugins, Electron,
   file system, and printers live at the outermost layer behind small adapters
   and DAO functions that return plain data.
4. **Services orchestrate.** Services coordinate domain functions and
   infrastructure calls into use cases. They do not re-implement business
   rules and contain no UI.
5. **Simple by design.** No Clean Architecture ceremony, no DDD/CQRS/Event
   Sourcing, no Redux, no DI containers, no microservices. Layers are folders
   with import rules, not frameworks.
6. **Platform differences are encapsulated.** Business logic never branches on
   the platform; it always works on plain data.

---

## 2. Layer overview

```
┌───────────────────────────────────────────────────────────────────┐
│  src/app          bootstrap · routing · shell · gates · app state │
├───────────────────────────────────────────────────────────────────┤
│  src/features     one self-contained module per product area       │
├───────────────────────────────────────────────────────────────────┤
│  src/services     use-case orchestration (domain + infra, no UI)   │
├───────────────────────────────────────────────────────────────────┤
│  src/infrastructure  db (SQLite/sql.js, DAOs, migrations) +        │
│                      platform adapters (Capacitor, files, printers)│
├───────────────────────────────────────────────────────────────────┤
│  src/domain       pure Paddy business rules (DOMAIN_RULES.md)      │
├───────────────────────────────────────────────────────────────────┤
│  src/shared       generic UI, i18n, theming, formatting, settings  │
├───────────────────────────────────────────────────────────────────┤
│  src/types        project-wide TypeScript types & ports (no deps)  │
└───────────────────────────────────────────────────────────────────┘
```

| Layer | One-line responsibility |
| --- | --- |
| `src/types` | Type-only contracts shared by every layer (entities, `Settings`, ports). Imports nothing. |
| `src/shared` | Generic, framework-light building blocks used across features: UI primitives, i18n, theming, formatting, the app-wide settings store. |
| `src/domain` | Pure Paddy business rules and calculations exactly as specified in `docs/DOMAIN_RULES.md`. |
| `src/infrastructure` | All SQLite/sql.js code (schema, migrations, DAOs, persistence) and all platform-specific adapters (Capacitor plugins, file system, printer transports). |
| `src/services` | Use-case orchestration that combines domain + infrastructure: purchases, reports, PDF, printing, export, backup, security, device auth, settings. |
| `src/features` | Self-contained product areas, each with its pages, components, store slice, and tests. |
| `src/app` | Application bootstrap, router, layout shell, gate composition (device auth → app lock → app), and app-level state. |

---

## 3. The layers in detail

### 3.1 `src/types` — type-only contracts (bottom layer)

**Responsibility.** Holds every TypeScript type, interface, and pure constant
enum-like union that more than one layer needs. It exists so that `domain`,
`infrastructure`, `services`, and `shared` can agree on shapes **without
importing each other**.

Contents:

- Entity types mirroring the schema: `Farmer`, `RiceType`, `RicePrice`,
  `Purchase`, `Bag`, `MoistureConfig`, `PurchaseSummary`, `Settings`.
- Result/DTO shapes: report rows (Dashboard group rows, P&L rows, History date
  groups), export row shape, backup manifest shape.
- **Port (adapter) interfaces**: `PrinterAdapter`, `FileStorageAdapter`,
  `BiometricAdapter`, `DeviceAuthAdapter`, `DbPersistenceAdapter` — signatures
  only, no implementations.
- Small union types: `MoistureLabel` (`17 | 18 | 19 | 20 | null`),
  `PrinterType`, `LockMethod`, `DeviceAuthState`, `Language`, `FontSize`,
  `ThemeId`.

**Rules.**

- Type-only code: **imports nothing** (no runtime dependencies, no values).
- No logic, no defaults that encode business rules. Default moisture rates
  (17→1 … 20→4) belong to `domain`, not here.
- Every layer may import from `src/types`; `src/types` may import from nothing.

### 3.2 `src/shared` — generic building blocks

**Responsibility.** Framework-light, reusable code needed by multiple features:
UI primitives, i18n, theming, presentation formatting, and the one genuinely
app-wide reactive store (settings).

Contents:

- `shared/ui/` — generic components with no Paddy knowledge:
  `ConfirmDialog`, buttons, text inputs, selects, chips, modal/dialog shells,
  tables, toggle rows.
- `shared/i18n/` — the bilingual (`my`/`en`) mechanism: translation
  dictionary, `Bilingual` rendering helper, `t()`-style lookup. Myanmar is the
  default language.
- `shared/theme/` — the theme system: semantic CSS variables, the theme
  definitions, `applyStoredTheme()`, font-size scale application. **No theme
  logic inside components.**
- `shared/format/` — presentation formatting utilities confirmed in
  `DOMAIN_RULES.md` §9.2: `formatNumber`, `formatMMK`, `formatTins`, date
  (`DD-Mon-YYYY`, `DD/MM/YYYY`) and 12-hour `AM/PM` time display. These are
  display-only; they never participate in business formulas.
- `shared/state/` — the **app-wide settings store** (`useSettingsStore`,
  Zustand): language, theme, font size, company info, tin formula, moisture
  deduction rates, PDF directory, printer config. This is the *only* Zustand
  store in `shared`; its state shape comes from `src/types` (`Settings`).
- `shared/hooks/` — generic hooks (media queries, stable callbacks) when
  genuinely reused.
- `shared/utils/` — generic non-business helpers (string trimming, grouping,
  id/sorting helpers) with no Paddy semantics.

**Rules.**

- No Paddy business calculations (weights, tins, moisture, prices, purchase
  numbers) — those are `domain`.
- No knowledge of specific features, SQLite, Capacitor, or Electron.
- Components here are presentation-only; all data arrives via props.

### 3.3 `src/domain` — pure Paddy business rules

**Responsibility.** Every rule and calculation from `docs/DOMAIN_RULES.md`,
implemented as pure, deterministic, unit-testable TypeScript. This is the
heart of the rebuild.

Contents (module per rule group of `DOMAIN_RULES.md`):

- `domain/calc/` — weights and totals: `validateWeight` (trim; empty /
  non-numeric / negative / zero rejected; duplicates allowed),
  `poundsToTins(pounds, lbPerTin)` (no rounding), `computeTotals` (bag count,
  gross pound = Σ weights), `computeTotalAmount` (unrounded tins × snapshot
  `price_per_tin`), `resolveLbPerTin` (stored `tin_formula`, fallback 50).
- `domain/moisture/` — `isValidMoistureLabel` (`null`/17/18/19/20 only),
  default deduction rates (17→1, 18→2, 19→3, 20→4; None/unknown fixed 0),
  `moistureLossForWeight(W, label, rate)` (`W / 50 × rate`),
  `computeMoistureTotals(rows, rates)` (gross, loss, net),
  moisture-adjusted display weight, `formatMoistureLabelCount` (ascending
  `label:count` pairs, no unit, ignores None). **Functions take the configured
  rate(s) as parameters** — the V2 Settings-configurable rates enter here as
  plain arguments; the domain never reads Settings itself.
- `domain/price/` — `parsePriceFormat` (`A/B` shorthand: `price_100_tin =
  A × 100_000 + B`, NOT a fraction; regex + validation rules),
  `formatPriceShorthand`, `pricePerTin` derivation.
- `domain/purchase/` — purchase-number rule (`PSO-YYYYMM-NNNN`, monthly
  sequence `next = MAX(suffix)+1` computed from inputs), new-purchase
  assembly (farmer/date/type + immutable price snapshot + optional Pattern-1
  label with its derived rate; zero bags ⇒ zero totals), finalize
  preconditions (≥ 1 bag; finalize = state transition + PDF-path stamp).
- `domain/pnl/` — P&L row and report-summary assembly **from saved snapshots**
  (never recalculated from current settings).
- `domain/summaries/` — report aggregates as plain sums over stored rows:
  year/month summaries, farmer-year summaries, farmer paddy-type breakdowns,
  Dashboard group-by (Farmer + Paddy Type + Applied Price) row assembly.

**Rules.**

- Pure functions + types only: no I/O, no side effects, no async, no React,
  no SQLite/sql.js, no Capacitor/Electron, no imports from `services`,
  `infrastructure`, `features`, or `app`.
- May import **types only** from `src/types` (and type-only imports from
  `shared` if ever needed).
- Implements `DOMAIN_RULES.md` and nothing else — no invented formulas,
  constants, thresholds, or rounding. Rounding happens at presentation/export
  time via `shared/format`, never inside these formulas.
- UI reads results from domain functions; it never re-derives rules.

---

### 3.4 `src/infrastructure` — SQL, persistence, and platform adapters

**Responsibility.** Everything that touches the outside world: the SQLite
database and all platform differences. It knows nothing about features,
services, or the UI; it exposes plain data.

#### 3.4.1 `infrastructure/db` — all SQLite / sql.js code

- `connection/` — sql.js (SQLite → WebAssembly) loading and locator,
  connection lifecycle, `PRAGMA foreign_keys = ON`, the exact schema DDL
  (tables, indexes, constraints as in the reference).
- `migrations/` — the schema migrations (reference ships two), idempotent,
  run automatically at init.
- `persistence/` — debounced byte-persist of the SQLite database, behind the
  `DbPersistenceAdapter` port (declared in `src/types`): IndexedDB backend
  for desktop/web, Capacitor Filesystem backend for Android. Includes the
  **test hooks** that let db tests override the WASM locator and persistence
  adapter to run against a real SQLite engine in memory.
- `dao/` — small data-access functions returning plain data, one module per
  aggregate: `farmers.dao`, `riceTypes.dao`, `ricePrices.dao`,
  `purchases.dao` (purchase session, bag insert/edit/delete/undo,
  re-sequencing, monthly purchase-number lookup), `moistureConfigs.dao`,
  `settings.dao` (key/value settings incl. tin formula, moisture rates,
  theme/language/font size, `device.fp`/`device.cert`), plus report query
  helpers (date-range/farmer/type filtered selects used by
  `services/reports`).

**Rules.** All SQL lives here and nowhere else. DAOs are thin: they do not
re-implement business calculations — totals are recomputed by calling
`domain` functions with row data, then written back through the DAO. Where a
query is a plain confirmed aggregate (§9.1 of `DOMAIN_RULES.md`), the SQL
performs the plain sum over **stored snapshot columns**.

#### 3.4.2 `infrastructure/platform` — platform differences

- `environment/` — capability/environment detection (android / desktop-web /
  browser) used to pick adapter implementations. Detection lives here;
  business logic never branches on it.
- `fs/` — file save/open/list over the `FileStorageAdapter` port: browser
  downloads (Electron intercepts `.pdf` → `~/PSO/pdf`, `.ppbak` →
  `~/PSO/backup`, rest → `~/Downloads`), Android app Documents directory,
  file pickers for restore.
- `printers/` — printer **transports** implementing `PrinterAdapter`:
  `android-bluetooth` (Capacitor BluetoothPrinter plugin, ESC/POS byte
  streaming, copies), `desktop` (hidden iframe + system print dialog),
  `mock` (console output with `lastOutput`/`failNextPrint` for tests). Each
  exposes capabilities + a human-readable limitation string.

---

- `biometric/` — `BiometricAdapter` wrapping the native biometric plugin
  (fingerprint only; reports `unsupported_platform` off Android) with the
  capability states surfaced in Settings (available / no_hardware /
  not_enrolled / temporarily_unavailable / unsupported_platform / unknown).
- `device-auth/` — `DeviceAuthAdapter` wrapping the native
  device-authorization plugin: Keystore EC P-256 key pair, public-key
  fingerprint, loopback activation server (port 18777), challenge/activate
  handshake.
- `dbpersistence/` (if not folded into `db/persistence`) — the concrete
  IndexedDB / Capacitor Filesystem persistence backends.

**Native code locations (outside `src/` — part of the shells, see §10).**
Android Java plugins (`BiometricPlugin`, `BluetoothPrinterPlugin`,
`DeviceAuthPlugin`) live under `android/app/src/main/java/...`; the Electron
main process lives at `electron/main.cjs` (repo root). Renderer code never
imports Electron; Android WebView code reaches native plugins only through
`infrastructure/platform` adapters.

**Rules.** No business logic, no UI, no imports from `services`/`features`/
`app`. Adapters implement the ports declared in `src/types` and translate
between platform APIs and plain data.

---

### 3.5 `src/services` — use-case orchestration (no UI)

**Responsibility.** Coordinate domain functions with infrastructure calls to
implement the use cases features need. Services sequence and reshape; they do
not re-derive business rules. Services may call other services; none of them
import React or components.

- `services/purchase/` — the purchase-session use cases: create purchase
  (exact `date + rice_type_id` price lookup with **no fallback**; assemble
  price snapshot + purchase number via `domain/purchase`; insert via DAO);
  `insertWeight` / `editWeight` / `editBagMoisture` / `removeBag` /
  `undoLast` (validate via `domain/calc`, mutate via DAO, recompute totals
  via `domain/calc` + `domain/moisture` using the current configured rates,
  write back); `finalize` (recalc → voucher PDF via `services/pdf` → mark
  `finalized=1` + `pdf_path`; on PDF failure the purchase stays saved and
  unfinalized).
- `services/settings/` — load settings from `settings.dao` at startup, keep
  the shared settings store (`shared/state`) in sync, `updateSetting`
  (persist + update store), expose the current tin formula and moisture
  deduction rates to other services. Owns no rules — resolution/fallback
  logic (e.g. invalid `tin_formula` → 50) is `domain`.
- `services/reports/` — Dashboard (Today/Month/Year) summaries and group
  rows, History date groups + filters, farmer/year reports, bag-weights
  datasets: query via DAOs, assemble via `domain/summaries` / `domain/pnl`,
  always from **stored snapshots** (never recalculated from current
  settings).

---

- `services/pdf/` — the document pipeline: HTML render → rasterize → A4
  jsPDF pages (the confirmed reference pipeline; output is image-based — a
  known, accepted limitation). Builds the five report kinds (voucher,
  bag-weights, yearly, period summary, farmer report), deterministic on-disk
  path construction, Myanmar fonts, saves via the platform file adapter and
  returns the saved path. Layout/content assembly uses pure helpers inside
  this service; business values come from purchase snapshot rows, not
  recomputation.
- `services/printing/` — `PrinterService`, the single printing entry point:
  adapter selection via `infrastructure/platform/printers`, capabilities +
  error mapping to friendly bilingual `PrinterError`s, copies loop, test
  print. Contains the pure, testable receipt builder (fixed-char layout from
  the purchase snapshot: header, customer, per-paddy-type rows — never
  merged — per-bag weights, totals, remark, footer) and the ESC/POS
  formatter (init/alignment/bold/feed/cut byte encoding — a printer
  protocol, not a platform concern).
- `services/export/` — CSV and XLSX generation from filtered purchase rows
  with the confirmed column set and export rounding (tins 3 decimals,
  amount whole MMK); saves via the platform file adapter.
- `services/backup/` — `createBackup` (raw SQLite bytes from
  `infrastructure/db` + `.ppbak` manifest: `[4-byte LE length][JSON
  {magic:"PPBK", version, created_at}][bytes]`), `restore` (validate
  manifest magic/version or accept raw `.sqlite/.db`, verify the
  `SQLite format 3` header, replace the database after explicit user
  confirmation), file save/pick via the platform file adapter. Automatic
  backup/listing/cleanup remain non-goals.
- `services/security/` — App Lock mechanics: salted verifier hashing and
  constant-time verification (`pbkdf2-sha256$...`, 100,000 iterations,
  16-byte salt, via standard WebCrypto), credential validation (pattern ≥ 4
  unique dots, PIN 4–8 digits), brute-force throttle policy (5 failures →
  30 s cooldown, doubling per extra failure, capped at 5 minutes — pure,
  testable helpers), auto-lock and lock/unlock orchestration, biometric
  unlock via the platform adapter. Only verifiers are persisted — secrets
  are never stored.
- `services/device-auth/` — activation orchestration on top of the platform
  adapter: begin activation (start loopback server, fetch challenge),
  verify the signed certificate, persist `device.fp`/`device.cert`
  settings, deactivate. Desktop/web reports `unsupported` and is skipped.

**Rules.**

- May depend on: `domain`, `shared`, `infrastructure`, `src/types`, and other
  services. Must not import: `features`, `app`, React, or any component.
- No business-rule re-implementation: when a service needs a rule, it calls
  `domain`.
- `services/settings` is the only writer of the shared settings store (a
  single writer keeps store and DB consistent).

---

### 3.6 `src/features` — self-contained product areas

**Responsibility.** One folder per product area, each containing that area's
pages, components, Zustand store slice (when the area has shared session
state), hooks, and co-located tests. A feature composes services/domain —
it never contains business calculations and never imports another feature.

Standard feature layout:

```
features/<feature>/
  pages/        one page component per route of this feature
  components/   feature-private components
  store.ts      Zustand slice (only if the feature needs shared state)
  hooks/        feature-private hooks
  __tests__/    co-located tests (or *.test.tsx next to the unit)
```

| Feature module | Owns (per `PROJECT_SPEC.md` §3) |
| --- | --- |
| `features/dashboard` | Dashboard page: Today/Month/Year modes with `◀`/`▶` + date picker + Today shortcut; paddy-type filter; per Farmer+Type+Price grouping with TOTAL row; net-pound summary chips; summary PDF + 80 mm thermal print actions |
| `features/purchases` | New Purchase page (farmer search/create, date, active paddy types, exact-date price block, moisture pre-fill + override) and Purchase page (weight entry, sticky input, keyboard shortcuts + Android buttons, Pattern-1 label select, bag rows with edit/delete, live totals, Undo/Print/PDF/Finalize). Owns `usePurchaseStore` (open session) and `FarmerSearchInput` |
| `features/history` | History page: date-grouped records with per-date headers, newest/oldest toggle, farmer/range/type filters (route-synced `/history/:farmerId`), CSV/Excel exports, per-purchase view/delete/PDF re-export, Bag-Weights PDF |
| `features/farmers` | Customers CRUD: name/address/phone, search, delete cascades purchases + bags (confirm dialog) |
| `features/rice-types` | Paddy Types CRUD + `active` toggle (inactive excluded from New Purchase) |
| `features/rice-prices` | Prices page: `A/B` shorthand editor with live parse preview + formatted totals, upsert per (date, type), date-desc list, edit prefill |
| `features/moisture-configs` | Moisture page: per-customer + per-paddy-type configs (default/active + label 17–20) used only to pre-fill new purchases |
| `features/profit-loss` | Read-only P&L report page from saved snapshots: rows (date, customer, type, gross, label, deduction, moisture breakdown, net, amount) + summary chips |
| `features/settings` | Settings page (master–detail; single-pane on narrow): General (language/font size/themes), Company, Calculation (tin formula **and the V2-configurable moisture deduction rates**), PDF directory, Printer Settings, Backup & Restore; hosts the Security and Device Authorization sections owned by those features |
| `features/security` | App Lock: LockScreen (pattern pad / PIN pad / fingerprint), `PatternPad`, brute-force cooldown UI, auto-lock lifecycle handling, Security settings section. Owns `useSecurityStore` |
| `features/device-auth` | Device Authorization: `DeviceGate` ("Waiting for activation…", auto-starts activation), status display, Device Authorization settings section. Owns `useDeviceAuthStore` |

**Rules.**

- Pages are thin: read state from the feature store / services, delegate all
  calculations and orchestration downward.
- Reusable UI used by several features moves to `shared/ui`; shared data
  orchestration moves to `services`; shared rules move to `domain`.
- A feature may not import from `app` or from any other feature. The
  gate-order composition (device-auth → security → app) is wired in
  `src/app`, which imports both features.

---

### 3.7 `src/app` — application shell

**Responsibility.** Bootstrap and composition. Nothing business-specific; it
wires the layers together and renders the gates.

- `main.tsx` — entry: create root, run bootstrap (init DB via
  `infrastructure/db`, load settings via `services/settings`, apply stored
  theme/language/font size via `shared/theme`), mount `App`.
- `App.tsx` — gate composition in the confirmed order:
  **Device Authorization → App Lock → Paddy app**. While a gate is active, no
  routes/layout/data render. On desktop/web the device gate reports
  `unsupported` and is skipped.
- `router.tsx` — HashRouter with the full route table from
  `PROJECT_SPEC.md` §3.1 (unknown paths → Dashboard); route elements are the
  feature pages.
- `Layout.tsx` — top-bar navigation (inline links on wide screens, hamburger
  on narrow) with the scroll-aware hide/show animation; wraps all routes.
- `ErrorBoundary.tsx` — top-level render guard.
- `state/useAppStore.ts` — app-level Zustand store: DB readiness
  (`dbReady`/`dbError`) and the `initialize()` orchestration. App-local —
  features do not consume it.

**Rules.** `app` may import from every layer; **no layer imports `app`**.
No business rules here.

---

## 4. Directory layout (target)

```
paddyprice-v2/
├─ AGENTS.md  docs/  README.md
├─ electron/                    # Electron main process (Node shell, outside src)
│  └─ main.cjs
├─ android/                     # Capacitor Android shell + native Java plugins
│  └─ app/src/main/java/...     #   BiometricPlugin, BluetoothPrinterPlugin,
│                               #   DeviceAuthPlugin (outside src layering)
└─ src/
   ├─ app/
   │  ├─ main.tsx  App.tsx  router.tsx  Layout.tsx  ErrorBoundary.tsx
   │  └─ state/useAppStore.ts
   ├─ features/
   │  ├─ dashboard/    purchases/    history/      farmers/
   │  ├─ rice-types/   rice-prices/  moisture-configs/
   │  ├─ profit-loss/  settings/     security/     device-auth/
   ├─ services/
   │  ├─ purchase/  settings/  reports/  pdf/
   │  ├─ printing/  export/    backup/
   │  └─ security/  device-auth/
   ├─ infrastructure/
   │  ├─ db/
   │  │  ├─ connection/   migrations/   persistence/
   │  │  └─ dao/          # farmers · riceTypes · ricePrices · purchases ·
   │  │                   # moistureConfigs · settings · reportQueries
   │  └─ platform/
   │     ├─ environment/  fs/  printers/  biometric/  device-auth/
   ├─ domain/
   │  ├─ calc/  moisture/  price/  purchase/
   │  └─ pnl/   summaries/
   ├─ shared/
   │  ├─ ui/  i18n/  theme/  format/  state/  hooks/  utils/
   └─ types/
      ├─ entities.ts  settings.ts  reports.ts
      └─ ports/       # printer · fileStorage · biometric · deviceAuth ·
                      # dbPersistence adapter interfaces
```

Every module directory also carries its co-located `*.test.ts(x)` files.

---

## 5. Dependency rules

### 5.1 Allowed dependency edges

| Layer | May depend on | Must NOT depend on |
| --- | --- | --- |
| `app` | `features`, `domain`, `infrastructure`, `services`, `shared`, `types` | — (nothing imports `app`) |
| `features` | `domain`, `services`, `infrastructure`, `shared`, `types` | other `features`, `app` |
| `services` | `domain`, `shared`, `infrastructure`, `types`, other `services` | `features`, `app`, UI/React |
| `infrastructure` | `domain` (types), `shared` (types), `types` | `services`, `features`, `app`, UI |
| `domain` | `shared` (types only), `types` | React, SQLite/sql.js, Capacitor, Electron, UI, `infrastructure`, `services`, `features`, `app` |
| `shared` | `types` (type-only) | any other layer's runtime code |
| `types` | nothing | — |

Notes on the two refinements this document adds:

- **`src/types`** sits at the very bottom. It is type-only, so "depending on
  it" adds no runtime coupling. Every layer may import it.
- **`shared` → `types`** is type-only, keeping `shared` runtime-standalone
  while still allowing typed public surfaces (e.g. the settings store's
  `Settings` shape).

### 5.2 Forbidden dependencies (hard rules)

1. `domain` → React, SQLite/sql.js, Capacitor, Electron, UI, `infrastructure`,
   `services`, `features`, `app`.
2. `infrastructure` → `services`, `features`, `app`, UI.
3. `features` → other `features`; `features` → `app`.
4. `shared` → runtime code of any project layer (type-only imports of
   `types` allowed).
5. UI components re-implementing business calculations (they call domain /
   services instead).
6. Any business logic branching on the platform (platform selection happens
   only inside `infrastructure/platform` adapters).
7. SQL outside `infrastructure/db`; Capacitor/Electron APIs outside
   `infrastructure/platform` (renderer) or the shells (`electron/`,
   `android/`).
8. React/Zustand inside `services`, `infrastructure`, `domain`.

### 5.3 Practical import guidance

- **Features reach for the lowest layer that solves the need:** domain for
  rules, services for use cases, DAOs (infrastructure) only for simple
  single-aggregate reads/writes; anything coordinating several calls goes
  through a service.
- **Cross-feature reuse** resolves by moving code down: generic → `shared`,
  orchestration → `services`, rules → `domain`, shared types → `types`.
  Never import sideways.
- **Path aliases** (single root alias, layer visible in every import):
  `@/*` → `src/*`, so imports read `@/domain/moisture`,
  `@/features/purchases`, `@/infrastructure/db/dao/purchases.dao`. This
  keeps layer boundaries greppable and lintable (e.g. ESLint
  `no-restricted-imports` per layer) once lint rules are introduced; until
  then, boundaries are enforced by review.

---

## 6. Placement guide — where each kind of code belongs

| Code / concern | Home |
| --- | --- |
| **React pages** | The owning feature's `pages/` (e.g. `features/purchases/pages/NewPurchasePage.tsx`). Composed into routes by `app/router.tsx`. |
| **React components (feature-private)** | The owning feature's `components/`. |
| **React components (generic, reused across features)** | `src/shared/ui/` (e.g. `ConfirmDialog`, chips, dialogs, form controls). |
| **App shell components** (Layout/top-bar, gates wiring, ErrorBoundary) | `src/app/`. |
| **Zustand stores** | With their feature: `features/purchases/store.ts` (open purchase session), `features/security/store.ts` (lock state), `features/device-auth/store.ts`; app-local bootstrap state in `app/state/useAppStore.ts`; the one genuinely app-wide store — settings — in `shared/state/useSettingsStore.ts`. Local `useState` everywhere else. |
| **Paddy calculations** (weights, validation, totals, tins, amounts) | `src/domain/calc/` — pure functions per `DOMAIN_RULES.md` §2–§3. |
| **Moisture calculations** (rates, loss formula, aggregation, adjusted weights, label counts) | `src/domain/moisture/` — rates arrive as parameters (configured values come from Settings via services). |
| **Price logic** | Parsing/validation/shorthand/derivation: `src/domain/price/`. Storage, exact `date+type` lookup, upsert: `infrastructure/db/dao/ricePrices.dao`. Snapshot assembly + no-fallback lookup orchestration: `services/purchase/`. |
| **Purchase logic** | Rules (numbering `PSO-YYYYMM-NNNN`, creation shape, finalize preconditions): `src/domain/purchase/`. Persistence (session, bags, re-sequencing): `infrastructure/db/dao/purchases.dao`. Use cases (create, insert/edit/remove/undo, finalize): `services/purchase/`. UI + session store: `features/purchases/`. |
| **SQLite / sql.js** | `src/infrastructure/db/` only (connection, schema DDL, PRAGMAs, WASM locator). |
| **DAO / data-access** | `src/infrastructure/db/dao/` — small functions returning plain data. |
| **Migrations** | `src/infrastructure/db/migrations/` — idempotent, run at init. |
| **Capacitor** | Renderer-side plugin access wrapped by adapters in `src/infrastructure/platform/` (biometric, device-auth, printers, filesystem). The Android shell + Java plugins live outside `src/` under `android/`. |
| **Electron** | Main process at `electron/main.cjs` (outside `src/`): window, security webPreferences, download interception. Renderer code uses standard web APIs only — zero Electron imports in `src/`. |
| **Printing** | `PrinterService`, receipt builder, ESC/POS formatter, copies, error mapping: `src/services/printing/`. Printer transports (Android Bluetooth, desktop iframe, mock): `src/infrastructure/platform/printers/`. |
| **PDF generation** | `src/services/pdf/` (HTML → raster → jsPDF pipeline, five report kinds, deterministic paths, fonts, file saving). |
| **Backup / restore** | `src/services/backup/` (`.ppbak` format + validation + replace orchestration), byte export/replace from `infrastructure/db`, file dialogs via `infrastructure/platform/fs`. |
| **CSV / XLSX export** | `src/services/export/` (confirmed columns + export rounding). |
| **Security / App Lock** | Verifier hashing/verification, credential validation, throttle policy, lock lifecycle: `src/services/security/`. LockScreen, PatternPad/PIN pad, fingerprint UI, Security settings section, `useSecurityStore`: `features/security/`. Native biometric via `infrastructure/platform/biometric`. |
| **Device authorization** | Activation orchestration + state persistence: `src/services/device-auth/`. Keystore/loopback-server plugin access: `infrastructure/platform/device-auth/`. `DeviceGate` + settings section + `useDeviceAuthStore`: `features/device-auth/`. Gate composition order: `src/app/`. |
| **Settings** | Value/fallback rules (tin formula → 50, valid moisture rates): `src/domain/`. Persistence (settings table): `infrastructure/db/dao/settings.dao`. Loading/updating + single-writer store sync: `services/settings/`. Reactive app-wide state: `shared/state/useSettingsStore.ts`. Editing UI (incl. the V2 moisture-rate controls): `features/settings/`. |
| **Shared UI / components** | `src/shared/ui/`. |
| **Formatting utilities** (MMK, tins, numbers, dates, times — display only) | `src/shared/format/`. Business formulas never round; rounding lives here at presentation/export time. |

---

## 7. Worked examples (how the layers cooperate)

These trace representative flows end-to-end to make the boundaries concrete.
They restate behavior from `DOMAIN_RULES.md` / `PROJECT_SPEC.md`; they do not
redefine it.

### 7.1 Adding a bag weight (save + live totals)

1. `features/purchases` weight input calls the feature store action →
   `services/purchase/insertWeight(purchaseId, rawInput)`.
2. Service validates via `domain/calc.validateWeight` (trim; empty /
   non-numeric / negative / zero rejected — invalid input never stored).
3. Valid → `purchases.dao.insertBag` (next `seq` = MAX+1) with the bag's
   moisture label; **duplicates allowed**.
4. Service recomputes totals with pure functions: gross = Σ weights;
   `moisture_loss = Σ (weight/50 × configuredRate(label))` via
   `domain/moisture` with the Settings-configured rates; `net = gross −
   loss`; `tins = net / lb_per_tin` (unrounded, net-based);
   `amount = tins × snapshot price_per_tin` — then writes them back via DAO.
5. The live UI (BagEntryBar, bag list, totals) renders from the purchase
   store — it never re-derives any of these values.
6. Every mutation persists immediately; there is no separate Save step.

### 7.2 Creating a purchase (price lookup, snapshot, purchase number)

1. `services/purchase/createPurchase(farmerId, date, riceTypeId, label?)`
   asks `ricePrices.dao` for the **exact** `date + rice_type_id` price.
2. No row ⇒ no price ⇒ **no purchase** (no fallback to another date).
3. Found ⇒ `domain/purchase` assembles the record: immutable
   `price_100_tin`/`price_per_tin` snapshot copy, `PSO-YYYYMM-NNNN` number
   (monthly `MAX(suffix)+1` over matching rows via DAO), optional Pattern-1
   label with its derived rate; zero bags ⇒ zero totals.
4. DAO inserts. All later changes to the price table never affect this
   purchase's stored snapshot.

### 7.3 Changing moisture rates in Settings (V2 behavior)

1. `features/settings` Calculation section calls
   `services/settings/updateSetting('moisture_rate_17', …)` (and 18/19/20).
2. Service persists via `settings.dao` and updates
   `shared/state/useSettingsStore` (single-writer rule).
3. New purchases read the new values (via services, passed into
   `domain/moisture` as parameters).
4. Saved purchases are untouched: their totals, `moisture_deduction`
   snapshots, History, PDFs, receipts, and P&L keep the rates snapshotted at
   save/finalize time. No code path re-reads current Settings for old rows.

### 7.4 Finalizing a purchase

1. Preconditions (`domain/purchase`): at least one bag; not already
   finalized; not editing weights (finalized ⇒ read-only).
2. Totals recalculated (as in 7.1) **before** finalize.
3. `services/pdf` renders the voucher from the purchase snapshot, saves it
   through `infrastructure/platform/fs`, returns the path.
4. Only on success: DAO marks `finalized = 1` and stamps `pdf_path`. On
   failure the purchase stays saved and unfinalized (user told
   "Data is still saved").

### 7.5 Printing a receipt

1. `features/purchases` (or the finalized view) calls `PrinterService.print`
   from `services/printing` with the purchase snapshot data.
2. The pure receipt builder produces the fixed-char layout; the ESC/POS
   formatter encodes it.
3. `PrinterService` picks the transport from
   `infrastructure/platform/printers` (Android Bluetooth / desktop iframe /
   mock), streams it `copies` times, and maps failures to bilingual
   `PrinterError`s the UI displays directly.

---

## 8. State management

Default to **local `useState`/hooks**. Zustand appears exactly where state is
genuinely shared across parts of the app:

| Store | Location | Scope |
| --- | --- | --- |
| `useSettingsStore` | `shared/state/` | App-wide: language, theme, font size, company info, tin formula, moisture deduction rates, PDF directory, printer config. Written only by `services/settings`; read by features/services. |
| `usePurchaseStore` | `features/purchases/store.ts` | The open purchase session (farmer, date, type, bags, live totals, price snapshot, Pattern-1 label). |
| `useSecurityStore` | `features/security/store.ts` | Lock state, credentials present, failure counters/cooldown, biometric availability. |
| `useDeviceAuthStore` | `features/device-auth/store.ts` | Device auth state machine (waiting / activated / unsupported / error). |
| `useAppStore` | `app/state/` | Bootstrap only: `dbReady`, `dbError`, `initialize()`. Not consumed by features. |

- Store state shapes come from `src/types` (entities / `Settings`), never
  ad-hoc UI shapes.
- Stores call services (or DAOs for trivial reads) — they contain no
  business rules.
- No Redux. No single global "everything" store. No server-state cache
  library — the dataset is local SQLite.

---

## 9. Testing strategy

Mirrors the reference project's proven layout (`*.test.ts` co-located with
the code, real SQLite for db tests):

- **Domain** — pure unit tests asserting every worked example and rule of
  `DOMAIN_RULES.md` (weight validation, tin conversion, moisture totals and
  patterns, price shorthand parse/format, purchase numbering, P&L rows,
  `formatMoistureLabelCount`). No mocks needed — functions are pure.
- **DAOs / db** — run against a real SQLite (sql.js) engine using the
  `persistence/` test hooks; cover schema constraints, re-sequencing, undo,
  monthly purchase numbers, upserts, snapshot immutability, and the
  confirmed aggregate queries.
- **Services** — thin tests around orchestration edges: finalize ordering
  (PDF first, stamp second; failure keeps data), backup/restore validation,
  throttle policy, receipt-builder and ESC/POS output (golden strings),
  CSV/XLSX rounding.
- **Adapters** — printer `mock` transport, fake file/biometric/device-auth
  adapters implementing the `src/types` ports.
- **Features** — component tests for keyboard-first entry, gate order,
  Settings controls (incl. the V2 moisture-rate editors); overall behavior
  must satisfy the behavioral spec in `PROJECT_SPEC.md` §12.

---

## 10. Platform shells (outside the `src` layering)

The two native shells sit beside `src/` and are the **only** places
platform APIs appear:

- **`electron/main.cjs`** — creates the BrowserWindow with secure
  webPreferences, and intercepts downloads: `.pdf` → `~/PSO/pdf`,
  `.ppbak` → `~/PSO/backup`, anything else → `~/Downloads` (creating
  `~/PSO` on first run). Renderer code in `src/` never imports Electron; it
  uses standard web APIs (browser download, hidden-iframe printing), which
  the shell then intercepts. Desktop DB persistence uses IndexedDB.
- **`android/`** — Capacitor Android shell plus the three Java plugins
  (`BiometricPlugin`, `BluetoothPrinterPlugin`, `DeviceAuthPlugin`) under
  `app/src/main/java/...`. The WebView reaches them only via the
  corresponding `infrastructure/platform` adapters. DB persistence uses the
  Capacitor Filesystem adapter.
- **Web (static hosting)** — HashRouter, sql.js over IndexedDB, browser
  downloads; no shell code.

Adding a platform capability means: define/extend a port in `src/types`,
implement adapters in `infrastructure/platform`, consume it from a service.
Business code never changes.

---

## 11. What this architecture deliberately does NOT include

Per `AGENTS.md` §6/§7 — none of the following may be introduced:

- Clean Architecture ceremony (no use-case interfaces, presenters, mappers
  between identical DTOs), DDD aggregates/value objects, CQRS, Event
  Sourcing, Redux or any other global state framework, dependency-injection
  containers, microservices, repository/interface layers beyond the small
  port interfaces in `src/types`.
- Abstract base classes or "manager/provider" singletons where a plain
  function module suffices.
- Any ORM (raw SQL via sql.js, as in the reference).
- New runtime dependencies without explicit justification in the task.

When in doubt, choose the **plain function + plain data** option that the
reference project already proved sufficient.

---

## 12. Document map

| Question | Document |
| --- | --- |
| *How do I work here? What is forbidden?* | `AGENTS.md` |
| *What is the exact business rule / formula?* | `docs/DOMAIN_RULES.md` (authoritative) |
| *What must V2 do, screen by screen?* | `docs/PROJECT_SPEC.md` |
| *How does the existing app behave?* | `docs/REFERENCE_NOTES.md` |
| *Where does code go, and what may import what?* | `docs/ARCHITECTURE.md` (this file) |

**One-line summary:** pure rules in `domain`, all SQL and platform access in
`infrastructure`, use cases in `services`, screens in `features`, generic
reusable pieces in `shared`, contracts in `types`, composition in `app` —
small focused modules, one-way dependencies, no ceremony.
