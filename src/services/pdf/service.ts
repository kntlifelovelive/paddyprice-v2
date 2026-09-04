/**
 * PDF service entry point (Step 9).
 *
 * Orchestrates the five report kinds:
 *   - Purchase Voucher
 *   - Bag Weight Details
 *   - Yearly Report
 *   - Period Summary
 *   - Farmer Report
 *
 * Each report:
 *   1. Reads only from the services/reports, services/purchase, services/settings,
 *      and DAO layers (no business math here).
 *   2. Builds the exact Input shape expected by the template builder.
 *   3. Calls the template builder → returns an HTML string.
 *   4. Rasterizes via htmlToPdf (browser-based, Myanmar-safe).
 *   5. Persists via the storage adapter (IndexedDB/Filesystem depending on platform).
 *   6. Returns a PdfArtifact (relative path + page count).
 *
 * Zero business calculation duplication: totals come from stored snapshot
 * columns or the existing domain/service helpers. The PDF service never
 * re-computes moisture loss, tins, or MMK amounts.
 *
 * Historical immutability: for existing purchases we always use the
 * snapshotted price_100_tin/price_per_tin and snapshotted moisture_rates
 * (never live Settings). Changing Settings later does not change existing
 * purchase PDFs.
 */
import { htmlToPdf } from './render';
import { buildRelativePath } from './paths';
import {
  buildVoucherNode,
  buildBagWeightNode,
  buildYearlyNode,
  buildPeriodSummaryNode,
  buildFarmerReportNode,
  buildHomeSummaryNode,
} from './templates';
import type {
  VoucherReportInput,
  VoucherBagRow,
  BagWeightReportInput,
  BagWeightPaddyTypeGroup,
  YearlyReportInput,
  YearlyMonthRow,
  YearlyPaddyTypeRow,
  PeriodSummaryInput,
  PeriodSummaryRow,
  FarmerReportInput,
  FarmerReportPaddyTypeRow,
  FarmerReportPurchaseRow,
  HomeSummaryPdfInput,
} from '@/types/pdf';
import { createPdfStorage } from '@/infrastructure/platform/fs';
import type { StoragePort } from '@/types/storage';
import * as loadSettings from '@/services/settings';
import * as purchasesDao from '@/infrastructure/db/dao/purchases';
import * as farmersDao from '@/infrastructure/db/dao/farmers';
import * as riceTypesDao from '@/infrastructure/db/dao/riceTypes';
import { getDatabase } from '@/infrastructure/db/connection';
import { formatTime12Short, todayISO, splitDateTime } from '@/shared/format';
import { moistureAdjustedWeight } from '@/domain/paddy/moisture';
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown';
import type { MoistureRates, MoistureLabelValue } from '@/domain/paddy/moisture';

// Helpers to read settings fields (SettingsService.load returns Settings)
function getCompanyName(db: ReturnType<typeof getDatabase>): string {
  return loadSettings.settingsService.load(db).company_name;
}
function getCompanyAddress(db: ReturnType<typeof getDatabase>): string {
  return loadSettings.settingsService.load(db).company_address;
}
function getCompanyPhone(db: ReturnType<typeof getDatabase>): string {
  return loadSettings.settingsService.load(db).company_phone;
}
function getCompanyFooterText(db: ReturnType<typeof getDatabase>): string {
  return loadSettings.settingsService.load(db).company_footer_text;
}

/** Pdf artifact structure. */
export interface PdfArtifact {
  /** Relative path from the storage root. */
  readonly relativePath: string;
  /** Number of A4 pages in the generated PDF. */
  readonly pageCount: number;
}

/**
 * Load a PurchaseRecord from the DB (snapshot + bags) and enrich with names.
 * The DAO's getPurchase returns { snapshot, bags }.
 */
async function loadPurchaseRecord(
  db: ReturnType<typeof getDatabase>,
  purchaseId: number,
): Promise<{
  snapshot: any;
  bags: Array<{ weight_lb: number; moisture_label: MoistureLabelValue }>;
  farmer_address: string;
  farmer_phone: string;
} | null> {
  const record = purchasesDao.getPurchase(db, purchaseId);
  if (!record) return null;
  const farmer = farmersDao.getFarmer(db, record.snapshot.farmer_id);
  const riceType = riceTypesDao.getRiceType(db, record.snapshot.rice_type_id);
  return {
    snapshot: {
      ...record.snapshot,
      farmer_name: farmer ? farmer.name : '',
      rice_type_name: riceType ? riceType.name : '',
    },
    bags: record.bags,
    farmer_address: farmer ? farmer.address : '',
    farmer_phone: farmer ? farmer.phone : '',
  };
}

