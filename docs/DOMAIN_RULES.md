# DOMAIN_RULES.md — Paddy Business Rules and Calculations (Authoritative)

> **Status.** This is the **authoritative source of truth** for Paddy business
> rules and calculations in V2. V2 domain functions MUST implement the rules
> below exactly and nothing else — no invented formulas, constants, thresholds,
> or rounding.
>
> **Source.** Every rule below was extracted from, and cross-checked against, the
> existing reference project (`~/paddyprice`, commit `4aa3716`) — specifically its
> **unit tests** (`src/utils/*.test.ts`, `src/database/db.test.ts`,
> `src/services/printer/printer.test.ts`) and its **domain/DAO code**
> (`src/utils/calc.ts`, `src/utils/moisture.ts`, `src/utils/price.ts`,
> `src/utils/format.ts`, `src/database/dao.ts`, `src/database/migrations.ts`).
> If a rule is not confirmed by the reference, it is marked
> **"Unknown / requires verification"**.
>
> **Scope.** This file intentionally contains **only business/domain rules**.
> UI, state management, SQLite/DAOs, storage, PDF, printing, and platform details
> are addressed in `REFERENCE_NOTES.md`/`ARCHITECTURE.md` and are out of scope
> here.
>
> **Precedence.** `DOMAIN_RULES.md` > `PROJECT_SPEC.md` > `REFERENCE_NOTES.md`.

---

## 1. Units and core constants

| Constant | Value | Source |
| --- | --- | --- |
| Default tin size | **1 tin = 50 lb** (`DEFAULT_LB_PER_TIN = 50`) | `src/utils/calc.ts`; db default setting `tin_formula = '50'` |
| Tin size configuration | **Configurable** in Settings → Calculation ("1 Tin = ? Pounds"). Any finite value > 0 may be stored; the effective `lb_per_tin` is the stored `tin_formula`, falling back to 50 when invalid/missing. | `useAppStore`/`lbPerTin()`; `usePurchaseStore.lbPerTin()` |
| Moisture deduction basis | **50 lb** (`MOISTURE_BASIS_LB = 50`) — the rate applies once per 50 lb of actual weight | `src/utils/moisture.ts` |
| Allowed moisture labels | `17, 18, 19, 20` (or `null` = "None" / no moisture) | `MOISTURE_LABEL_OPTIONS` |
| Currency | MMK (Myanmar Kyat) | price & format utils |
| Date format | `YYYY-MM-DD` for all business dates (e.g. `date`, `rice_prices.date`, `purchases.date`) | schema + format utils |
| Time of a bag / purchase | `recorded_at` / `created_at` stored as UTC ISO 8601; **displayed** in device-local time | `format.ts` |

Rounding rule used at **presentation/export** time only (never inside formulas):

- Currency display: thousands-separated, up to 2 decimal places, with ` MMK`
  suffix (`Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })`).
- Tin display: up to 3 decimals (`maximumFractionDigits: 3`).
- CSV/Excel export: tins rounded to 3 decimals; amount rounded to whole MMK.
- **Formulas themselves never round tin values** (see §3).

---

## 2. Weight rules

1. **A bag (row) has one weight in pounds (`weight_lb`).** Weights are **decimal
   numbers** (e.g. `98`, `98.4`, `100.25`); there is no configured maximum.
2. **Weight input validation** (the only validation that affects calculations;
   invalid input is rejected and never stored):
   - Input is trimmed.
   - **Empty** (after trim) → invalid (`empty`).
   - **Non-numeric** (not a finite number after `Number(raw)`) → invalid
     (`not-a-number`).
   - **Negative** (`value < 0`) → invalid (`negative`).
   - **Zero** (`value === 0`) → invalid (`zero`).
   - Otherwise valid; the stored value is the parsed number.
   - Confirmed by `calc.test.ts` and `src/utils/calc.ts: validateWeight`.
3. **Duplicate weights are allowed.** Entering the same weight more than once is
   valid (confirmed by db.test "duplicate weights are allowed"). There is no
   duplicate-weight rejection anywhere in the current code.
4. **Bag sequence numbering:** each purchase numbers its bags **1-based,
   contiguous** (`seq`). On creation the next `seq` = `MAX(seq) + 1`. When a bag
   is deleted, remaining bags are **re-sequenced** so numbers stay contiguous in
   order. (Confirmed by `nextBagSeq` and `deleteBag` in `dao.ts`.)
5. **Undo** removes **only the most recent bag** of the open purchase (highest
   `seq`) and recalculates totals. There is no multi-step undo stack.
