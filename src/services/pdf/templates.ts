/**
 * PDF templates (Step 9) - services/pdf/templates.ts.
 *
 * Each documented report kind has a small pure builder that returns the
 * HTML element ready for rasterization. Templates are browser-touching
 * (they create DOM nodes) but contain NO business calculations - all
 * numbers come from the caller in already-formatted form.
 *
 * For tests, every builder accepts a "document factory" so the templates
 * can run under jsdom without reaching for window globals directly.
 */
import type {
  BagWeightReportInput,
  FarmerReportInput,
  HomeSummaryPdfInput,
  PeriodSummaryInput,
  VoucherReportInput,
  YearlyReportInput,
} from '@/types/pdf'
import {
  A4_WIDTH_MM,
} from './render'
import {
  formatDateDMY,
  formatMMK,
  formatNumber,
  formatTins,
  formatTime12Short,
} from '@/shared/format'

/**
 * Reference PDF date display: DD/MM/YYYY (~/paddyprice/src/utils/format
 * formatDateDMY — the reference output format uses slashes, unlike P2's
 * app-wide DD-MMM-YYYY history display).
 */
function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

export type DocumentFactory = {
  createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
  ): HTMLElementTagNameMap[K]
  createTextNode(text: string): Text
}

const defaultFactory: DocumentFactory = {
  createElement: (tag) => document.createElement(tag),
  createTextNode: (text) => document.createTextNode(text),
}

function el(
  factory: DocumentFactory,
  tag: string,
  text: string | null = null,
  style: Record<string, string> = {},
): HTMLElement {
  const node = factory.createElement(tag as keyof HTMLElementTagNameMap)
  if (text != null) node.appendChild(factory.createTextNode(text))
  for (const [key, value] of Object.entries(style)) {
    ;(node.style as unknown as Record<string, string>)[key] = value
  }
  return node
}

function pageRoot(factory: DocumentFactory): HTMLElement {
  const root = el(factory, 'div')
  root.style.width = `${A4_WIDTH_MM}mm`
  // NO minHeight: see services/pdf/render.ts (buildDocumentSkeleton) for
  // the same reason. Canvas sizes to content -> correct page count.
  // Reference report page margins (~/paddyprice/src/services/pdf.ts
  // buildYearlyReportHtml): padding 36px 44px.
  root.style.padding = '36px 44px'
  root.style.boxSizing = 'border-box'
  root.style.background = '#ffffff'
  root.style.color = '#111827'
  root.style.fontFamily =
    '"Noto Sans Myanmar", "Myanmar Text", system-ui, -apple-system, "Segoe UI", sans-serif'
  return root
}

function section(factory: DocumentFactory, title: string): HTMLElement {
  const wrap = el(factory, 'div', null, {
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '6px',
    marginTop: '20px',
    marginBottom: '10px',
  })
  // Reference report section heading (buildYearlyReportHtml):
  // 16px bold ("ANNUAL SUMMARY" style).
  const h = el(factory, 'h2', title, {
    fontSize: '16px',
    fontWeight: '700',
    margin: '0',
  })
  wrap.appendChild(h)
  return wrap
}

function twoColumnTable(
  factory: DocumentFactory,
  rows: { label: string; value: string }[],
  options: { bold?: boolean } = {},
): HTMLElement {
  const table = el(factory, 'div')
  for (const row of rows) {
    const line = el(factory, 'div', null, {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
      padding: '4px 0',
      borderBottom: '1px dashed #f3f4f6',
      fontSize: '13px',
    })
    const l = el(factory, 'span', row.label, { color: '#6b7280' })
    const v = el(factory, 'span', row.value, {
      color: '#111827',
      textAlign: 'right',
      fontWeight: options.bold ? '600' : '400',
    })
    line.appendChild(l)
    line.appendChild(v)
    table.appendChild(line)
  }
  return table
}

function headerBar(
  factory: DocumentFactory,
  company: { name: string; address: string; phone: string },
  title: string,
  meta: { label: string; value: string }[],
): HTMLElement {
  const wrap = el(factory, 'div', null, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    borderBottom: '2px solid #111827',
    paddingBottom: '10px',
    marginBottom: '12px',
  })
  const left = el(factory, 'div')
  const companyName = el(factory, 'div', company.name, {
    fontSize: '24px',
    fontWeight: '700',
  })
  left.appendChild(companyName)
  if (company.address)
    left.appendChild(el(factory, 'div', company.address, { fontSize: '12px', color: '#374151' }))
  if (company.phone)
    left.appendChild(el(factory, 'div', company.phone, { fontSize: '12px', color: '#374151' }))

  const right = el(factory, 'div', null, { textAlign: 'right' })
  // Reference report title size (buildYearlyReportHtml): 20px bold.
  right.appendChild(el(factory, 'div', title, { fontSize: '20px', fontWeight: '700' }))
  for (const m of meta) {
    const line = el(factory, 'div', `${m.label}: ${m.value}`, {
      fontSize: '12px',
      color: '#6b7280',
    })
    right.appendChild(line)
  }

  wrap.appendChild(left)
  wrap.appendChild(right)
  return wrap
}