/**
 * Save a PDF and return a PdfArtifact.
 * SavedFile only has { path: string }. We return pageCount = 1 as default
 * since the rasterizer doesn't return page count directly.
 */
async function savePdf(
  storage: StoragePort,
  relativePath: string,
  pdfBytes: Uint8Array,
): Promise<PdfArtifact> {
  const saved = await storage.saveBinaryFile(relativePath, pdfBytes);
  return {
    relativePath: saved.path,
    pageCount: 1,
  };
}

/**
 * Build the voucher report input for a purchase — the SAME data the PDF
 * voucher renders. Shared by PDF and PNG export so both outputs are built
 * from one source of truth. Returns null when the purchase is not found.
 */
export async function buildVoucherInput(purchaseId: number): Promise<VoucherReportInput | null> {
  const db = getDatabase();
  const rec = await loadPurchaseRecord(db, purchaseId);
  if (!rec) return null;

  const s = rec.snapshot;
  const company = {
    name: getCompanyName(db),
    address: getCompanyAddress(db),
    phone: getCompanyPhone(db),
    footer_text: getCompanyFooterText(db),
  };

  // Use snapshotted moisture rates from the purchase (historical immutability)
  const rates: MoistureRates = s.moisture_rates;

  const moistureAdjustedBags: VoucherBagRow[] = rec.bags.map((bag, idx) => ({
    seq: idx + 1,
    weight_lb: moistureAdjustedWeight(bag.weight_lb, bag.moisture_label, rates),
  }));

  // Single net-pound decomposition for the voucher — consomes the EXISTING
  // domain result (`decomposeNetPound`), the same source the History table's
  // Tin + Extra Lb columns use. Never independently calculated here.
  const breakdown = decomposeNetPound(s.net_pound, loadSettings.settingsService.lbPerTin(db));

  const { date: datePart } = splitDateTime(s.date);
  // Full ISO timestamp — the voucher's "Generated" line shows date AND time
  // (reference behavior). Output data only; no calculation change.
  const generatedAt = new Date().toISOString();

  return {
    company,
    purchase_no: s.purchase_no,
    date: datePart,
    purchase_time: s.created_at ? formatTime12Short(s.created_at) : '',
    generated_at: generatedAt,
    farmer: { name: s.farmer_name, address: rec.farmer_address, phone: rec.farmer_phone },
    rice_type_name: s.rice_type_name,
    price_per_tin: s.price_per_tin,
    price_100_tin: s.price_100_tin,
    bags: moistureAdjustedBags,
    total_bags: s.total_bags,
    gross_pound: s.gross_pound,
    moisture_loss: s.moisture_loss,
    net_pound: s.net_pound,
    total_tins: s.total_tins,
    // Tin + Extra lb mapped from the SAME domain decomposition — the same
    // source/values the History table's Tin + Extra Lb columns show.
    extra_lb: breakdown.extraLb,
    tins_whole: breakdown.tins,
    total_amount: s.total_amount,
    remarks: '',
    finalized: s.finalized,
  };
}

/**
 * Voucher report generation.
 */
export async function generateVoucherPdf(
  purchaseId: number,
  storage?: StoragePort,
): Promise<PdfArtifact> {
  const input = await buildVoucherInput(purchaseId);
  if (!input) throw new Error('Purchase not found');

  const html = buildVoucherNode(input);
  const pdfBytes = await htmlToPdf(html);
  const relativePath = `voucher/${input.purchase_no}.pdf`;
  return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
}

/**
 * Bag Weight Details report generation.
 */