6. **Gross pound** of a purchase = **sum of all bag `weight_lb`** exactly
   (`computeTotals`, `computeMoistureTotals`). Bag count never factors into
   pound/moisture math.
---

## 3. Tin / pound conversion and totals

**Definition.** `pounds_to_tins(pounds, lb_per_tin) = pounds / lb_per_tin`
(no rounding). Default `lb_per_tin = 50`. (Confirmed by `src/utils/calc.ts` and
`calc.test.ts`.)

Confirmed examples:

| Weight | lb_per_tin | Tins |
| --- | --- | --- |
| 50 lb | 50 | **1** |
| 100 lb | 50 | **2** |
| 99.8 lb | 50 | **1.996** |
| 250 lb | 50 | **5** |
| 298.5 lb | 50 | **5.97** |
| 1 lb | 50 | **0.02** (not rounded to 0) |

**Purchase-level totals** (from the purchase's bag rows, in bag order):

- `total_bags` = count of bag rows.
- `total_pounds` = sum of `weight_lb` (gross pound).
- `total_tins` = `net_pound / lb_per_tin` — i.e. **tin conversion uses NET pound
  when moisture applies**; with no moisture, `net_pound = gross_pound` and this
  equals `gross_pound / lb_per_tin`. (Confirmed by `recalcPurchaseTotals` in
  `dao.ts` and db.test.)
- `total_amount` (MMK) = `total_tins × price_per_tin` — using the **unrounded**
  `total_tins` (full precision). (Confirmed by `computeTotalAmount` and db.test.)

**Pound semantics (important):** `total_pounds` (and the `purchases.total_pounds`
column) stores the **gross** pound weight. The **net** pound is stored separately
in `net_pound`. Any **display or report** of a purchase's pound value in the app
(Dashboard all modes, History, Profit & Loss "Total Net Pound", voucher PDF,
receipt "Total Pound") uses **net pound** after moisture. Gross pound is only
shown explicitly on the Profit & Loss page as "Gross Pound". (Confirmed by the
`history netPound regression` db.test and the Dashboard/Purchase code.)
---

## 4. Moisture calculation and deduction rules

### 4.1 Moisture-label deduction rates (configurable from Settings)

**Default values** (lb deducted per **50 lb** of actual weight) — the same values
that come preconfigured:

| Moisture label | Default deduction rate (lb per **50 lb** of actual weight) |
| --- | --- |
| 17 | 1 |
| 18 | 2 |
| 19 | 3 |
| 20 | 4 |
| None (`null`) / unknown / any other label | **0** (fixed — not configurable, no deduction) |

- **The deduction value for each moisture label (17/18/19/20) is configurable
  from Settings.** The user may change any label's deduction value; the values
  above are the **defaults** and must ship exactly as specified.
- The values are **lb per 50 lb**, never percentages.
- **Configured values are used by the moisture-loss calculations** (§4.2, §4.3).
- `isValidMoistureLabel(label)`: `null` is valid ("None"); `17/18/19/20` valid;
  **anything else invalid** (e.g. `16`, `21`, `0`).
- **NEW V2 requirement** (explicit change): the reference project shipped these
  rates as hard-coded constants (`MOISTURE_LABELS` in `src/utils/moisture.ts`,
  asserted by the "fixed moisture rules" tests). V2 replaces that with
  Settings-configurable values while keeping the same defaults.

### 4.2 The moisture-loss formula

For any weight `W` (lb) with moisture label `L`:

```
rate  = configuredRateForLabel(L)      // the Settings-configured value for label L;
                                       // 0 if L is None/unknown
loss  = W / MOISTURE_BASIS_LB * rate   // MOISTURE_BASIS_LB = 50
```

Worked examples (from `moisture.test.ts`, using the **default** configured
values in §4.1):

| Weight | Label | Loss |
| --- | --- | --- |
| 100 | 17 | 100/50×1 = **2** |
| 9,780 | 17 | **195.6** |
| 50 | 18 | **2** |
| 506 | 18 | **20.24** |
| 50 | 19 | **3** |
| 100 | 19 | **6** |
| 50 | 20 | **4** |
| 100 | 20 | **8** |
| 205 | None | **0** |

Rules for the loss:

- The formula uses the **actual total pound weight** — **never bag count, never a
  fixed per-bag weight**. Same gross weight + different bag counts ⇒ same loss.
- Acceptance scenario (label 18): five bags `97.5 + 103 + 98 + 105 + 102.5 =
  506` lb gross → loss `506/50×2 = 20.24`, net `485.76`. (db.test + moisture.test.)

### 4.3 Purchase-level moisture aggregation (`computeMoistureTotals`)

Given the purchase's bag rows (`weight_lb`, `moisture_label` each):

```
grossPound   = Σ weight_lb
moistureLoss = Σ ( row.weight_lb / 50 × configuredRate(row.moisture_label) )
netPound     = grossPound − moistureLoss
```

(`configuredRate` = the Settings-configured value for the row's label; `0` when
the label is None/unknown.)

Confirmed examples (from db.test, using the **default** configured values in
§4.1):

- Label 18, gross 506 → loss **20.24**, net **485.76**.
- None, gross 205 → loss **0**, net **205**.
- None, gross 500 → loss 0, net 500, tins **10**.
- Label 17, gross 500 → loss 10, net **490**, tins **9.8**.
- Label 18, gross 500 → loss 20, net **480**, tins **9.6**.
- Label 19, gross 500 → loss 30, net **470**, tins **9.4**.
- Label 20, gross 500 → loss 40, net **460**, tins **9.2**.

### 4.4 Purchase-level ("Pattern 1") vs row-level ("Pattern 2") moisture

- **Pattern 1 (purchase-level):** the purchase stores a single `moisture_label`
  and its derived `moisture_deduction` (the rate). At **save time** the current
  label/rate/deduction is stored on the purchase. **Newly inserted bags inherit
  the purchase's current label.** Changing the purchase label later affects
  **only rows inserted afterwards** — existing rows keep their stored labels.
  Confirmed by db.test "new rows inherit the purchase label; changing it affects
  only new rows".
- **Pattern 2 (row-level):** individual bag rows can carry their own moisture
  labels (including `null`). The purchase totals are always recomputed from the
  **per-row labels as they currently stand** (`recalcPurchaseTotals` reads
  `bags.moisture_label`). Mixed labels within one purchase are fully supported
  (moisture.test "PATTERN 2").
- **Historical purchases never change when moisture config or labels change
  later.** The purchase keeps the moisture snapshot taken at save/finalize time
  (db.test "historical purchases remain immutable after moisture config changes").
  This was confirmed in the reference project **while the rates were fixed
  constants**.
- **Snapshot/history behavior when a Settings deduction value changes (V2 rule —
  resolved):**
  - **The moisture deduction rate configured in Settings is snapshotted when a
    purchase is saved/finalized.** Each saved purchase retains the exact
    deduction rate that was used for its calculation.
  - **Changing the moisture deduction settings later does NOT change existing
    purchases, finalized records, History, Profit/Loss, or previously generated
    results.** Historical calculations use the stored snapshot, never the
    current Settings value.
  - **The newly configured rate applies only to purchases created/saved after
    the setting change.**
  - This copies the existing confirmed immutability behavior (historical
    purchases never change when moisture config or labels change later) to the
    now-configurable deduction rates. The reference structure that supports this
    intent is the purchase's stored `moisture_deduction` value (§4.4 Pattern 1
    bullet above), snapshotted at save/finalize time.

