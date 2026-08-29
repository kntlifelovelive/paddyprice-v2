# PROJECT_SPEC.md — Paddy Project V2 Feature Requirements

> **Purpose.** This document defines the **complete V2 feature requirements and
> expected user-facing behavior** for Paddy Project V2. V2 is an **architectural
> rebuild** of the existing, working Paddy Project — it must **preserve the
> existing product features and business behavior**, plus the explicitly requested
> change to **Settings-configurable moisture deduction rates**.
>
> **Authoritative sources.** Everything below is grounded strictly in:
> - `docs/DOMAIN_RULES.md` — the authoritative business rules/calculations
>   (including the configurable moisture-deduction rates and their snapshot
>   behavior).
> - `docs/REFERENCE_NOTES.md` — the existing project's observable behavior,
>   features, and structure.
>
> **Rules of engagement.** Do NOT invent behavior, features, thresholds, or
> decimals beyond what the sources confirm. When a requirement is not confirmed,
> it is marked **"Unknown / requires verification"** rather than guessed. No
> application source code is written here; this document is requirements only.
>
> **Document hierarchy.** `DOMAIN_RULES.md` > `PROJECT_SPEC.md` >
> `REFERENCE_NOTES.md`. This file states *what* V2 must do and *how it should
> behave for the user*; `ARCHITECTURE.md` governs *how V2 is structured*.

---

## 1. Product overview

Paddy is an **offline-first rice-purchasing application** used by a rice-buying
office. It records **paddy bag weights** purchased from farmers and calculates
totals in **bags / pounds / tins / MMK amount** (Myanmar currency). It produces
**PDF vouchers**, optional **Bluetooth thermal receipts**, and lets the office
manage **farmers (customers)**, **paddy (rice) types**, **daily rice prices**,
and **per-customer moisture configurations**.

### 1.1 Non-functional / platform requirements (preserved)

- **Fully offline**: the app must run with no cloud and no internet at runtime.
- **One shared codebase** for all supported platforms.
- **Platforms:** Android tablet/phone (Capacitor WebView), Arch Linux desktop
  (Electron AppImage or browser), and a web/browser build (HashRouter, static
  host such as GitHub Pages).
- **Local persistence**: real SQLite locally; desktop/browser via IndexedDB,
  Android via app-data file. `localStorage` is used only for UI pre-render
  preferences, never application data.
- **Myanmar (Unicode) and English bilingual UI**. Default language: Myanmar.
- **Dark theming** with multiple selectable themes; no theme logic inside
  components.
- Localization, theming, and font-size preferences persist and apply on first
  paint (pre-render).

### 1.2 Locking / gating (preserved)

Gate order: **Device Authorization → App Lock → Paddy app**. While a gate is
active, **no routes, layout, or data render**.

---

## 2. Core business rules — V2 requirement summary

> These requirements re-state the authoritative domain rules in user-facing
> terms. The precise formulas, constants, thresholds, and rounding behavior are
> defined in `docs/DOMAIN_RULES.md`; where any tension exists, that file wins.

### 2.1 Weights

- Each bag row has **one weight in pounds**, decimal allowed (e.g. `98`,
  `98.4`, `100.25`).
- **Validation:** empty / non-numeric / negative / zero inputs are **rejected**
  and never stored; valid input is stored as the parsed number.
- **Duplicate weights are allowed.**
- Bags of a purchase are **numbered 1-based, contiguous**; deleting a bag
  **re-numbers** the remaining bags.
- **Undo** removes only the **most recent bag** of the open purchase and
  recalculates totals.
- **Gross pound** = sum of all bag weights; bag count never factors into
  pound/moisture math.

### 2.2 Tin / pound conversion

- **Default: 1 tin = 50 lb.** Configurable in Settings → Calculation
  ("1 Tin = ? Pounds"); the effective value is the stored `tin_formula`,
  falling back to 50 when invalid/missing.