/* ------------------------------------------------------------------ */
/* A. Purchase Voucher                                                 */
/* ------------------------------------------------------------------ */

/**
 * Reference-style shared cell styles (~/paddyprice/src/services/pdf.ts):
 * TH = header cells, TD = body cells of the dark-headed bordered tables.
 */
const TH_STYLE = {
  border: '1px solid #111827',
  padding: '7px 10px',
  textAlign: 'left',
  fontWeight: '600',
} as const

const TD_STYLE = {
  border: '1px solid #374151',
  padding: '7px 10px',
} as const

/** `<b>Label:</b> value` line used in the reference INFORMATION block. */
function boldLabelLine(
  factory: DocumentFactory,
  label: string,
  value: string,
): HTMLElement {
  const div = el(factory, 'div')
  div.appendChild(el(factory, 'span', `${label}:`, { fontWeight: '700' }))
  div.appendChild(factory.createTextNode(` ${value}`))
  return div
}

export function buildVoucherNode(
  input: VoucherReportInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  // Reference voucher layout (~/paddyprice/src/services/pdf.ts buildReportHtml):
  // centered letterhead with double rule → centered PADDY PURCHASE VOUCHER
  // title → INFORMATION + voucher meta table → dark-headed purchase table
  // with a Total row → Remark dotted lines → signatures → footer.
  const root = el(factory, 'div', null, {
    width: `${A4_WIDTH_MM}mm`,
    // NO minHeight: canvas sizes to actual content; pagination is driven by
    // services/pdf/render.ts planA4Pages / sliceCanvasForA4.
    padding: '36px 44px',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#111827',
    fontFamily:
      '"Noto Sans Myanmar", "Myanmar Text", system-ui, -apple-system, "Segoe UI", sans-serif',
  })

  // Company letterhead (double bottom border; no letter-spacing — it breaks
  // Myanmar glyph clusters, confirmed reference behavior).
  const letterhead = el(factory, 'div', null, {
    textAlign: 'center',
    paddingBottom: '14px',
    borderBottom: '3px double #111827',
  })
  letterhead.appendChild(
    el(factory, 'div', input.company.name, { fontSize: '24px', fontWeight: '700' }),
  )
  if (input.company.address)
    letterhead.appendChild(
      el(factory, 'div', input.company.address, { fontSize: '12px', marginTop: '2px' }),
    )
  if (input.company.phone)
    letterhead.appendChild(el(factory, 'div', input.company.phone, { fontSize: '12px' }))
  root.appendChild(letterhead)

  // Document title
  root.appendChild(
    el(factory, 'div', 'PADDY PURCHASE VOUCHER', {
      textAlign: 'center',
      margin: '18px 0 4px',
      fontSize: '17px',
      fontWeight: '700',
      letterSpacing: '2px',
    }),
  )

  // Invoice meta: INFORMATION (left) + voucher no & dates (right)
  const metaTable = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '12px',
    fontSize: '13px',
  })
  const metaTr = el(factory, 'tr')
  const metaLeft = el(factory, 'td', null, {
    padding: '4px 0',
    verticalAlign: 'top',
    lineHeight: '1.9',
  })
  metaLeft.appendChild(
    el(factory, 'div', 'INFORMATION', { fontSize: '12px', fontWeight: '700', color: '#374151' }),
  )
  metaLeft.appendChild(boldLabelLine(factory, 'Name', input.farmer.name))
  metaLeft.appendChild(boldLabelLine(factory, 'Phone', input.farmer.phone || '—'))
  metaLeft.appendChild(boldLabelLine(factory, 'Address', input.farmer.address || '—'))
  metaTr.appendChild(metaLeft)
  const metaRight = el(factory, 'td', null, {
    padding: '4px 0',
    textAlign: 'right',
    verticalAlign: 'top',
    lineHeight: '1.9',
  })
  metaRight.appendChild(boldLabelLine(factory, 'Voucher No', input.purchase_no))
  metaRight.appendChild(boldLabelLine(factory, 'Purchase Date', formatDateDisplay(input.date)))
  metaRight.appendChild(boldLabelLine(factory, 'Purchase Time', input.purchase_time || '—'))
  metaRight.appendChild(
    boldLabelLine(
      factory,
      'Generated',
      `${formatDateDisplay(input.generated_at)} ${formatTime12Short(input.generated_at)}`,
    ),
  )
  metaTr.appendChild(metaRight)
  metaTable.appendChild(metaTr)
  root.appendChild(metaTable)

  // Purchase details table (dark header + Total row)
  const table = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '16px',
    fontSize: '13px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  headRow.style.background = '#111827'
  headRow.style.color = '#ffffff'
  const headCells: [string, Record<string, string>][] = [
    ['No', { ...TH_STYLE, width: '36px' }],
    ['Paddy Type', { ...TH_STYLE }],
    ['Bags', { ...TH_STYLE, width: '60px', textAlign: 'center' }],
    ['Pound', { ...TH_STYLE, width: '90px', textAlign: 'right' }],
    ['Tin', { ...TH_STYLE, width: '80px', textAlign: 'right' }],
    ['Extra Lb', { ...TH_STYLE, width: '90px', textAlign: 'right' }],
    ['Price / 100 Tin', { ...TH_STYLE, width: '110px', textAlign: 'right' }],
    ['Amount (MMK)', { ...TH_STYLE, width: '130px', textAlign: 'right' }],
  ]
  for (const [text, style] of headCells) {
    headRow.appendChild(el(factory, 'th', text, style))
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = el(factory, 'tbody')
  const row = el(factory, 'tr')
  const bodyCells: [string, Record<string, string>][] = [
    ['1', { ...TD_STYLE, textAlign: 'center' }],
    [input.rice_type_name, { ...TD_STYLE }],
    [input.total_bags.toString(), { ...TD_STYLE, textAlign: 'center' }],
    [formatNumber(input.net_pound), { ...TD_STYLE, textAlign: 'right' }],
    [formatTins(input.tins_whole), { ...TD_STYLE, textAlign: 'right' }],
    [formatNumber(input.extra_lb), { ...TD_STYLE, textAlign: 'right' }],
    [formatMMK(input.price_100_tin), { ...TD_STYLE, textAlign: 'right' }],
    [formatMMK(input.total_amount), { ...TD_STYLE, textAlign: 'right' }],
  ]
  for (const [text, style] of bodyCells) {
    row.appendChild(el(factory, 'td', text, style))
  }
  tbody.appendChild(row)

  // Total row (grey, bold) — reference structure: colspan-2 label, bags,
  // pound, tin, extra lb, empty price cell, amount.
  const totalRow = el(factory, 'tr', null, { background: '#f3f4f6', fontWeight: '700' })
  const totalLabel = el(factory, 'td', 'Total', { ...TD_STYLE })
  ;(totalLabel as HTMLTableCellElement).colSpan = 2
  totalRow.appendChild(totalLabel)
  totalRow.appendChild(
    el(factory, 'td', input.total_bags.toString(), { ...TD_STYLE, textAlign: 'center' }),
  )
  totalRow.appendChild(
    el(factory, 'td', formatNumber(input.net_pound), { ...TD_STYLE, textAlign: 'right' }),
  )
  totalRow.appendChild(
    el(factory, 'td', formatTins(input.tins_whole), { ...TD_STYLE, textAlign: 'right' }),
  )
  totalRow.appendChild(
    el(factory, 'td', formatNumber(input.extra_lb), { ...TD_STYLE, textAlign: 'right' }),
  )
  totalRow.appendChild(el(factory, 'td', '', TD_STYLE))
  totalRow.appendChild(
    el(factory, 'td', formatMMK(input.total_amount), { ...TD_STYLE, textAlign: 'right' }),
  )
  tbody.appendChild(totalRow)
  table.appendChild(tbody)
  root.appendChild(table)

  // Remark — bold label + two dotted hand-writing lines (always present,
  // reference structure).
  const remark = el(factory, 'div', null, { marginTop: '20px', fontSize: '13px' })
  remark.appendChild(el(factory, 'span', 'Remark:', { fontWeight: '700' }))
  remark.appendChild(
    el(factory, 'div', null, { borderBottom: '1px dotted #9ca3af', height: '22px' }),
  )
  remark.appendChild(
    el(factory, 'div', null, { borderBottom: '1px dotted #9ca3af', height: '22px' }),
  )
  root.appendChild(remark)

  // Signatures — two 220px centered boxes with a top rule
  const sigWrap = el(factory, 'div', null, {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '42px',
    fontSize: '13px',
  })
  for (const label of ['Farmer Signature', 'Authorized Signature']) {
    const box = el(factory, 'div', null, { textAlign: 'center', width: '220px' })
    box.appendChild(
      el(factory, 'div', label, { borderTop: '1px solid #111827', paddingTop: '6px' }),
    )
    sigWrap.appendChild(box)
  }
  root.appendChild(sigWrap)

  // Footer — centered "Thank you for your business" + optional Myanmar line
  const footer = el(factory, 'div', null, {
    textAlign: 'center',
    marginTop: '26px',
    paddingTop: '10px',
    borderTop: '1px solid #d1d5db',
    fontSize: '12px',
    color: '#6b7280',
  })
  footer.appendChild(factory.createTextNode('Thank you for your business'))
  if (input.company.footer_text) {
    footer.appendChild(
      el(factory, 'div', input.company.footer_text, { marginTop: '8px', color: '#374151' }),
    )
  }
  root.appendChild(footer)

  return root
}