export async function generateBagWeightDetailsPdf(
  farmerId: number,
  riceTypeId: number | null,
  fromDate: string,
  toDate: string,
  page: number,
  storage?: StoragePort,
): Promise<PdfArtifact> {
  const db = getDatabase();
  const farmer = farmersDao.getFarmer(db, farmerId);
  if (!farmer) throw new Error('Farmer not found');

  // Fetch all purchases for farmer, then filter by date and rice type in JS
  const records = purchasesDao.listPurchases(db, { farmer_id: farmerId });

  // Manual date filtering since PurchaseFilter only has farmer_id
  const dateFiltered = records.filter((r) => {
    const d = r.snapshot.date;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });

  // Filter by rice type if specified
  const filtered = riceTypeId != null
    ? dateFiltered.filter((r) => r.snapshot.rice_type_id === riceTypeId)
    : dateFiltered;

  // Stable sort: date ASC, purchase_no ASC
  filtered.sort((a, b) => {
    if (a.snapshot.date !== b.snapshot.date) return a.snapshot.date < b.snapshot.date ? -1 : 1;
    return a.snapshot.purchase_no < b.snapshot.purchase_no ? -1 : 1;
  });

  const PAGE_SIZE = 100;
  const start = page * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageRecords = filtered.slice(start, end);

  function riceTypeName(id: number | null): string {
    if (id == null) return 'All Types';
    const rt = riceTypesDao.getRiceType(db, id);
    return rt ? rt.name : '';
  }

  if (pageRecords.length === 0) {
    const input: BagWeightReportInput = {
      company: {
        name: getCompanyName(db),
        address: getCompanyAddress(db),
        phone: getCompanyPhone(db),
        footer_text: getCompanyFooterText(db),
      },
      farmer_name: farmer.name,
      farmer_address: farmer.address,
      farmer_phone: farmer.phone,
      groups: [],
      generated_at: todayISO(),
      total_bags: 0,
      total_pound: 0,
      page: page + 1,
      total_pages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    };
    const html = buildBagWeightNode(input);
    const pdfBytes = await htmlToPdf(html);
    const relativePath = `bagweights/farmer${farmerId}_page${page + 1}.pdf`;
    return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
  }

  // Group by consecutive paddy type; bag sequence restarts at 1 for each group
  const groups: BagWeightPaddyTypeGroup[] = [];

  let currentRiceTypeId: number | null = null;
  let currentGroup: BagWeightPaddyTypeGroup | null = null;
  let bagSeq = 1;

  for (const record of pageRecords) {
    const s = record.snapshot;
    const rtId = s.rice_type_id;
    if (rtId !== currentRiceTypeId) {
      const rtName = riceTypeName(rtId);
      currentGroup = {
        rice_type_name: rtName,
        purchase_no: s.purchase_no,
        purchase_date: s.date.split('T')[0],
        purchase_time: s.created_at ? formatTime12Short(s.created_at) : '',
        rows: [],
      };
      groups.push(currentGroup);
      currentRiceTypeId = rtId;
      bagSeq = 1;
    }
    // Each bag in the purchase: compute moisture-adjusted weight using THIS purchase's snapshotted rates
    for (const bag of record.bags) {
      const adjWt = moistureAdjustedWeight(bag.weight_lb, bag.moisture_label, s.moisture_rates);
      currentGroup!.rows.push({
        display_seq: bagSeq++,
        weight_lb: adjWt,
      });
    }
  }

  const totalBags = pageRecords.reduce((sum, r) => sum + r.snapshot.total_bags, 0);
  const totalPound = pageRecords.reduce((sum, r) => sum + r.snapshot.total_pounds, 0);

  const input: BagWeightReportInput = {
    company: {
      name: getCompanyName(db),
      address: getCompanyAddress(db),
      phone: getCompanyPhone(db),
      footer_text: getCompanyFooterText(db),
    },
    farmer_name: farmer.name,
    farmer_address: farmer.address,
    farmer_phone: farmer.phone,
    groups,
    generated_at: todayISO(),
    total_bags: totalBags,
    total_pound: totalPound,
    page: page + 1,
    total_pages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  };

  const html = buildBagWeightNode(input);
  const pdfBytes = await htmlToPdf(html);
  const relativePath = `bagweights/farmer${farmerId}_page${page + 1}.pdf`;
  return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
}

/**
 * Yearly Report generation.
 */