- `tins = net_pound / lb_per_tin`, **unrounded**; payment uses full precision.

### 2.3 Moisture — deduction rates (including the explicit V2 change)

- Allowed moisture labels: **17, 18, 19, 20**, or `None` (no moisture).
- Deduction basis: rate applies **once per 50 lb of actual weight** (lb per
  **50 lb**, never percentages).
- **V2 explicit change — Settings-configurable deduction rates.**
  - **Default values** (must ship exactly): label → lb per 50 lb
    `17 → 1`, `18 → 2`, `19 → 3`, `20 → 4`.
  - The **deduction value for each moisture label is configurable from
    Settings**; the user can change any label's value.
  - Configured values are used by the moisture-loss calculations.
  - `None` / unknown labels have a **fixed 0** deduction (not configurable).
- **Moisture-loss formula** (Pattern 1 and Pattern 2):
  `loss = W / 50 × configuredRate(label)`; `net_pound = gross_pound − loss`.
  Uses actual pound weight — never bag count, never a fixed per-bag weight.
- **Moisture-adjusted display weight:** `W − (W/50 × rate)`; when one label
  applies to every row, the sum of adjusted rows equals the purchase's
  `net_pound` exactly.

### 2.4 Configurable-rate snapshot / history behavior (V2 requirement)

- **The moisture deduction rate configured in Settings is snapshotted when a
  purchase is saved/finalized.** Each saved purchase retains the exact deduction
  rate that was used for its calculation.
- Changing the moisture deduction settings later **does NOT change** existing
  purchases, finalized records, History, Profit/Loss, or previously generated
  results.
- **Historical calculations use the stored snapshot, never the current Settings
  value.**
- The newly configured rate applies **only to purchases created/saved after the
  setting change**.

### 2.5 Prices

- **Myanmar shorthand `A/B`:** `price_100_tin = A × 100,000 + B`;
  `price_per_tin = price_100_tin / 100`. **NOT a fraction.** Validation: trimmed
  input must match `^(\d{1,3})/(\d{1,5})$`, both finite, `price_100_tin > 0`.
- Price is stored per **date + paddy type**; **at most one price per
  (date, type)** — re-saving updates the existing row.
- **Lookup is exact** by `date + rice_type_id` with **no fallback** to another
  date's price; if absent, the purchase cannot be created.
- **Price snapshot:** each purchase copies its price at creation; **later price
  edits never change old purchases**. Reports/PDFs/receipts use the purchase's
  own snapshot.

### 2.6 Purchase numbers

- **Format `PSO-YYYYMM-NNNN`** — `YYYYMM` = purchase-date year+month, `NNNN` =
  zero-padded 4-digit **monthly** sequence.
- Sequence resets to `0001` each calendar month; continues from the highest
  existing suffix within the month.
- **Unique and immutable** after creation.

### 2.7 Finalize / save

- Totals are recomputed (from bag rows) on every add/edit/delete/undo — the rows
  are the single source of truth; a purchase with zero bags has zero totals.
- **Finalize & Save PDF:** generates the voucher PDF **first**, then marks the
  purchase `finalized = 1` and stores the PDF path. Requires **at least one
  bag**. Once finalized, the purchase is **read-only** for weight/moisture
  edits; viewing, re-exporting PDF, and re-printing remain available.
- If PDF generation fails, the purchase **stays saved and unfinalized**.

### 2.8 Profit & Loss reporting

- Lists actual purchase results using **saved snapshots** (never recalculated).
- Rows: date, customer, paddy type, **gross pound**, moisture **label**,
  **deduction (lb)** = stored `moisture_loss`, **moisture breakdown** (Pattern 2
  label-count string, ascending, no "lb" unit, ignoring None), **net pound**,
  **total amount**.
- Summaries: purchase count, total gross, total gross loss, total net, total
  amount.

---

## 3. Feature requirements — navigation & pages

### 3.1 Navigation / layout