/* ------------------------------------------------------------------ */
/* B. Bag Weight Details                                               */
/* ------------------------------------------------------------------ */

export function buildBagWeightNode(
  input: BagWeightReportInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  // Reference Bag Weight Details layout (~/paddyprice/src/services/pdf.ts
  // buildBagWeightsPageHtml): company letterhead (double rule) → BAG WEIGHT
  // DETAILS title → INFORMATION + voucher meta table → one table per rice
  // type with TWO side-by-side No|Weight pairs → Page / Rows footer.
  const root = el(factory, 'div', null, {
    width: `${A4_WIDTH_MM}mm`,
    // NO minHeight: canvas sizes to actual content; pagination is driven by
    // services/pdf/render.ts planA4Pages / sliceCanvasForA4.
    padding: '32px 44px',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#111827',
    fontFamily:
      '"Noto Sans Myanmar", "Myanmar Text", system-ui, -apple-system, "Segoe UI", sans-serif',
  })

  // Company letterhead
  const letterhead = el(factory, 'div', null, {
    textAlign: 'center',
    paddingBottom: '10px',
    borderBottom: '3px double #111827',
  })
  letterhead.appendChild(
    el(factory, 'div', input.company.name, { fontSize: '20px', fontWeight: '700' }),
  )
  root.appendChild(letterhead)

  // Document title
  root.appendChild(
    el(factory, 'div', 'BAG WEIGHT DETAILS', {
      textAlign: 'center',
      margin: '14px 0 2px',
      fontSize: '16px',
      fontWeight: '700',
      letterSpacing: '2px',
    }),
  )

  // Invoice meta: INFORMATION (left) + voucher no & dates (right)
  const metaTable = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '12px',
    fontSize: '13px',
  })
  const metaTr = el(factory, 'tr')
  const metaLeft = el(factory, 'td', null, {
    padding: '4px 0',
    verticalAlign: 'top',
    lineHeight: '1.8',
  })
  metaLeft.appendChild(
    el(factory, 'div', 'INFORMATION', { fontSize: '11px', fontWeight: '700', color: '#374151' }),
  )
  metaLeft.appendChild(boldLabelLine(factory, 'Name', input.farmer_name))
  if (input.farmer_phone)
    metaLeft.appendChild(boldLabelLine(factory, 'Phone', input.farmer_phone))
  if (input.farmer_address)
    metaLeft.appendChild(boldLabelLine(factory, 'Address', input.farmer_address))
  metaTr.appendChild(metaLeft)
  const metaRight = el(factory, 'td', null, {
    padding: '4px 0',
    textAlign: 'right',
    verticalAlign: 'top',
    lineHeight: '1.8',
  })
  const voucherNos = Array.from(new Set(input.groups.map((g) => g.purchase_no)))
  metaRight.appendChild(boldLabelLine(factory, 'Voucher No', voucherNos.join(', ') || '—'))
  metaRight.appendChild(
    boldLabelLine(
      factory,
      'Purchase Date',
      input.groups[0] ? formatDateDisplay(input.groups[0].purchase_date) : '—',
    ),
  )
  metaRight.appendChild(
    boldLabelLine(factory, 'Purchase Time', input.groups[0]?.purchase_time || '—'),
  )
  metaRight.appendChild(
    boldLabelLine(
      factory,
      'Generated',
      `${formatDateDisplay(input.generated_at)} ${formatTime12Short(input.generated_at)}`,
    ),
  )
  metaTr.appendChild(metaRight)
  metaTable.appendChild(metaTr)
  root.appendChild(metaTable)

  if (input.groups.length === 0) {
    root.appendChild(
      el(factory, 'div', 'No bags recorded for this farmer.', {
        fontSize: '12px',
        color: '#6b7280',
        marginTop: '16px',
      }),
    )
  }

  // One table per rice type (consecutive rows of the same type share a table).
  // Rows are laid out in two side-by-side pairs (No|Weight|No|Weight) so the
  // table stays compact instead of stretching across the full page width.
  for (const group of input.groups) {
    root.appendChild(
      el(factory, 'div', `Rice Type: ${group.rice_type_name}`, {
        marginTop: '12px',
        fontSize: '11px',
        fontWeight: '700',
        color: '#374151',
      }),
    )

    const table = el(factory, 'table', null, {
      width: '100%',
      borderCollapse: 'collapse',
      marginTop: '4px',
      fontSize: '12px',
    })
    const thead = el(factory, 'thead')
    const headRow = el(factory, 'tr')
    headRow.style.background = '#111827'
    headRow.style.color = '#ffffff'
    for (const [text, style] of [
      ['No', { ...TH_STYLE, width: '60px' }],
      ['Weight (lb)', { ...TH_STYLE, textAlign: 'right' }],
      ['No', { ...TH_STYLE, width: '60px' }],
      ['Weight (lb)', { ...TH_STYLE, textAlign: 'right' }],
    ] as [string, Record<string, string>][]) {
      headRow.appendChild(el(factory, 'th', text, style))
    }
    thead.appendChild(headRow)
    table.appendChild(thead)

    const half = Math.ceil(group.rows.length / 2)
    const left = group.rows.slice(0, half)
    const right = group.rows.slice(half)
    const tbody = el(factory, 'tbody')
    for (let i = 0; i < left.length; i += 1) {
      const l = left[i]
      const r = right[i]
      const tr = el(factory, 'tr')
      tr.appendChild(
        el(factory, 'td', l.display_seq.toString(), { ...TD_STYLE, textAlign: 'center' }),
      )
      tr.appendChild(
        el(factory, 'td', formatNumber(l.weight_lb), { ...TD_STYLE, textAlign: 'right' }),
      )
      tr.appendChild(
        el(factory, 'td', r ? r.display_seq.toString() : '', { ...TD_STYLE, textAlign: 'center' }),
      )
      tr.appendChild(
        el(factory, 'td', r ? formatNumber(r.weight_lb) : '', { ...TD_STYLE, textAlign: 'right' }),
      )
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    root.appendChild(table)
  }

  // Page footer — "Page x / y" + displayed row range
  const firstNo = input.groups[0]?.rows[0]?.display_seq
  const lastGroup = input.groups[input.groups.length - 1]
  const lastNo = lastGroup?.rows[lastGroup.rows.length - 1]?.display_seq
  const pageFooter = el(factory, 'div', null, {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '14px',
    fontSize: '11px',
    color: '#6b7280',
  })
  pageFooter.appendChild(
    factory.createTextNode(`Page ${input.page ?? 1} / ${input.total_pages ?? 1}`),
  )
  pageFooter.appendChild(
    factory.createTextNode(
      `Rows ${firstNo != null ? firstNo : '—'}–${lastNo != null ? lastNo : '—'}`,
    ),
  )
  root.appendChild(pageFooter)

  return root
}