export async function generateYearlyPdf(
  year: number,
  storage?: StoragePort,
): Promise<PdfArtifact> {
  const db = getDatabase();
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  // Use report layer for summaries
  const history = purchasesDao.listPurchases(db, {});
  const yearly = history
    .filter((r) => r.snapshot.date >= fromDate && r.snapshot.date <= toDate);

  if (yearly.length === 0) {
    const input: YearlyReportInput = {
      company: {
        name: getCompanyName(db),
        address: getCompanyAddress(db),
        phone: getCompanyPhone(db),
        footer_text: getCompanyFooterText(db),
      },
      year,
      months: [],
      paddy_types: [],
      totals: { month: 'Total', purchase_count: 0, total_bags: 0, total_pound: 0, total_tin: 0, total_amount: 0 },
      generated_at: todayISO(),
    };
    const html = buildYearlyNode(input);
    const pdfBytes = await htmlToPdf(html);
    const relativePath = `yearly/${year}.pdf`;
    return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
  }

  // Group by month
  const monthMap = new Map<string, { purchase_count: number; total_bags: number; total_pound: number; total_tin: number; total_amount: number }>();
  for (const record of yearly) {
    const s = record.snapshot;
    const monthKey = s.date.slice(0, 7); // YYYY-MM
    const current = monthMap.get(monthKey) ?? { purchase_count: 0, total_bags: 0, total_pound: 0, total_tin: 0, total_amount: 0 };
    monthMap.set(monthKey, {
      purchase_count: current.purchase_count + 1,
      total_bags: current.total_bags + s.total_bags,
      total_pound: current.total_pound + s.total_pounds,
      total_tin: current.total_tin + s.total_tins,
      total_amount: current.total_amount + s.total_amount,
    });
  }

  const months: YearlyMonthRow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      purchase_count: data.purchase_count,
      total_bags: data.total_bags,
      total_pound: data.total_pound,
      total_tin: data.total_tin,
      total_amount: data.total_amount,
    }));

  // Group by rice type
  const typeMap = new Map<number, { rice_type_name: string; total_pound: number; total_tin: number; total_amount: number }>();
  for (const record of yearly) {
    const s = record.snapshot;
    const key = s.rice_type_id;
    const rt = riceTypesDao.getRiceType(db, key);
    const current = typeMap.get(key) ?? { rice_type_name: rt ? rt.name : '', total_pound: 0, total_tin: 0, total_amount: 0 };
    typeMap.set(key, {
      rice_type_name: current.rice_type_name,
      total_pound: current.total_pound + s.total_pounds,
      total_tin: current.total_tin + s.total_tins,
      total_amount: current.total_amount + s.total_amount,
    });
  }

  const paddy_types: YearlyPaddyTypeRow[] = Array.from(typeMap.values())
    .sort((a, b) => a.rice_type_name.localeCompare(b.rice_type_name));

  // Totals across the year
  const totals: YearlyMonthRow = {
    month: 'Total',
    purchase_count: yearly.length,
    total_bags: yearly.reduce((sum, r) => sum + r.snapshot.total_bags, 0),
    total_pound: yearly.reduce((sum, r) => sum + r.snapshot.total_pounds, 0),
    total_tin: yearly.reduce((sum, r) => sum + r.snapshot.total_tins, 0),
    total_amount: yearly.reduce((sum, r) => sum + r.snapshot.total_amount, 0),
  };

  const input: YearlyReportInput = {
    company: {
      name: getCompanyName(db),
      address: getCompanyAddress(db),
      phone: getCompanyPhone(db),
      footer_text: getCompanyFooterText(db),
    },
    year,
    months,
    paddy_types,
    totals,
    generated_at: todayISO(),
  };

  const html = buildYearlyNode(input);
  const pdfBytes = await htmlToPdf(html);
  const relativePath = `yearly/${year}.pdf`;
  return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
}

/**
 * Period Summary report generation (day / month / year).
 */