- **Top-bar navigation** showing all pages; wide screens show labels inline
  (wrap to fit), narrow screens use a hamburger menu.
- **Scroll-aware top-bar** hide/show animation.
- All routes are inside a shared app `Layout`.

Route set (HashRouter) — **preserve all**:

| Path | Page |
| --- | --- |
| `/` | Dashboard (Home) |
| `/purchase/new` | New Purchase |
| `/purchase/:id` | Purchase (weight entry) |
| `/history` | History |
| `/history/:farmerId` | History (farmer-filtered) |
| `/moisture` | Moisture |
| `/profit-loss` | Profit & Loss |
| `/farmers` | Customers |
| `/rice-types` | Paddy Types |
| `/rice-prices` | Prices |
| `/settings` | Settings |
| unknown path | Dashboard |

### 3.2 Dashboard (Home) requirements

- **Three view modes: Today, Month, Year** with `◀`/`▶` navigation, a date
  picker, and a "Today" shortcut (hidden when already on today); default Today.
- **Paddy-type filter** applies to both summary chips and the table in every
  mode.
- Rows grouped by **Farmer + Paddy Type + Applied Price**; different prices or
  paddy types are never merged; a bold **TOTAL** row closes the table.
- Summary chips: Farmers, Purchases, Bags, Pounds, (Tins), Total Amount. **Pound
  values are net pound** (after moisture).
- Data always read live from stored purchases (no separate summary tables).
- Actions: **Summary PDF** export for the active view/filter, and optional
  80 mm thermal print of the active summary.

### 3.3 Purchases

#### New Purchase page

- **Farmer:** search as-you-type (matches name/address/phone, Myanmar-safe) or
  create-new inline. A farmer must be selected.
- **Date:** defaults to today.
- **Paddy type:** select from **active** paddy types.
- **Price:** auto-loaded via exact `date + type` lookup, shown read-only with
  shorthand + per-tin values. If no price exists, the purchase **cannot be
  created** (no fallback).
- **Moisture label:** pre-filled from an active per-customer+paddy-type moisture
  config (if any); the operator may override for this purchase only.
- On create: navigate to the weight-entry page for the new purchase.

#### Purchase (weight-entry) page

- **Keyboard-first behavior:** Enter inserts a bag (form-wrapped so the Android
  soft keyboard Enter works), Esc clears the input, Ctrl+Z undo last, Ctrl+F →
  Customers, Ctrl+P export PDF. Android shows equivalent visible buttons.
- **Sticky weight input** that stays visible while the bag list grows.
- **Pattern 1 moisture:** a purchase-level label (None/17/18/19/20) that applies
  to **newly inserted rows only**; changing it later does not change existing
  rows; disabled after finalize.
- Bag rows: sequence number, weight, moisture label, per-row edit (weight and
  moisture), delete with confirmation. Totals recalculate after each change.
- Live totals: Bags · Pounds · Tins · **Total Amount (MMK)**.
- Actions: **Undo Last**, **Print Receipt** (thermal), **Export PDF**,
  **Finalize & Save PDF**.
- Print/PDF failures never damage the saved purchase; a failed finalize leaves
  the purchase saved but not finalized.

### 3.4 History

- Records **grouped by purchase date**; per-date header shows that day's
  Farmers / Purchases / Bags / Pounds / Tins / Total. **Newest first** by
  default; one tap toggles oldest-first.
- **Filters:** farmer (route-synced picker), date From/To, paddy-type filter.
- **Exports:** CSV and Excel respecting the active filters.
- Per-purchase actions: view/re-export **PDF**; **delete** with confirmation.
- **Bag Weights PDF** button: exports ALL bag weights of the selected farmer
  (optionally filtered by paddy type) as one paginated PDF.

### 3.5 Other CRUD pages