/* ------------------------------------------------------------------ */
/* C. Yearly Report                                                    */
/* ------------------------------------------------------------------ */

export function buildYearlyNode(
  input: YearlyReportInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  const root = pageRoot(factory)
  root.appendChild(
    headerBar(factory, input.company, `Yearly Report ${input.year}`, [
      { label: 'Generated', value: input.generated_at },
    ]),
  )

  // Per-month
  root.appendChild(section(factory, 'Per Month'))
  root.appendChild(buildSimpleTotalsTable(factory, input.months, true))
  root.appendChild(el(factory, 'div', null, { height: '12px' }))

  // Per paddy type
  root.appendChild(section(factory, 'Per Paddy Type'))
  root.appendChild(buildPaddyTypeTotalsTable(factory, input.paddy_types))
  root.appendChild(el(factory, 'div', null, { height: '12px' }))

  // Year totals
  root.appendChild(section(factory, 'Year Totals'))
  root.appendChild(
    twoColumnTable(
      factory,
      [
        { label: 'Purchases', value: input.totals.purchase_count.toString() },
        { label: 'Total Bags', value: input.totals.total_bags.toString() },
        { label: 'Total Pound', value: input.totals.total_pound.toFixed(2) },
        { label: 'Total Tin', value: input.totals.total_tin.toFixed(3) },
        { label: 'Total Amount', value: input.totals.total_amount.toFixed(0) },
      ],
      { bold: true },
    ),
  )
  return root
}

