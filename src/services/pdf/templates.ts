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
  PeriodSummaryInput,
  VoucherReportInput,
  YearlyReportInput,
} from '@/types/pdf'
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  PAGE_MARGIN_MM,
  footerLines,
} from './render'

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
  root.style.minHeight = `${A4_HEIGHT_MM}mm`
  root.style.padding = `${PAGE_MARGIN_MM}mm`
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
    marginBottom: '10px',
  })
  const h = el(factory, 'h2', title, {
    fontSize: '15px',
    fontWeight: '600',
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
      padding: '3px 0',
      borderBottom: '1px dashed #f3f4f6',
      fontSize: '12px',
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
    fontSize: '20px',
    fontWeight: '700',
  })
  left.appendChild(companyName)
  if (company.address)
    left.appendChild(el(factory, 'div', company.address, { fontSize: '12px', color: '#374151' }))
  if (company.phone)
    left.appendChild(el(factory, 'div', company.phone, { fontSize: '12px', color: '#374151' }))

  const right = el(factory, 'div', null, { textAlign: 'right' })
  right.appendChild(el(factory, 'div', title, { fontSize: '16px', fontWeight: '700' }))
  for (const m of meta) {
    const line = el(factory, 'div', `${m.label}: ${m.value}`, {
      fontSize: '11px',
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

export function buildVoucherNode(
  input: VoucherReportInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  const root = pageRoot(factory)
  root.appendChild(
    headerBar(factory, input.company, 'Purchase Voucher', [
      { label: 'Voucher No', value: input.purchase_no },
      { label: 'Date', value: input.date },
      { label: 'Time', value: input.purchase_time },
      { label: 'Generated', value: input.generated_at },
    ]),
  )

  // Customer block
  root.appendChild(section(factory, 'Customer / Farmer'))
  root.appendChild(
    twoColumnTable(factory, [
      { label: 'Name', value: input.farmer.name },
      { label: 'Address', value: input.farmer.address ?? '' },
      { label: 'Phone', value: input.farmer.phone ?? '' },
    ]),
  )

  // Purchase details
  root.appendChild(section(factory, 'Purchase Details'))
  root.appendChild(
    twoColumnTable(factory, [
      { label: 'Paddy Type', value: input.rice_type_name },
      { label: 'Price / 100 Tin', value: input.price_100_tin.toString() },
      { label: 'Price / 1 Tin', value: input.price_per_tin.toString() },
      { label: 'Total Bags', value: input.total_bags.toString() },
      { label: 'Gross Pound', value: input.gross_pound.toFixed(2) },
      { label: 'Moisture Loss', value: input.moisture_loss.toFixed(2) },
      { label: 'Net Pound', value: input.net_pound.toFixed(2) },
      { label: 'Total Tin', value: input.total_tins.toFixed(3) },
      { label: 'Total Amount', value: input.total_amount.toFixed(0) },
    ]),
  )

  // Bag weight table
  root.appendChild(section(factory, 'Bag Weights (moisture-adjusted)'))
  const table = el(factory, 'table', null, {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  for (const [text, align] of [
    ['#', 'right'],
    ['Weight (lb)', 'right'],
    ['Moisture', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, {
      border: '1px solid #d1d5db',
      padding: '4px 6px',
      background: '#f3f4f6',
      textAlign: align,
    })
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)
  const tbody = el(factory, 'tbody')
  for (const bag of input.bags) {
    const tr = el(factory, 'tr')
    tr.appendChild(
      el(factory, 'td', bag.seq.toString(), {
        border: '1px solid #e5e7eb',
        padding: '3px 6px',
        textAlign: 'right',
      }),
    )
    tr.appendChild(
      el(factory, 'td', bag.weight_lb.toFixed(2), {
        border: '1px solid #e5e7eb',
        padding: '3px 6px',
        textAlign: 'right',
      }),
    )
    tr.appendChild(
      el(
        factory,
        'td',
        bag.moisture_label == null ? '—' : String(bag.moisture_label),
        {
          border: '1px solid #e5e7eb',
          padding: '3px 6px',
          textAlign: 'right',
        },
      ),
    )
    tbody.appendChild(tr)
  }
  // TOTAL row
  const totalTr = el(factory, 'tr')
  totalTr.appendChild(
    el(factory, 'td', 'TOTAL', {
      border: '1px solid #d1d5db',
      padding: '4px 6px',
      textAlign: 'right',
      fontWeight: '700',
    }),
  )
  totalTr.appendChild(
    el(factory, 'td', input.net_pound.toFixed(2), {
      border: '1px solid #d1d5db',
      padding: '4px 6px',
      textAlign: 'right',
      fontWeight: '700',
    }),
  )
  totalTr.appendChild(
    el(factory, 'td', '', {
      border: '1px solid #d1d5db',
      padding: '4px 6px',
    }),
  )
  tbody.appendChild(totalTr)
  table.appendChild(tbody)
  root.appendChild(table)

  if (input.remarks) {
    root.appendChild(section(factory, 'Remarks'))
    root.appendChild(
      el(factory, 'div', input.remarks, {
        fontSize: '12px',
        minHeight: '30px',
        border: '1px solid #e5e7eb',
        padding: '6px',
      }),
    )
  }

  // Signature lines
  const sigWrap = el(factory, 'div', null, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginTop: '24px',
  })
  const farmerSig = el(factory, 'div')
  farmerSig.appendChild(
    el(factory, 'div', '____________________________', {
      borderTop: '1px solid #111827',
      paddingTop: '4px',
      fontSize: '12px',
    }),
  )
  farmerSig.appendChild(
    el(factory, 'div', 'Farmer Signature', { fontSize: '11px', color: '#6b7280' }),
  )
  const authSig = el(factory, 'div')
  authSig.appendChild(
    el(factory, 'div', '____________________________', {
      borderTop: '1px solid #111827',
      paddingTop: '4px',
      fontSize: '12px',
    }),
  )
  authSig.appendChild(
    el(factory, 'div', 'Authorized Signature', { fontSize: '11px', color: '#6b7280' }),
  )
  sigWrap.appendChild(farmerSig)
  sigWrap.appendChild(authSig)
  root.appendChild(sigWrap)

  // Footer
  const lines = [
    { text: 'Thank you for your business', align: 'center' as const },
  ]
  if (input.company.footer_text) {
    lines.unshift({ text: input.company.footer_text, align: 'center' as const })
  }
  root.appendChild(footerLines(lines))

  return root
}

/* ------------------------------------------------------------------ */
/* B. Bag Weight Details                                               */
/* ------------------------------------------------------------------ */

export function buildBagWeightNode(
  input: BagWeightReportInput,
  factory: DocumentFactory = defaultFactory,
): HTMLElement {
  const root = pageRoot(factory)
  root.appendChild(
    headerBar(factory, input.company, 'Bag Weight Details', [
      { label: 'Farmer', value: input.farmer_name },
      { label: 'Generated', value: input.generated_at },
      { label: 'Total Bags', value: input.total_bags.toString() },
      { label: 'Total Pound', value: input.total_pound.toFixed(2) },
    ]),
  )

  if (input.groups.length === 0) {
    root.appendChild(
      el(factory, 'div', 'No bags recorded for this farmer.', {
        fontSize: '12px',
        color: '#6b7280',
      }),
    )
    return root
  }

  for (const group of input.groups) {
    const groupSection = section(
      factory,
      `${group.rice_type_name} (${group.purchase_no} - ${group.purchase_date} ${group.purchase_time})`,
    )
    root.appendChild(groupSection)

    const table = el(factory, 'table', null, {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '11px',
    })
    const thead = el(factory, 'thead')
    const headRow = el(factory, 'tr')
    for (const [text, w, align] of [
      ['#', '15%', 'right'],
      ['Weight (lb)', '45%', 'right'],
      ['', '40%', 'left'],
    ] as const) {
      const th = el(factory, 'th', text, {
        border: '1px solid #d1d5db',
        padding: '3px 4px',
        background: '#f3f4f6',
        textAlign: align,
        width: w,
      })
      headRow.appendChild(th)
    }
    thead.appendChild(headRow)
    table.appendChild(thead)
    const tbody = el(factory, 'tbody')
    for (const row of group.rows) {
      const tr = el(factory, 'tr')
      tr.appendChild(
        el(factory, 'td', row.display_seq.toString(), {
          border: '1px solid #e5e7eb',
          padding: '2px 4px',
          textAlign: 'right',
        }),
      )
      tr.appendChild(
        el(factory, 'td', row.weight_lb.toFixed(2), {
          border: '1px solid #e5e7eb',
          padding: '2px 4px',
          textAlign: 'right',
        }),
      )
      tr.appendChild(
        el(factory, 'td', '', { border: '1px solid #e5e7eb', padding: '2px 4px' }),
      )
      tbody.appendChild(tr)
    }
    table.appendChild(tbody)
    root.appendChild(table)
    root.appendChild(
      el(factory, 'div', null, { height: '8px' }),
    )
  }
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
    fontSize: '11px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  for (const [text, align] of [
    [withMonthColumn ? 'Month' : 'Paddy Type', 'left'],
    ['#', 'right'],
    ['Bags', 'right'],
    ['Pound', 'right'],
    ['Tin', 'right'],
    ['Amount', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, {
      border: '1px solid #d1d5db',
      padding: '4px 6px',
      background: '#f3f4f6',
      textAlign: align,
    })
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
    fontSize: '11px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  for (const [text, align] of [
    ['Paddy Type', 'left'],
    ['Pound', 'right'],
    ['Tin', 'right'],
    ['Amount', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, {
      border: '1px solid #d1d5db',
      padding: '4px 6px',
      background: '#f3f4f6',
      textAlign: align,
    })
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
  return el(factory, 'td', text, {
    border: '1px solid #e5e7eb',
    padding: '3px 6px',
    textAlign: align,
  })
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
    fontSize: '11px',
  })
  const thead = el(factory, 'thead')
  const headRow = el(factory, 'tr')
  for (const [text, align] of [
    ['Voucher', 'left'],
    ['Date', 'left'],
    ['Paddy Type', 'left'],
    ['Net Pound', 'right'],
    ['Tin', 'right'],
    ['Amount', 'right'],
  ] as const) {
    const th = el(factory, 'th', text, {
      border: '1px solid #d1d5db',
      padding: '4px 6px',
      background: '#f3f4f6',
      textAlign: align,
    })
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