| Page | Requirements |
| --- | --- |
| **Customers (Farmers)** | CRUD name/address/phone; search by name/address/phone; delete cascades the farmer's purchases + bags (with confirmation) |
| **Paddy Types (Rice Types)** | CRUD name/description; `active` toggle; inactive types excluded from New Purchase paddy-type list |
| **Prices (Rice Prices)** | Add/update price per date + paddy type using the `A/B` shorthand with a live parse preview + formatted totals; upsert semantics (one price per date+type); list sorted date desc; editing pre-fills the shorthand |
| **Moisture** | CRUD of per-customer + per-paddy-type moisture configs (status default/active + label 17–20), used to pre-fill new purchases; configs are defaults only and never retroactively change saved purchases |

### 3.6 Settings

A **master–detail** settings UI (sidebar groups + detail pane on tablet/desktop;
single-pane menu→detail on narrow screens). Groups and capabilities:

- **General:** Language (Myanmar/English), Font Size (Small/Normal/Large/Extra
  Large), Themes (multiple dark + light themes with live preview).
- **Company:** name, address, phone, PDF footer text (Myanmar Unicode).
- **Calculation:** "1 Tin = ? Pounds" (tin formula).
- **PDF & Documents:** PDF directory.
- **Printer Settings:** printer type (None / Mock / Bluetooth Thermal / System),
  paper width (58/80 mm), copies, scan/connect to paired devices, test print.
- **Security (App Lock):** enable/disable, set/change/remove Pattern or PIN,
  fingerprint toggle, auto-lock timeout, Lock Now. (See §6.)
- **Device Authorization:** show/authorize/revoke authorized devices.
- **Backup & Restore:** Backup Now, Restore.

#### 3.6.1 Moisture deduction rates (V2 new requirement)

- A Settings control must allow the user to **view and change the deduction
  value for each moisture label 17/18/19/20** (lb per 50 lb).
- **Defaults shown/used: 17→1, 18→2, 19→3, 20→4.**
- The `None`/unknown deduction (0) is **not** editable.
- Changes affect only purchases created/saved afterward (snapshot rule, §2.4);
  existing purchases, finalized records, History, P&L, and generated documents
  keep their stored snapshot values.

---

## 4. Documents, export, and backup requirements

### 4.1 PDF reports (preserved)

- **Purchase Voucher** (English labels): company letterhead; **Voucher No +
  date + purchase time + generated time**; farmer info block; purchase details
  table including **moisture-adjusted bag weights** and a **TOTAL** row; price
  information; remark lines; **Farmer / Authorized signature lines**; a
  "Thank you for your business" footer plus optional Myanmar company footer text.
- **Bag Weight Details:** ALL bag weights of one farmer (optionally one paddy
  type), paginated (100 rows/page per reference code), compact multi-column
  layout, one table per consecutive paddy type, sequence restarts at 1 per
  paddy type, voucher No(s) in header, purchase date/time from the original
  record.
- **Yearly Report:** annual totals + per-month totals + per-paddy-type totals.
- **Period Summary:** day/month/year summary (per-paddy-type rows + totals),
  filter-aware (used by Dashboard PDF button).
- **Farmer Report:** farmer info, yearly summary, per-paddy-type breakdown,
  purchase list (filterable by year or date range).
- **Myanmar rendering:** reports are rendered via the browser text engine so
  Myanmar Unicode renders correctly; output is rasterized (image-based) — the
  known "no text selection inside PDF" limitation is accepted.
- The voucher and summary footers show a `Generated:` timestamp on each export.

### 4.2 Spreadsheet exports

- **CSV and Excel** with identical columns: Purchase No, Date, Farmer, Address,
  Phone, Rice Type, Price 100 Tin, Price Per Tin, Bags, Pounds, Tins, Amount
  MMK.
- Tins rounded to 3 decimals; amount rounded to whole MMK for export.
- History's CSV/Excel respect the active filters.

### 4.3 Backup & restore

- **Backup file (`.ppbak`):** raw SQLite bytes wrapped with a small manifest
  header (`magic`, `version`, `created_at`).