export async function generatePeriodSummaryPdf(
  period: 'day' | 'month' | 'year',
  value: string,
  storage?: StoragePort,
): Promise<PdfArtifact> {
  const db = getDatabase();

  const allRecords = purchasesDao.listPurchases(db, {});

  // Filter by period
  const filtered = allRecords.filter((r) => {
    const date = r.snapshot.date;
    if (period === 'day') return date === value;
    if (period === 'month') return date.startsWith(value);
    if (period === 'year') return date.startsWith(value);
    return false;
  });

  if (filtered.length === 0) {
    const input: PeriodSummaryInput = {
      company: {
        name: getCompanyName(db),
        address: getCompanyAddress(db),
        phone: getCompanyPhone(db),
        footer_text: getCompanyFooterText(db),
      },
      period,
      period_label: value,
      rows: [],
      totals: { rice_type_name: '', total_bags: 0, total_pound: 0, total_tin: 0, total_amount: 0 },
      generated_at: todayISO(),
    };
    const html = buildPeriodSummaryNode(input);
    const pdfBytes = await htmlToPdf(html);
    const relativePath = `period/${period}/${value.replace(/\//g, '-')}.pdf`;
    return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
  }

  // Group by rice type
  const typeMap = new Map<number, { rice_type_name: string; total_bags: number; total_pound: number; total_tin: number; total_amount: number }>();
  for (const record of filtered) {
    const s = record.snapshot;
    const key = s.rice_type_id;
    const rt = riceTypesDao.getRiceType(db, key);
    const current = typeMap.get(key) ?? { rice_type_name: rt ? rt.name : '', total_bags: 0, total_pound: 0, total_tin: 0, total_amount: 0 };
    typeMap.set(key, {
      rice_type_name: current.rice_type_name,
      total_bags: current.total_bags + s.total_bags,
      total_pound: current.total_pound + s.total_pounds,
      total_tin: current.total_tin + s.total_tins,
      total_amount: current.total_amount + s.total_amount,
    });
  }

  const rows: PeriodSummaryRow[] = Array.from(typeMap.values())
    .sort((a, b) => a.rice_type_name.localeCompare(b.rice_type_name));

  const totals: PeriodSummaryRow = {
    rice_type_name: '',
    total_bags: filtered.reduce((sum, r) => sum + r.snapshot.total_bags, 0),
    total_pound: filtered.reduce((sum, r) => sum + r.snapshot.total_pounds, 0),
    total_tin: filtered.reduce((sum, r) => sum + r.snapshot.total_tins, 0),
    total_amount: filtered.reduce((sum, r) => sum + r.snapshot.total_amount, 0),
  };

  const input: PeriodSummaryInput = {
    company: {
      name: getCompanyName(db),
      address: getCompanyAddress(db),
      phone: getCompanyPhone(db),
      footer_text: getCompanyFooterText(db),
    },
    period,
    period_label: value,
    rows,
    totals,
    generated_at: todayISO(),
  };

  const html = buildPeriodSummaryNode(input);
  const pdfBytes = await htmlToPdf(html);
  const relativePath = `period/${period}/${value.replace(/\//g, '-')}.pdf`;
  return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
}

/**
 * Farmer Report generation.
 */