### 4.5 Moisture configuration (per customer + paddy type)

- A `moisture_configs` entry pairs a **customer (farmer) + paddy (rice) type**
  with `status` = `'default'` (no deduction) or `'active'` (apply `label`).
- **`label` is only allowed when `status = 'active'`; `label` must be a valid
  moisture label (17–20) when active.** When `status = 'default'`, `label` is
  stored as `null`. Invalid labels are rejected.
- When creating a new purchase for that customer + paddy type, the label from an
  **active** config is **pre-selected** in the UI; the operator may override it
  for that purchase. A `default` config or no config ⇒ no pre-selection
  (starts as `None`).
- Configs are a **default only**; they never retroactively change any saved
  purchase.

### 4.6 Moisture-adjusted display weight (PDF/report presentation)

```
adjusted = W − moistureLossForWeight(W, label) = W − (W/50 × rate)
```

(where `rate` is the **configured** deduction value for the label from §4.1)

- Used to display each bag's weight in the voucher's bag-weight details and the
  Bag Weights PDF.
- **Pattern 1 property:** because the same label applies to every row, the sum
  of the adjusted rows equals the purchase net pound **exactly** (no drift);
  per-row subtraction and proportional distribution are mathematically
  identical. (Confirmed by moisture.test "Pattern 1 sum of adjusted rows equals
  netPound".)
- No moisture ⇒ adjusted = original weight.
---

## 5. Price rules

### 5.1 The Myanmar rice-price shorthand `A/B`

The user enters the price for **100 tins** in the shorthand form `A/B`:

- `18/50000` ⇒ **100 tins = 1,850,000 MMK** ⇒ **1 tin = 18,500 MMK**
- `18/30000` ⇒ **100 tins = 1,830,000 MMK** ⇒ **1 tin = 18,300 MMK**

This is **NOT a mathematical fraction**. The rule is:

```
price_100_tin = A × 100_000 + B
price_per_tin = price_100_tin / 100
```

Validation (`parsePriceFormat`):

- The input is trimmed, then must match `^(\d{1,3})/(\d{1,5})$` (A = 1–3 digits,
  B = 1–5 digits).
- Both parts must be finite numbers.
- `price_100_tin` must be **> 0**, otherwise the input is rejected.
- Rejected when invalid: `'1850000'`, `'18'`, `'18/'`, `'/50000'`, `'abc/def'`,
  `''`. Whitespace around the value is trimmed and accepted.

`formatPriceShorthand(price_100_tin)`: for a positive integer price,
`A = floor(price_100_tin / 100_000)`, `B = price_100_tin % 100_000`, formatted
as `A/BBBBB` (e.g. `1850000 → '18/50000'`). Non-integer or non-positive values
are formatted as a plain number.

Confirmed by `src/utils/price.ts` + `price.test.ts`.

### 5.2 Price storage

- A price is stored for a **specific date (`YYYY-MM-DD`) + paddy-type
  (`rice_type_id`)**: columns `price_100_tin` and `price_per_tin` are both
  stored.
- **Uniqueness:** at most one price per `(date, rice_type_id)`. Upserting the
  same date+type **updates** the existing row (no duplicates). Confirmed by the
  schema `UNIQUE(date, rice_type_id)` + db.test.

### 5.3 Price lookup on the purchase screen

- The price shown when creating a purchase is looked up by **exact
  `date + rice_type_id`**.
- If no price exists for that exact date and type, **no price is shown** and the
  purchase **cannot be created** — there is **NO fallback** to any other date's
  price (e.g. `2026-07-03` returns nothing even when `2026-07-01` exists).
- The price is **read-only** on the purchase screen.

### 5.4 Price snapshot rule (immutability)

- Each purchase **copies** the applied `price_100_tin` and `price_per_tin` into
  its own snapshot columns at creation time.
- **Later edits to the Rice Prices table never change historical purchases.**
- All reports, PDFs, receipts, and P&L figures for a purchase use the purchase's
  **own snapshot**, never the current price table. (Confirmed by the "price
  snapshot" db.test and `receiptBuilder`.)

---

## 6. Purchase rules

### 6.1 Purchase numbers

- **Format:** `PSO-YYYYMM-NNNN`, where `YYYYMM` is the **purchase-date year and
  month** (from the purchase's `date`), and `NNNN` is a **zero-padded, 4-digit
  sequential number**.
- **The sequence is MONTHLY**: it resets to `0001` at the start of each calendar
  month. Within a month it continues from the highest existing suffix, i.e.
  `next = MAX(CAST(SUBSTR(purchase_no, -4) AS INTEGER)) + 1` over purchases
  matching `PSO-YYYYMM-%`, or `0001` when none exist.
- The purchase number is **unique** and **immutable after creation**. (Confirmed
  by db.test "monthly sequence" + "restarts at 0001 for a new month"; the doc
  string in code (line 225) still mentions `PSO-202607-0001` / a daily format but
  the implementation and tests are monthly — **the monthly format is correct**.)

### 6.2 Purchase creation

- A purchase session holds: farmer, date (`YYYY-MM-DD`), paddy type, and an
  **immutable price snapshot** (`price_100_tin` + `price_per_tin`).
- Optional **Pattern-1 moisture label** (`null` = None, or 17–20). If supplied it
  must be a valid label; the purchase stores the label and its derived
  `moisture_deduction` rate.
- At creation the purchase has **zero bags**; all totals are zero
  (`total_bags=0, total_pounds=0, total_tins=0, total_amount=0,
  gross_pound=0, moisture_loss=0, net_pound=0`).
- A farmer and paddy type are required; a price snapshot is required (from the
  §5.3 lookup).

### 6.3 Totals recalculation (single source of truth)

- The purchase's totals are **derived** from its bag rows — they are never
  edited directly.
- On **add bag / edit bag weight / edit bag moisture / delete bag / undo**, the
  totals are recomputed exactly as in §3 and §4.3:
  - `total_bags = row count`
  - `total_pounds = gross_pound = Σ weight_lb`
  - `moisture_loss = Σ (weight_lb / 50 × row rate)`
  - `net_pound = gross_pound − moisture_loss`
  - `total_tins = net_pound / lb_per_tin` (unrounded)
  - `total_amount = total_tins × price_per_tin` (from the snapshot)
- A purchase with **zero bags** has **zero** totals and zero amount.
---

## 7. Finalize / save rules

1. **Finalize** marks a purchase as `finalized = 1` and stores a `pdf_path`
   (the path of the generated voucher PDF). It does **not** change any monetary
   or pound values — they were already persisted by the totals recalculation on
   every mutation.
2. **While a purchase is finalized, its weights and moisture label are
   read-only** (editable actions are disabled in the UI). Re-exporting the PDF
   and re-printing the receipt remain available and use the saved data.
3. **Order of operations on Finalize:** the voucher PDF is generated first; only
   after successful PDF generation is the purchase marked finalized. If PDF
   generation fails, the purchase **stays unfinalized and its data remains
   saved** (the user is told "Data is still saved").
4. Finalize requires **at least one bag** (`bags.length === 0` disables the
   Finalize action). Confirmed by the PurchasePage disable condition.
5. **Save semantics:** bags are saved (with totals recomputed) on every
   add/edit/delete/undo, **before** finalize. Finalize itself is only a state
   transition + PDF-path stamp.

---

## 8. Profit & Loss calculation rules

The Profit & Loss report lists actual purchase results and reads **saved
snapshots** — it never recalculates from current moisture config or price
settings.

Per-purchase row (columns):

- `Date` (purchase date)
- `Farmer`, `Paddy Type`
- `Gross Pound` = `purchases.gross_pound` (sum of bag weights)
- `Label` = `purchases.moisture_label` (or `—` when null)
- `Deduction (lb)` = `purchases.moisture_loss`
- `Moisture Breakdown` = for Pattern 2 mixed-label purchases, a **count only**
  string of the per-row labels (ascending label order), e.g. `17:2, 18:1, 19:1,
  20:1`; rows with `null`/None are ignored; empty when no labeled rows.
- `Net Pound` = `purchases.net_pound`
- `Total Amount` = `purchases.total_amount`

Report-level summaries (sums over all listed purchases):

- `count` = number of purchases
- `Total Gross Pound` = Σ `gross_pound`
- `Total Moisture Loss` = Σ `moisture_loss`
- `Total Net Pound` = Σ `net_pound`
- `Total Amount (MMK)` = Σ `total_amount`

**`Moisture Breakdown` count formatting rule:** `formatMoistureLabelCount(rows)`
counts rows per moisture label `17/18/19/20` (ascending), emits `label:count`
pairs joined by `, `, **without** any "lb" unit and ignoring `null`/None rows;
returns `''` when no labeled rows exist. (Confirmed by `moisture.test.ts`
"formatMoistureLabelCount".)

### 8.1 Moisture Deduction Breakdown (lb) — a deduction-pound table

**It represents deduction pounds, not net pounds.** For each saved purchase
(report row), the P&L moisture deduction breakdown shows the **total moisture
deduction pound** attributed to each moisture label, calculated from the stored
purchase/bag moisture data using the applicable **snapshotted deduction rates**
(§4.4). It never replaces, and must never be confused with, gross pound or net
pound.

Conceptually (consistent with §4.3):

```
netPound      = grossPound − deductionPound
deductionPound = grossPound − netPound   // the two values are separate
```

**Table shape** (one table per purchase, presented with the P&L purchase rows):

| Moisture Label | Deduction Pound |
| -------------- | --------------: |
| 17             |           … lb |
| 18             |           … lb |
| 19             |           … lb |
| 20             |           … lb |
| **Total**      |      **… lb** |

- A **data row appears only for labels that have deduction data** for that
  purchase (i.e. at least one purchase row carries that moisture label, so the
  label contributes deduction pounds). Labels with no moisture data may be
  omitted. The **Total** row always appears.
- The **Total** row equals the sum of all displayed moisture-label deduction
  pounds. The Total is the purchase's deduction pound — it is **NOT** the net
  pound.
- Example: label 17 = 10 lb, label 18 = 20 lb, label 19 = 5 lb
  ⇒ **Deduction Total = 35 lb**. This `35 lb` is the deduction, not the net
  pound.

**Aggregation rule.** Deduction pounds are aggregated from the actual saved
purchase/bag moisture data — never recalculated from net pound:

```
deductionPound(label) = Σ over purchase rows ( weight_lb / 50 × snapshottedDeductionRate(label) )
deductionTotal        = Σ over displayed labels deductionPound(label)
netPound              = grossPound − deductionTotal        // computed independently
```

- Rows with no moisture (`null`, "None") contribute **0** to every label. Their
  weight still counts toward gross pound, but they create no label row and add
  no deduction.
- Pattern 1: the purchase's snapshotted label and rate apply to all rows, so
  the table shows that single label (deduction = gross ÷ 50 × snapshotted rate).
- Pattern 2: each bag row's own `moisture_label` (per-row) places that row's
  deduction under the corresponding label, using that label's snapshotted rate.
- **No intermediate rounding:** calculations carry full precision; rounding
  happens only at presentation/export time (see §1).
- Consistency with §4.3: for any saved purchase, `deductionTotal` equals that
  purchase's stored `moisture_loss` — both are the sum of `W/50 × rate` over
  the same rows.

**Snapshot rule (unchanged from §4.4).** The deduction rates used are the rates
**snapshotted at the purchase's save/finalize time**. Changing Settings later
does not change historical P&L deduction values; new purchases use the newly
configured rates.

**Purchase/farmer identification data.** Each purchase-level deduction table
carries the existing stored identification fields of that purchase (no new
customer entity, no invented fields; the app's terminology is **Farmer**):

- **Purchase / Voucher number** — `purchase_no` (`PSO-YYYYMM-NNNN`, §6.1)
- **Farmer name** — `farmer_name`
- **Purchase date** — `date` (`YYYY-MM-DD`)
- **Paddy (Rice) type** — `rice_type_name`

**Relationship to the existing "Moisture Breakdown" count column.** The
existing P&L row's **"Moisture Breakdown"** value (§8 above) is a **bag-count**
string produced by `formatMoistureLabelCount` — it counts how many rows carry
each label (`17:2, 18:1`) and carries **no "lb" units**. The **Moisture
Deduction Breakdown (lb)** table defined in §8.1 is a **separate, additional**
value: it reports **deduction pounds** per label. These two must not be
conflated; this naming overlap is resolved explicitly here rather than by
silently changing either behavior — the count column is unchanged and remains
count-only, while the deduction table is denominated in pounds.

---

## 9. Other confirmed domain calculations

### 9.1 Farmer / rice-type summaries (reports)

Year-level aggregates are computed from stored purchase rows (no separate
summary tables). Confirmed aggregate formulas (all over the chosen period =
`YYYY-01-01`…`YYYY-12-31`, or by farmer):

- Year summary: `COUNT(DISTINCT farmer_id)` farmers, `COUNT(id)` purchase
  records, `SUM(total_bags)` bags, `SUM(total_pounds)` pounds, `SUM(total_tins)`
  tins, `SUM(total_amount)` amount.
- Monthly summary: same aggregates, `GROUP BY month` (1–12).
- Farmer-year summary: `COUNT(id)` purchase records, `COUNT(DISTINCT date)`
  purchase dates, `SUM(total_pounds)`, `SUM(total_tins)`, `SUM(total_amount)`.
- Farmer paddy-type breakdown: per `rice_type_id`, `COUNT(id)` records,
  `SUM(total_pounds)`, `SUM(total_tins)`, `SUM(total_amount)`.

These use the **stored** snapshot columns; they are plain sums of stored values,
not re-derivations.

### 9.2 Currency/number formatting (presentation, confirmed)

- `formatNumber(v)`: `Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })`.
- `formatMMK(v)`: `formatNumber(v)` + `' MMK'`.
- `formatTins(v)`: `Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })`.
- Dates: `YYYY-MM-DD` in data; displayed as `DD-Mon-YYYY` (e.g. `26-Aug-2026`) or
  `DD/MM/YYYY` depending on surface; times displayed in 12-hour `AM/PM` local
  time.

### 9.3 Not-applicable / out-of-scope for domain

- Whether a purchase "exists", farmer/paddy-type CRUD constraints, and the
  cascading delete of a farmer's purchases are **data rules** (schema), not
  business-calc rules; they are described in `REFERENCE_NOTES.md`.
- No rule was found for automatic rounding of a purchase's stored `total_amount`
  to whole MMK at save time — the stored value is the full-precision product
  `total_tins × price_per_tin`. If V2 observes different behavior at runtime,
  that is "Unknown / requires verification".