- **Backup Now** saves a dated backup file through the platform file layer.
- **Restore:** user picks a file; backup files are validated (magic + version);
  raw `.sqlite/.db` files are also accepted; the SQLite header is validated
  before replacing data; requires explicit user confirmation.
- Desktop Electron routes `.pdf` files to `~/PSO/pdf` and `.ppbak` to
  `~/PSO/backup`; other downloads go to `~/Downloads`.

---

## 5. Printing — Bluetooth thermal receipts

- **Printer Settings:** type (None / Mock / Bluetooth Thermal / System), paper
  width (58 mm ≈ 32 chars, 80 mm ≈ 48 chars), copies (1–5), scan/connect to
  paired devices, and a **test print** that verifies Myanmar text rendering.
- **Receipt content:** centered header (PADDY PURCHASE + company block),
  invoice No, purchase date/time, generated time, customer block,
  per-paddy-type rows (type, pound, tin, price shorthand, amount) — **paddy
  types never merged** — per-bag weights, totals (Total Pound, Total Tin, Total
  Amount), remark, "Thank you" footer.
- Receipts are built from **saved purchase records** (snapshot prices).
- Bluetooth (Android) prints via **ESC/POS bytes** to a native Bluetooth
  adapter; desktop prints via the **system print dialog**; "Mock" prints to the
  console (for testing).
- **Myanmar caveat:** ESC/POS text mode renders Myanmar correctly only on
  printers with Myanmar font support — documented as a known limitation in the
  UI.

---

## 6. Security requirements

Step 6 implements the security foundation described in this section and nothing
more — every mechanism below is already-confirmed reference behavior unless
explicitly marked as a V2 requirement or `Unknown / requires verification`. No
new authentication methods, protocols, or encryption schemes may be introduced.

### 6.1 Gate order

**Device Authorization → App Lock → Paddy app.** While a gate is active, no
routes, layout, or data render (only the gate UI itself). **Step 6 must preserve
this exact order.**

- On desktop/web the device gate reports `unsupported` and is **skipped**; the
  app works normally with Pattern/PIN only.
- The lock screen (pattern pad / PIN pad / fingerprint) is the **only** rendered
  UI while locked.

### 6.2 App Lock

- **Master switch** plus credentials: **pattern** (≥ 4 unique dots, indices
  0–8) or **PIN** (4–8 digits), and/or **fingerprint** biometric.
- **Auto-lock timeout options:** immediately / 60 / 300 / 900 seconds.
  **"Lock Now"** locks immediately.
- **Secrets are never stored.** Only a salted verifier is kept:
  `pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>` — PBKDF2-SHA256,
  **100,000 iterations**, 16-byte random salt, **constant-time comparison**.
  Raw pattern/PIN exist only transiently in memory.
- **Lifecycle:** the app starts locked when App Lock is enabled; re-locks after
  backgrounding past the configured timeout (document visibilitychange drives
  background/foreground).
- **Brute-force throttling:** 5 consecutive failures → 30 s cooldown, then
  doubling per extra failure, **capped at 5 minutes**. Applies to pattern and
  PIN unlock paths.
- **Fail-safes:** App Lock enabled with no credentials never locks the user
  out; removing the **last** credential auto-disables App Lock (and the
  biometric helper).

### 6.3 Biometric (fingerprint)

- **Android only**, via the native biometric plugin (system BiometricPrompt).
  Web/desktop report `unsupported_platform` (never faked).
- **Fingerprint only** — Face Lock is not supported (Class-1 face sensors on
  common devices cannot be used by third-party apps).
- Settings surfaces capability states: available / no_hardware / not_enrolled /
  temporarily_unavailable / unsupported_platform / unknown, with a link to open
  the OS enrollment screen.

### 6.4 Device Authorization (Android)