export async function generateFarmerReportPdf(
  farmerId: number,
  year: number | null,
  storage?: StoragePort,
): Promise<PdfArtifact> {
  const db = getDatabase();
  const farmer = farmersDao.getFarmer(db, farmerId);
  if (!farmer) throw new Error('Farmer not found');

  const fromDate = year != null ? `${year}-01-01` : undefined;
  const toDate = year != null ? `${year}-12-31` : undefined;

  const allRecords = purchasesDao.listPurchases(db, { farmer_id: farmerId });
  const filtered = allRecords.filter((r) => {
    if (fromDate && r.snapshot.date < fromDate) return false;
    if (toDate && r.snapshot.date > toDate) return false;
    return true;
  });

  if (filtered.length === 0) {
    const input: FarmerReportInput = {
      company: {
        name: getCompanyName(db),
        address: getCompanyAddress(db),
        phone: getCompanyPhone(db),
        footer_text: getCompanyFooterText(db),
      },
      farmer: { name: farmer.name, address: farmer.address, phone: farmer.phone },
      period_label: year != null ? String(year) : 'all_time',
      yearly_summary: { record_count: 0, total_pounds: 0, total_tins: 0, total_amount: 0 },
      paddy_types: [],
      purchases: [],
      generated_at: todayISO(),
    };
    const html = buildFarmerReportNode(input);
    const pdfBytes = await htmlToPdf(html);
    const relativePath = `farmer/farmer${farmerId}_${year ?? 'all'}.pdf`;
    return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
  }

  // Yearly summary
  const yearly_summary = filtered.reduce(
    (acc, record) => {
      const s = record.snapshot;
      return {
        record_count: acc.record_count + 1,
        total_pounds: acc.total_pounds + s.total_pounds,
        total_tins: acc.total_tins + s.total_tins,
        total_amount: acc.total_amount + s.total_amount,
      };
    },
    { record_count: 0, total_pounds: 0, total_tins: 0, total_amount: 0 },
  );

  // Per paddy type
  const typeMap = new Map<number, { rice_type_name: string; total_pounds: number; total_tins: number; total_amount: number }>();
  for (const record of filtered) {
    const s = record.snapshot;
    const key = s.rice_type_id;
    const rt = riceTypesDao.getRiceType(db, key);
    const current = typeMap.get(key) ?? { rice_type_name: rt ? rt.name : '', total_pounds: 0, total_tins: 0, total_amount: 0 };
    typeMap.set(key, {
      rice_type_name: current.rice_type_name,
      total_pounds: current.total_pounds + s.total_pounds,
      total_tins: current.total_tins + s.total_tins,
      total_amount: current.total_amount + s.total_amount,
    });
  }

  const paddy_types: FarmerReportPaddyTypeRow[] = Array.from(typeMap.values())
    .sort((a, b) => a.rice_type_name.localeCompare(b.rice_type_name));

  // Purchase list (newest first)
  const purchases: FarmerReportPurchaseRow[] = filtered
    .slice()
    .sort((a, b) => (a.snapshot.date < b.snapshot.date ? 1 : -1))
    .map((record) => {
      const s = record.snapshot;
      const rt = riceTypesDao.getRiceType(db, s.rice_type_id);
      return {
        purchase_no: s.purchase_no,
        date: s.date.split('T')[0],
        rice_type_name: rt ? rt.name : '',
        net_pound: s.net_pound,
        total_tins: s.total_tins,
        total_amount: s.total_amount,
      };
    });

  const input: FarmerReportInput = {
    company: {
      name: getCompanyName(db),
      address: getCompanyAddress(db),
      phone: getCompanyPhone(db),
      footer_text: getCompanyFooterText(db),
    },
    farmer: { name: farmer.name, address: farmer.address, phone: farmer.phone },
    period_label: year != null ? String(year) : 'all_time',
    yearly_summary,
    paddy_types,
    purchases,
    generated_at: todayISO(),
  };

  const html = buildFarmerReportNode(input);
  const pdfBytes = await htmlToPdf(html);
  const relativePath = `farmer/farmer${farmerId}_${year ?? 'all'}.pdf`;
  return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
}

/**
 * Home period-summary PDF (reference ~/paddyprice exportSummaryPdf port).
 *
 * Data comes from the SAME `DashboardView` snapshot aggregators the Home
 * table renders (services/reports.getDashboardView): `groups` are the
 * Farmer × Paddy Type × Applied Price rows and `summary` is their total.
 * No business calculation is duplicated or re-derived here.
 *
 * Filename parity: `paddyprice_report_{fileTag}.pdf` under the configured
 * `summary/` directory (reference: `pdf/reports/summary/paddyprice_report_{fileTag}.pdf`).
 */
export async function generateHomeSummaryPdf(
  input: Omit<HomeSummaryPdfInput, 'company' | 'generated_at'>,
  storage?: StoragePort,
): Promise<PdfArtifact> {
  const db = getDatabase();
  const s = loadSettings.settingsService.load(db);
  const full: HomeSummaryPdfInput = {
    company: {
      name: s.company_name,
      address: s.company_address,
      phone: s.company_phone,
      footer_text: s.company_footer_text,
    },
    ...input,
    generated_at: new Date().toISOString(),
  };
  const html = buildHomeSummaryNode(full);
  const pdfBytes = await htmlToPdf(html);
  const relativePath = buildRelativePath(
    s.pdf_dir,
    'summary',
    `paddyprice_report_${input.file_tag}.pdf`,
  );
  return savePdf(storage ?? createPdfStorage(), relativePath, pdfBytes);
}