function buildSimpleTotalsTable(
  factory: DocumentFactory,
  rows: { month: string; purchase_count: number; total_bags: number; total_pound: number; total_tin: number; total_amount: number }[],
  withMonthColumn: boolean,
): HTMLElement {
  const table = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  headRow.style.background = '#111827'
  headRow.style.color = '#ffffff'
  for (const [text, align] of [
    [withMonthColumn ? 'Month' : 'Paddy Type', 'left'],
    ['#', 'right'],
    ['Bags', 'right'],
    ['Pound', 'right'],
    ['Tin', 'right'],
    ['Amount', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, { ...TH_STYLE, textAlign: align })
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)
  const tbody = el(factory, 'tbody')
  for (const r of rows) {
    const tr = el(factory, 'tr')
    tr.appendChild(textCell(factory, withMonthColumn ? r.month : '', 'left'))
    tr.appendChild(textCell(factory, r.purchase_count.toString(), 'right'))
    tr.appendChild(textCell(factory, r.total_bags.toString(), 'right'))
    tr.appendChild(textCell(factory, r.total_pound.toFixed(2), 'right'))
    tr.appendChild(textCell(factory, r.total_tin.toFixed(3), 'right'))
    tr.appendChild(textCell(factory, r.total_amount.toFixed(0), 'right'))
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  return table
}

function buildPaddyTypeTotalsTable(
  factory: DocumentFactory,
  rows: Array<{
    rice_type_name: string
    total_pound?: number
    total_tin?: number
    total_pounds?: number
    total_tins?: number
    total_amount: number
  }>,
): HTMLElement {
  const table = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  headRow.style.background = '#111827'
  headRow.style.color = '#ffffff'
  for (const [text, align] of [
    ['Paddy Type', 'left'],
    ['Pound', 'right'],
    ['Tin', 'right'],
    ['Amount', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, { ...TH_STYLE, textAlign: align })
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)
  const tbody = el(factory, 'tbody')
  for (const r of rows) {
    const tr = el(factory, 'tr')
    tr.appendChild(textCell(factory, r.rice_type_name, 'left'))
    const pound = r.total_pound ?? r.total_pounds ?? 0
    const tin = r.total_tin ?? r.total_tins ?? 0
    tr.appendChild(textCell(factory, pound.toFixed(2), 'right'))
    tr.appendChild(textCell(factory, tin.toFixed(3), 'right'))
    tr.appendChild(textCell(factory, r.total_amount.toFixed(0), 'right'))
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  return table
}

function textCell(
  factory: DocumentFactory,
  text: string,
  align: 'left' | 'right' | 'center',
): HTMLElement {
  // Reference TD style (~/paddyprice/src/services/pdf.ts).
  return el(factory, 'td', text, { ...TD_STYLE, textAlign: align })
}

/* ------------------------------------------------------------------ */
/* D. Period Summary                                                   */
/* ------------------------------------------------------------------ */

export function buildPeriodSummaryNode(
  input: PeriodSummaryInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  const root = pageRoot(factory)
  root.appendChild(
    headerBar(factory, input.company, `Period Summary (${input.period})`, [
      { label: 'Period', value: input.period_label },
      { label: 'Generated', value: input.generated_at },
    ]),
  )

  root.appendChild(section(factory, 'Per Paddy Type'))
  root.appendChild(buildSimpleTotalsTable(factory, input.rows.map((r) => ({
    month: r.rice_type_name,
    purchase_count: 0,
    total_bags: r.total_bags,
    total_pound: r.total_pound,
    total_tin: r.total_tin,
    total_amount: r.total_amount,
  })), false))

  root.appendChild(el(factory, 'div', null, { height: '12px' }))
  root.appendChild(section(factory, 'Totals'))
  root.appendChild(
    twoColumnTable(
      factory,
      [
        { label: 'Bags', value: input.totals.total_bags.toString() },
        { label: 'Pound', value: input.totals.total_pound.toFixed(2) },
        { label: 'Tin', value: input.totals.total_tin.toFixed(3) },
        { label: 'Amount', value: input.totals.total_amount.toFixed(0) },
      ],
      { bold: true },
    ),
  )
  return root
}

/* ------------------------------------------------------------------ */
/* E. Farmer Report                                                    */
/* ------------------------------------------------------------------ */

export function buildFarmerReportNode(
  input: FarmerReportInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  const root = pageRoot(factory)
  root.appendChild(
    headerBar(factory, input.company, 'Farmer Report', [
      { label: 'Period', value: input.period_label },
      { label: 'Generated', value: input.generated_at },
    ]),
  )

  // Farmer block
  root.appendChild(section(factory, 'Farmer'))
  root.appendChild(
    twoColumnTable(factory, [
      { label: 'Name', value: input.farmer.name },
      { label: 'Address', value: input.farmer.address ?? '' },
      { label: 'Phone', value: input.farmer.phone ?? '' },
    ]),
  )

  // Yearly summary
  root.appendChild(section(factory, 'Summary'))
  root.appendChild(
    twoColumnTable(
      factory,
      [
        { label: 'Records', value: input.yearly_summary.record_count.toString() },
        { label: 'Total Pound', value: input.yearly_summary.total_pounds.toFixed(2) },
        { label: 'Total Tin', value: input.yearly_summary.total_tins.toFixed(3) },
        { label: 'Total Amount', value: input.yearly_summary.total_amount.toFixed(0) },
      ],
      { bold: true },
    ),
  )
  root.appendChild(el(factory, 'div', null, { height: '12px' }))

  // Per paddy type
  root.appendChild(section(factory, 'Per Paddy Type'))
  root.appendChild(buildPaddyTypeTotalsTable(factory, input.paddy_types))
  root.appendChild(el(factory, 'div', null, { height: '12px' }))

  // Purchase list
  root.appendChild(section(factory, 'Purchases'))
  const table = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  headRow.style.background = '#111827'
  headRow.style.color = '#ffffff'
  for (const [text, align] of [
    ['Voucher', 'left'],
    ['Date', 'left'],
    ['Paddy Type', 'left'],
    ['Net Pound', 'right'],
    ['Tin', 'right'],
    ['Amount', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, { ...TH_STYLE, textAlign: align })
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)
  const tbody = el(factory, 'tbody')
  for (const p of input.purchases) {
    const tr = el(factory, 'tr')
    tr.appendChild(textCell(factory, p.purchase_no, 'left'))
    tr.appendChild(textCell(factory, p.date, 'left'))
    tr.appendChild(textCell(factory, p.rice_type_name, 'left'))
    tr.appendChild(textCell(factory, p.net_pound.toFixed(2), 'right'))
    tr.appendChild(textCell(factory, p.total_tins.toFixed(3), 'right'))
    tr.appendChild(textCell(factory, p.total_amount.toFixed(0), 'right'))
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  root.appendChild(table)
  return root
}
/* ------------------------------------------------------------------ */
/* F. Home Period Summary (reference buildSummaryReportHtml port)      */
/* ------------------------------------------------------------------ */

/**
 * Reference Home "Export PDF" report (~/paddyprice/src/services/pdf.ts
 * buildSummaryReportHtml): centered company letterhead → DAILY/MONTHLY/YEARLY
 * REPORT title → Period line → dark-headed summary table with a Total row →
 * "Thank you for your business" + Generated timestamp footer.
 *
 * The rows are the Home group rows (Farmer × Paddy Type × Applied Price) and
 * are NEVER merged — each row shows only the Paddy Type (reference behavior).
 * All values are ALREADY-computed snapshot/aggregate numbers; no business
 * calculation happens here (the caller supplies them from the same source the
 * Home table consumes).
 */
export function buildHomeSummaryNode(
  input: HomeSummaryPdfInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  const root = el(factory, 'div', null, {
    width: `${A4_WIDTH_MM}mm`,
    // Reference report page margins (~/paddyprice buildSummaryReportHtml).
    padding: '36px 44px',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#111827',
    fontFamily:
      '"Noto Sans Myanmar", "Myanmar Text", system-ui, -apple-system, "Segoe UI", sans-serif',
  })

  // Company letterhead (double rule; no letter-spacing — Myanmar-safe).
  const letterhead = el(factory, 'div', null, {
    textAlign: 'center',
    paddingBottom: '14px',
    borderBottom: '3px double #111827',
  })
  letterhead.appendChild(
    el(factory, 'div', input.company.name, { fontSize: '24px', fontWeight: '700' }),
  )
  if (input.company.address)
    letterhead.appendChild(
      el(factory, 'div', input.company.address, { fontSize: '12px', marginTop: '2px' }),
    )
  if (input.company.phone)
    letterhead.appendChild(el(factory, 'div', input.company.phone, { fontSize: '12px' }))
  root.appendChild(letterhead)

  // Title — 20px bold with 2px letter-spacing (reference; P2 titles are English).
  const titleWrap = el(factory, 'div', null, { textAlign: 'center', margin: '18px 0 4px' })
  titleWrap.appendChild(
    el(factory, 'div', input.title, {
      fontSize: '20px',
      fontWeight: '700',
      letterSpacing: '2px',
    }),
  )
  root.appendChild(titleWrap)

  // Period line — 14px semibold (reference).
  const periodWrap = el(factory, 'div', null, { textAlign: 'center', margin: '10px 0' })
  periodWrap.appendChild(
    el(factory, 'div', input.period_label, { fontSize: '14px', fontWeight: '600' }),
  )
  root.appendChild(periodWrap)

  const table = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '16px',
    fontSize: '13px',
  })

  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr', null, { background: '#111827', color: '#ffffff' })
  for (const [text, width, align] of [
    ['No', '36px', 'left'],
    ['Paddy Type', '', 'left'],
    ['Bags', '60px', 'right'],
    ['Pound', '90px', 'right'],
    ['Tin', '70px', 'right'],
    ['Extra Lb', '70px', 'right'],
    ['Price / 100 Tin', '140px', 'right'],
    ['Amount (MMK)', '130px', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, { ...TH_STYLE, textAlign: align })
    if (width) th.style.width = width
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = el(factory, 'tbody')
  input.rows.forEach((row, i) => {
    const tr = el(factory, 'tr')
    tr.appendChild(el(factory, 'td', String(i + 1), { ...TD_STYLE, textAlign: 'center' }))
    tr.appendChild(el(factory, 'td', row.rice_type_name, { ...TD_STYLE }))
    tr.appendChild(el(factory, 'td', formatNumber(row.total_bags), { ...TD_STYLE, textAlign: 'right' }))
    tr.appendChild(el(factory, 'td', formatNumber(row.total_pound), { ...TD_STYLE, textAlign: 'right' }))
    tr.appendChild(el(factory, 'td', formatTins(row.total_tin), { ...TD_STYLE, textAlign: 'right' }))
    tr.appendChild(el(factory, 'td', formatNumber(row.total_extra_lb), { ...TD_STYLE, textAlign: 'right' }))
    tr.appendChild(el(factory, 'td', formatMMK(row.price_100_tin), { ...TD_STYLE, textAlign: 'right' }))
    tr.appendChild(el(factory, 'td', formatMMK(row.total_amount), { ...TD_STYLE, textAlign: 'right' }))
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)

  // Total row — reference: greyed bold, price cell blank.
  const tfoot = el(factory, 'tfoot')
  const totalRow = el(factory, 'tr', null, { background: '#f3f4f6', fontWeight: '700' })
  const totalLabel = el(factory, 'td', 'Total', TD_STYLE)
  ;(totalLabel as HTMLTableCellElement).colSpan = 2
  totalRow.appendChild(totalLabel)
  totalRow.appendChild(el(factory, 'td', formatNumber(input.totals.bags), { ...TD_STYLE, textAlign: 'right' }))
  totalRow.appendChild(el(factory, 'td', formatNumber(input.totals.pound), { ...TD_STYLE, textAlign: 'right' }))
  totalRow.appendChild(el(factory, 'td', formatTins(input.totals.tin), { ...TD_STYLE, textAlign: 'right' }))
  totalRow.appendChild(el(factory, 'td', formatNumber(input.totals.extra_lb), { ...TD_STYLE, textAlign: 'right' }))
  totalRow.appendChild(el(factory, 'td', '', TD_STYLE))
  totalRow.appendChild(el(factory, 'td', formatMMK(input.totals.amount), { ...TD_STYLE, textAlign: 'right' }))
  tfoot.appendChild(totalRow)
  table.appendChild(tfoot)

  root.appendChild(table)

  // Footer — reference buildSummaryReportHtml: Thank you + Generated (DD-MMM-YYYY hh:mm AM/PM).
  const footer = el(factory, 'div', null, {
    textAlign: 'center',
    marginTop: '26px',
    paddingTop: '10px',
    borderTop: '1px solid #d1d5db',
    fontSize: '12px',
    color: '#6b7280',
  })
  footer.appendChild(el(factory, 'div', 'Thank you for your business'))
  const generatedAt = `${formatDateDMY(input.generated_at)} ${formatTime12Short(input.generated_at)}`
  footer.appendChild(
    el(factory, 'div', `Generated: ${generatedAt}`, { marginTop: '8px' }),
  )
  root.appendChild(footer)

  return root
}