- Android only. A **non-exportable EC P-256 key pair** is generated inside the
  **Android Keystore**; the app's public-key fingerprint (SHA-256) uniquely
  identifies the device. A copied APK on another device **cannot** pass.
- **Activation flow:** app starts a **loopback activation server on port
  18777** → Linux PC installer runs → `adb forward tcp:18777` → `/challenge`
  returns `{fp, nonce}` → PC signs `"1|fp|nonce|timestamp"` (ECDSA-SHA256)
  with an EC P-256 master key protected by `keypass.txt` (AES-256) →
  `POST /activate` with the signed certificate → the native plugin verifies →
  app stores `device.fp` + `device.cert` settings → authorized.
- Authorization state persists as `device.fp` / `device.cert` settings;
  mismatch between DB and Keystore ⇒ unauthorized.
- When unauthorized, the app shows a **device gate** that auto-starts the
  activation server and displays "Waiting for activation…".
- PC installer capabilities (outside the app but part of the product):
  **[1] Install/Activate · [2] Transfer to a new device · [3] Check device ·
  [4] Rebuild APK**; a device registry records
  `fingerprint|timestamp|status|label` (active/revoked/replaced); transfer
  revokes the old device then activates the new one. Installer secrets stay in
  the installer folder and are never committed.

Implementation details **not** confirmed by the reference docs (do not guess;
mark and verify against the reference installer if ever needed): the exact
`keypass.txt` contents/format, the exact certificate byte layout/encoding, and
the installer script internals. The documented flow above (challenge → sign →
verify → persist) is the authoritative behavior.

### 6.5 Installation / activation password file (`keypass.txt`)

- `keypass.txt` is a **PC-side installer secret**, not an application login and
  not part of the app runtime. In the documented Linux installer flow (§6.4) it
  protects the EC P-256 master signing key (**AES-256**) used to sign device
  activation certificates; the installer decrypts/uses it only on the PC during
  Install/Activate, Transfer, and Check operations.
- It is never displayed in the app, never shipped inside the APK, and stays in
  the installer folder where it is **never committed** to git (confirmed
  reference behavior).
- The exact file format/creation process is **Unknown / requires verification**
  (installer-side only; no V2 app code may depend on it).
- V2 adds no new password format, encryption format, file location, or
  activation algorithm — the §6.4 flow is the only confirmed activation path.

### 6.6 Security persistence (confirmed data only)

- **App Lock** stores ONLY salted PBKDF2 verifiers and non-secret configuration
  flags in the existing SQLite `settings` table under `security.*` keys:
  `security.enabled`, `security.pattern`, `security.pin`,
  `security.biometric.fingerprint` (plus legacy combined
  `security.biometric`), `security.timeout`. **Raw PIN/pattern/secrets are never
  stored.** No schema changes were made by the reference and none may be made
  by V2 security code.
- **Device Authorization** persists `device.fp` and `device.cert` settings
  (§6.4); a mismatch between stored DB state and the Keystore key pair means
  unauthorized.
- Whether the failed-attempt/throttle counter survives an app restart (in-memory
  vs persisted) is **Unknown / requires verification**; do not invent either
  behavior without checking the reference.
- Step 6 may implement this through the existing infrastructure ports
  (`src/types`), but this section does not change any code.

### 6.7 Security UI language (V2 requirement — presentation only)

- **Normal application UI** continues to use the existing bilingual Myanmar/
  English language system unchanged.
- **Security Lock / security-critical Android notices** — the lock screen and
  security-related Android installation / activation / lock notices — must be
  displayed in **English**, even when the application's normal UI language is
  Myanmar. They must **not** be routed through the normal application-language
  switch.
  - Note: the reference lock screen currently translates its messages through
    i18n; this is a deliberate, explicit V2 presentation change for
    security-critical text. It changes presentation only — no security logic,
    verification, or storage behavior may change because of it.
- **Lock-screen title (exact):** where the app displays the security lock
  screen/dialog, the primary title must be exactly:

  **`Security Lock`**

  It must not be replaced with a Myanmar translation and no alternative title
  may be invented. (This exact title is not present in the reference project;
  it is a new V2 UI requirement.)

### 6.8 Step 6 scope boundary (security foundation only)

Step 6 implements ONLY the security foundation required by this section. It
must NOT add:

- new authentication methods (no password login, no OTP, no SSO);
- cloud authentication, accounts, or email/password login;
- server-side authentication or remote user management;
- new encryption schemes or new security products/features;
- biometric methods other than the documented fingerprint behavior (§6.3).

Anything beyond the behaviors documented in §6.1–§6.7 must be treated as
`Unknown / requires verification` and confirmed before implementation.

---

## 7. State management requirements

- Exactly the following **shared Zustand stores** (everything else stays local
  component state):

| Store | Holds | Key actions |
| --- | --- | --- |
| `useAppStore` | DB readiness (`dbReady`/`dbError`), full `Settings` object | `initialize` (init DB + settings + theme), `refreshSettings`, `updateSetting`, `setTheme`, `setFontSize` |
| `usePurchaseStore` | The currently open purchase session: `purchaseId`, `summary`, `bags`, `busy`, `error` | `load`, `clear`, `insertWeight`, `editWeight`, `editBagMoisture`, `setPurchaseMoisture`, `removeBag`, `undoLast`, `finalize(pdfPath)` |
| `useSecurityStore` | App Lock config, `locked`, `failedAttempts`, `lockedUntil` | `initialize`, background/foreground lifecycle handlers, `lockNow`, unlock with pattern/PIN/biometric, `recordFailure`, `isThrottled`, config actions (enable, pattern/PIN save/change/remove, biometric toggle, auto-lock timeout) |
| `useDeviceAuthStore` | `state` (`checking\|unsupported\|unauthorized\|authorized`), `fingerprint`, `error` | `initialize`, `beginActivation`, `deactivateLocal` |

- Stores coordinate DAO/services; they do not re-implement business rules. The
  purchase store **re-reads bags + summary from the DB after each mutation**.

---

## 8. Theming, language, and font size

- **Themes:** multiple selectable themes (reference ships 21: dark + light +
  `midnight`); default `tokyo-night`; legacy `light`/`dark` values migrate to
  the default. Themes are **semantic CSS variables** mapped to styling tokens;
  switching re-themes the whole app instantly and **no theme logic lives inside
  components**. A theme picker shows live color-swatch previews.
- **Language:** Myanmar (**default**) / English, toggled in Settings → General;
  bilingual labels as `{my, en}` pairs; selection persisted and applied
  pre-render; default document language `my`.
- **Font size:** Small (0.90) / Normal (1.00) / Large (1.10) / Extra Large
  (1.20) applied as a root font-scale variable; persisted (DB + pre-render
  mirror).
- All three preferences live in the settings store and persist across
  restarts.

---

## 9. Platform integration requirements

- **One shared codebase**; platform differences live behind platform adapters
  and infrastructure code (never branching business logic).
- **Android (Capacitor):** offline WebView build (`androidScheme https`,
  `allowMixedContent false`, no dev server in production); native plugins for
  biometric, Bluetooth printer, and device authorization; app data at
  `<app data>/sqlite/paddyprice.sqlite`; documents under the app Documents
  directory.
- **Desktop (Electron):** secure window (contextIsolation, no node integration,
  sandbox), external links open in the system browser, **download
  interception** (`.pdf` → `~/PSO/pdf`, `.ppbak` → `~/PSO/backup`, others →
  `~/Downloads`) with a "File saved" dialog; packaged as a Linux AppImage.
- **Web:** HashRouter + static-hostable build (base path overridable for
  GitHub Pages).
- **Persistence:** SQLite bytes persisted per platform (IndexedDB on
  desktop/web, Capacitor Filesystem on Android), debounced.

---

## 10. Key end-to-end workflows (must work as described)

1. **Daily purchase run:** set today's prices per paddy type → New Purchase
   (customer/date/type; price auto-loads) → weight entry (Enter per bag,
   moisture label set once) → optional receipt print → Finalize & Save PDF →
   auto-navigates to History.
2. **New customer with moisture defaults:** create customer → add moisture
   config for customer + paddy type (Active + label) → next New Purchase
   pre-fills that label (still overridable).
3. **History / exports:** filter by farmer/range/paddy type → CSV / Excel /
   per-purchase PDF / farmer **Bag Weights PDF**.
4. **Backup / restore:** Backup Now (`.ppbak`) or Restore (file picker →
   validation → confirmation → replace DB).
5. **Printer setup:** choose type + width + copies → scan/connect device →
   test print (verifies Myanmar rendering).
6. **First launch on a new Android device:** install APK → Device
   Authorization screen → USB to Linux PC → installer Install/Activate →
   signed challenge → authorized → App Lock setup → use.
7. **App Lock setup:** enable → set Pattern or PIN (optional fingerprint) →
   choose auto-lock timeout.

---

## 11. Verification & test baseline

- Scripts: lint (zero errors/warnings), typecheck (`tsc --noEmit`), unit tests
  (Vitest + jsdom), build; CI gates on typecheck + tests before deploying the
  web demo.
- The reference suite is **93 tests across 6 files** and serves as a
  **behavioral specification**, not just a suite. Coverage V2 must preserve:
  DB auto-init, price lookup uniqueness, purchase session + **price snapshot
  immutability**, weight entry/totals, farmer history, **Pattern 1 moisture**,
  moisture-config upsert, history netPound regression, tin conversion, totals,
  payment math, weight validation, moisture formula + acceptance scenarios +
  Pattern 2, moisture-adjusted PDF weights, label-count formatting, price
  `A/B` parsing, security verifier (PBKDF2) + validation + constant-time
  equality, and printer receipt/ESC-POS/mock/service tests.
- Database tests run against a **real SQLite engine in memory** (test hooks
  override the WASM locator + persistence adapter).
- **New for V2:** unit tests for the configurable moisture-deduction rates,
  including the **snapshot rule** (§2.4): changing Settings must not alter
  saved/finalized purchases, History, P&L, or generated documents; new rates
  apply only to purchases saved afterwards. All existing moisture tests must
  still pass using the **default** rates.

---

## 12. Known limitations, non-goals, and open items

### 12.1 Preserved known limitations (do not "fix" silently)

- PDFs are **image-based** (rasterized HTML): no text selection inside PDFs.
- Thermal receipts send UTF-8 ESC/POS text; Myanmar renders **only** on
  printers with Myanmar font support (no raster printing); surfaced as a
  documented limitation in the UI.
- Desktop has no direct USB/thermal output; printing uses the system print
  dialog.
- Deleting a rice type keeps historical purchases intact (their stored name
  join may display without a name).
- The reference `README.md` contains stale claims (date-based voucher numbers,
  50 rows/page, duplicate-weight prompt, 10 themes, "53 tests") — the reference
  **code/tests and this spec** win.

### 12.2 Non-goals (placeholders in the reference, not features of V2)

- **Automatic backup, backup listing, and backup cleanup** are placeholders in
  the reference and do nothing; V2 does not implement them unless explicitly
  requested. Only manual **Backup Now** / **Restore** are required.

### 12.3 Unknown / requires verification (do not invent)

- Exact V2 visual design/layout details beyond the behaviors listed here
  (reference styling is a guide, not a pixel spec).
- Any Settings placement/wording for the new moisture-rate controls beyond
  §3.6.1 (must exist, be editable per label, show/keep the defaults).
- Anything not confirmed by `docs/DOMAIN_RULES.md`, this spec, or
  `docs/REFERENCE_NOTES.md` must be flagged and confirmed — never invented.
