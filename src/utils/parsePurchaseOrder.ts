/**
 * Structured PO Parsing Pipeline
 * 8-stage deterministic parser: normalize → segment → header → detect table →
 * extract rows → merge multi-line → validate → filter → totals → output
 */

const LOG_PREFIX = "[parsePO]";
const DEBUG = typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/* ─── Types ─── */
export interface ParsedLineItem {
  sno: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  hsn_code: string | null;
  gst_rate: number;
  gst_amount: number;
  line_total: number;
}

export interface ParsedHeader {
  po_number: string | null;
  po_date: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_gst: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  payment_terms: string | null;
  delivery_date: string | null;
  currency: string | null;
  prepared_by: string | null;
}

export interface ParsedTotals {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grand_total: number;
}

export interface ParsedPurchaseOrder {
  header: ParsedHeader;
  line_items: ParsedLineItem[];
  totals: ParsedTotals;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

interface DocumentSections {
  headerEnd: number;
  tableStart: number;
  tableEnd: number;
  footerStart: number;
}

interface RawRow {
  lineText: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  hasNumeric: boolean;
}

/* ═══════════════════════════════════════════════════════
   STAGE 1 — Text Normalization
   ═══════════════════════════════════════════════════════ */

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[–—]/g, "-")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[ ]{2,}/g, " ");
}

/* ═══════════════════════════════════════════════════════
   STAGE 2 — Document Segmentation
   ═══════════════════════════════════════════════════════ */

const TABLE_HEADER_KEYWORDS = [
  "description", "item", "qty", "quantity", "nos",
  "unit price", "price", "amount", "rate", "total",
  "sl no", "s.no", "sno", "sr no", "particulars", "hsn",
];

const FOOTER_KEYWORDS = [
  "taxable value", "net value", "total value", "grand total",
  "cgst", "sgst", "igst", "gst", "tax amount",
  "prepared by", "manager purchase", "authorized",
  "terms and conditions", "notes", "remarks",
  "for and on behalf", "signature", "accepted by",
  "bank details", "declaration",
];

function isTableHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  let matchCount = 0;
  for (const kw of TABLE_HEADER_KEYWORDS) {
    if (lower.includes(kw)) matchCount++;
  }
  if (line.includes("\t")) {
    const cells = line.split("\t").map((c) => c.trim().toLowerCase());
    const headerish = cells.some((c) =>
      /^(desc|item|particular|s\.?no|sr|qty|quantity|rate|price|amount|hsn|uom|unit)$/i.test(c) ||
      TABLE_HEADER_KEYWORDS.some((kw) => c.includes(kw))
    );
    if (headerish && cells.length >= 2) return true;
  }
  return matchCount >= 2;
}

function isFooterLine(line: string): boolean {
  const lower = line.toLowerCase();
  return FOOTER_KEYWORDS.some(kw => lower.includes(kw));
}

function detectDocumentSections(lines: string[]): DocumentSections {
  let tableStart = -1;
  let tableEnd = lines.length;
  let headerEnd = 0;
  let footerStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (tableStart < 0 && isTableHeaderLine(lines[i])) {
      tableStart = i;
      headerEnd = i;
      if (DEBUG) console.log(`${LOG_PREFIX} Table header detected at line ${i}: "${lines[i].slice(0, 80)}"`);
      break;
    }
  }

  if (tableStart < 0) {
    const tabLines = lines.filter((l) => l.includes("\t") && l.split("\t").filter(Boolean).length >= 3);
    if (tabLines.length >= 1 && tabLines.length >= Math.ceil(lines.length * 0.25)) {
      headerEnd = 0;
      tableStart = 0;
      tableEnd = lines.length;
      footerStart = lines.length;
      if (DEBUG) console.log(`${LOG_PREFIX} Tabular sheet detected; parsing all ${lines.length} lines as items`);
      return { headerEnd, tableStart, tableEnd, footerStart };
    }
    headerEnd = Math.min(lines.length, 15);
    tableStart = Math.min(headerEnd, Math.max(0, lines.length - 1));
    tableEnd = lines.length;
    footerStart = lines.length;
    if (tableStart >= tableEnd && lines.length > 0) {
      tableStart = 0;
      headerEnd = 0;
    }
    if (DEBUG) console.log(`${LOG_PREFIX} No explicit table header; table region lines ${tableStart}–${tableEnd}`);
    return { headerEnd, tableStart, tableEnd, footerStart };
  }

  for (let i = tableStart + 1; i < lines.length; i++) {
    if (isFooterLine(lines[i])) {
      tableEnd = i;
      footerStart = i;
      if (DEBUG) console.log(`${LOG_PREFIX} Table end / footer start at line ${i}: "${lines[i].slice(0, 80)}"`);
      break;
    }
  }

  return { headerEnd, tableStart, tableEnd, footerStart };
}

/* ═══════════════════════════════════════════════════════
   STAGE 3 — Header Field Extraction
   ═══════════════════════════════════════════════════════ */

const REGEX_DATE = /(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/;
const REGEX_ISO_DATE = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/;
const REGEX_GST = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i;
const REGEX_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const REGEX_PHONE = /(?:\+91[\s-]?)?[6-9]\d{9}/;

/** Parse numeric value; strip commas and leading zeros so values are stored as proper numbers. */
function toNum(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/,/g, "").replace(/[^0-9.-]/g, "").replace(/^0+(?=\d)/, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const MONTH_NAMES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseDate(s: string | undefined | null): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const iso = trimmed.match(REGEX_ISO_DATE);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const d = trimmed.match(REGEX_DATE);
  if (d) {
    const [, day, month, year] = d;
    const y = year.length === 2 ? (parseInt(year, 10) < 50 ? "20" + year : "19" + year) : year;
    return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const mon = trimmed.match(/^(\d{1,2})[-.\s]+([A-Za-z]{3,9})[-.\s]+(\d{2,4})$/);
  if (mon) {
    const day = mon[1].padStart(2, "0");
    const monthKey = mon[2].toLowerCase().slice(0, 3);
    const monthNum = MONTH_NAMES[monthKey];
    if (monthNum) {
      const yr = mon[3].length === 2 ? (parseInt(mon[3], 10) < 50 ? "20" + mon[3] : "19" + mon[3]) : mon[3];
      return `${yr}-${monthNum}-${day}`;
    }
  }
  return null;
}

function findFieldValue(lines: string[], patterns: RegExp[]): string | null {
  for (const line of lines) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m) return (m[1] || m[2] || "").trim();
    }
  }
  return null;
}

function extractHeaderFields(lines: string[], headerEnd: number): ParsedHeader {
  const headerLines = lines.slice(0, Math.max(headerEnd, 20));
  const allText = headerLines.join("\n");

  const po_number = findFieldValue(headerLines, [
    /PO\s*(?:No|Number|#)?[\s:.-]*([A-Za-z0-9/-]{3,30})/i,
    /(?:Purchase\s*Order|Order)\s*(?:No|Number|#)?[\s:.-]*([A-Za-z0-9/-]{3,30})/i,
    /(?:Indent|Work\s*Order|Ref)\s*(?:No|#)?[\s:.-]*([A-Za-z0-9/-]{3,30})/i,
  ]);

  const poDateRaw = findFieldValue(headerLines, [
    /(?:PO\s*Date|Order\s*Date|Date)\s*[:-]?\s*([\d/. A-Za-z-]+)/i,
  ]);
  const po_date = parseDate(poDateRaw);

  const deliveryDateRaw = findFieldValue(headerLines, [
    /Delivery\s*Date\s*[:-]?\s*([\d/. A-Za-z-]+)/i,
    /Due\s*Date\s*[:-]?\s*([\d/. A-Za-z-]+)/i,
  ]);
  const delivery_date = parseDate(deliveryDateRaw);

  const currency = findFieldValue(headerLines, [
    /Currency\s*[:-]?\s*([A-Za-z ]+)/i,
  ]);

  const payment_terms = findFieldValue(headerLines, [
    /Payment\s*Terms?\s*[:-]?\s*(.*)/i,
  ]);

  const prepared_by = findFieldValue(headerLines, [
    /Prepared\s*by\s*[:-]?\s*(.*)/i,
  ]);

  const customer_name =
    findFieldValue(headerLines, [
      /(?:Vendor|Supplier|Company|Customer|Party\s*Name|Bill\s*To|Buyer|FROM|Issued\s*By|Purchaser)\s*[:-]?\s*(.+)/i,
      /(?:Billing\s*Address|Bill\s*Address)\s*[:-]?\s*(.+)/i,
    ]) ??
    (headerLines.slice(0, Math.min(headerLines.length, 20)).find(
      (line) =>
        /(?:Pvt\.?\s*Ltd|Private\s*Limited|Limited|Industries|Corporation|Chemicals|LLP|LTD\.?)\b/i.test(line) &&
        line.length < 120 &&
        !/Super\s*Print|Super\s*Screen/i.test(line),
    ) ?? null);

  const addressMatch = allText.match(/(?:Address|Delivery\s*Address|Bill\s*To)\s*[:-]?\s*([^\n]+(?:\n(?!\s*(?:GST|Phone|Contact|PO|Date))[^\n]+)*)/i);
  const customer_address = addressMatch ? addressMatch[1].replace(/\n/g, " ").trim().slice(0, 500) : null;

  const gstMatch = allText.match(REGEX_GST);
  const customer_gst = gstMatch ? gstMatch[0].toUpperCase() : null;

  const contact_person = findFieldValue(headerLines, [
    /(?:Contact\s*Person|Attn|Attention)\s*[:-]?\s*(.+)/i,
  ]);

  const phoneMatch = allText.match(REGEX_PHONE);
  const phone = phoneMatch ? phoneMatch[0].trim() : null;

  const emailMatch = allText.match(REGEX_EMAIL);
  const email = emailMatch ? emailMatch[0].trim() : null;

  return {
    po_number, po_date, customer_name, customer_address, customer_gst,
    contact_person, phone, email, payment_terms, delivery_date,
    currency, prepared_by,
  };
}

/* ═══════════════════════════════════════════════════════
   STAGE 4 — Table Boundary Detection (uses sections)
   ═══════════════════════════════════════════════════════ */

function detectItemTable(lines: string[], sections: DocumentSections): { tableStart: number; tableEnd: number } {
  if (DEBUG) console.log(`${LOG_PREFIX} Table boundaries: start=${sections.tableStart}, end=${sections.tableEnd}`);
  return { tableStart: sections.tableStart, tableEnd: sections.tableEnd };
}

/* ═══════════════════════════════════════════════════════
   STAGE 5 — Row Extraction
   ═══════════════════════════════════════════════════════ */

const AMOUNT_RE = /(?<![A-Za-z0-9:/\-#])(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d{4,}(?:\.\d{1,2})?)(?![A-Za-z0-9/])/g;

function findQtyPricePair(
  nums: number[],
  lineTotal: number
): { quantity: number; unit_price: number } | null {
  if (nums.length < 2 || lineTotal <= 0) return null;
  let best: { quantity: number; unit_price: number; err: number } | null = null;
  for (let i = 0; i < nums.length - 1; i++) {
    const q = nums[i];
    if (q <= 0 || q >= 100_000) continue;
    for (let j = i + 1; j < nums.length; j++) {
      const p = nums[j];
      if (p <= 0 || p >= 100_000) continue;
      const product = q * p;
      const err = Math.abs(product - lineTotal) / lineTotal;
      if (err < 0.015 && (best === null || err < best.err)) {
        best = { quantity: q, unit_price: p, err };
      }
    }
  }
  return best ? { quantity: best.quantity, unit_price: best.unit_price } : null;
}

function extractTableRows(lines: string[], tableStart: number, tableEnd: number): RawRow[] {
  const rows: RawRow[] = [];
  let rejected = 0;

  for (let i = tableStart === 0 ? 0 : tableStart + 1; i < tableEnd; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;

    if (i === 0 && line.includes("\t")) {
      const cells = line.split("\t").map((c) => c.trim());
      const numsAfterFirst = cells.slice(1).map((c) => toNum(c)).filter((n) => n > 0);
      if (cells.length >= 3 && numsAfterFirst.length === 0) continue;
    }

    /* Tab-separated row (Excel export): Description | Qty | Rate | Amount */
    if (line.includes("\t")) {
      const cells = line.split("\t").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 4) {
        const c0 = cells[0].toLowerCase();
        if (/^(desc|item|s\.?no|sr|qty|rate|amount|particular)/i.test(c0) && cells.length <= 10) {
          continue;
        }
        const q = toNum(cells[1]);
        const p = toNum(cells[2]);
        const a = toNum(cells[3]);
        if (q > 0 && (p > 0 || a > 0)) {
          const up = p > 0 ? p : a / q;
          const amt = a > 0 ? a : q * up;
          rows.push({
            lineText: line,
            description: cells[0].slice(0, 400) || "Item",
            quantity: q,
            unit_price: Math.round(up * 100) / 100,
            amount: Math.round(amt * 100) / 100,
            hasNumeric: true,
          });
          continue;
        }
      } else if (cells.length === 3) {
        const q = toNum(cells[1]);
        const p = toNum(cells[2]);
        if (q > 0 && p > 0 && /[a-zA-Z]/.test(cells[0])) {
          rows.push({
            lineText: line,
            description: cells[0].slice(0, 400),
            quantity: q,
            unit_price: p,
            amount: Math.round(q * p * 100) / 100,
            hasNumeric: true,
          });
          continue;
        }
      }
    }

    const hasText = /[a-zA-Z]/.test(line);
    const amountMatches = [...line.matchAll(AMOUNT_RE)].map(m => m[1]);
    const nums = amountMatches.map(a => toNum(a)).filter(n => n > 0);
    const hasNumeric = nums.length > 0;

    if (!hasText && !hasNumeric) { rejected++; continue; }

    const descPart = line.replace(AMOUNT_RE, "").replace(/\s+/g, " ").trim();

    let quantity = 0;
    let unit_price = 0;
    let amount = 0;

    const lineTotal = nums[nums.length - 1];
    const pair = lineTotal > 0 ? findQtyPricePair(nums.slice(0, -1), lineTotal) : null;
    if (pair) {
      quantity = pair.quantity;
      unit_price = pair.unit_price;
      amount = lineTotal;
    } else if (nums.length >= 3) {
      let si = 0;
      if (nums.length >= 4 && nums[0] >= 1 && nums[0] < 1000 && nums[0] === Math.floor(nums[0])) {
        si = 1;
      }
      quantity = nums[si] < 100000 ? nums[si] : 0;
      unit_price = nums[nums.length - 2];
      amount = lineTotal;
    } else if (nums.length === 2) {
      quantity = nums[0] < 100000 ? nums[0] : 0;
      amount = nums[1];
    } else if (nums.length === 1) {
      amount = nums[0];
    }

    rows.push({
      lineText: line,
      description: descPart.slice(0, 300) || "Item",
      quantity,
      unit_price,
      amount,
      hasNumeric,
    });
  }

  if (DEBUG) console.log(`${LOG_PREFIX} Rows extracted: ${rows.length}, rejected: ${rejected}`);
  return rows;
}

/* ═══════════════════════════════════════════════════════
   STAGE 6 — Multi-Line Description Merge
   ═══════════════════════════════════════════════════════ */

function mergeMultilineDescriptions(rows: RawRow[]): RawRow[] {
  const merged: RawRow[] = [];
  for (const row of rows) {
    if (!row.hasNumeric && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.description = `${prev.description} ${row.description}`.trim();
      continue;
    }
    merged.push({ ...row });
  }
  const mergedCount = rows.length - merged.length;
  if (DEBUG && mergedCount > 0) {
    console.log(`${LOG_PREFIX} Merged ${mergedCount} continuation line(s) into previous descriptions`);
  }
  return merged;
}

/* ═══════════════════════════════════════════════════════
   STAGE 7 — Numeric Validation
   ═══════════════════════════════════════════════════════ */

function validateLineItems(rows: RawRow[]): RawRow[] {
  const valid: RawRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.quantity <= 0 && r.amount <= 0 && r.unit_price <= 0) {
      if (DEBUG) console.log(`${LOG_PREFIX} Validation drop row ${i}: no numeric values — "${r.description.slice(0, 50)}"`);
      continue;
    }

    if (r.quantity <= 0) {
      if (r.amount > 0 || r.unit_price > 0) {
        // Keep row for editing only if quantity is explicitly present; otherwise drop.
        continue;
      }
      r.quantity = 0;
    }

    if (r.unit_price > 0 && r.amount <= 0) {
      r.amount = Math.round(r.quantity * r.unit_price * 100) / 100;
    } else if (r.amount > 0 && r.unit_price <= 0) {
      r.unit_price = Math.round(r.amount / r.quantity * 100) / 100;
    } else if (r.unit_price > 0 && r.amount > 0) {
      const expected = r.quantity * r.unit_price;
      const tolerance = Math.max(expected * 0.01, 0.02);
      if (Math.abs(expected - r.amount) > tolerance) {
        if (DEBUG) console.log(`${LOG_PREFIX} Validation fix row ${i}: qty*price=${expected.toFixed(2)} != amount=${r.amount.toFixed(2)}; using amount`);
        r.unit_price = Math.round(r.amount / r.quantity * 100) / 100;
      }
    }

    valid.push(r);
  }
  if (DEBUG) console.log(`${LOG_PREFIX} Validated: ${valid.length} of ${rows.length} rows`);
  return valid;
}

/* ═══════════════════════════════════════════════════════
   STAGE 8 — False Positive Filter
   ═══════════════════════════════════════════════════════ */

const FALSE_POSITIVE_KEYWORDS = [
  "delivery", "currency", "address", "prepared", "manager",
  "gst", "reference", "page", "terms", "condition",
  "authorized", "signature", "bank detail", "declaration",
  "for and on behalf", "accepted by", "approved",
];

function filterFalsePositives(rows: RawRow[]): RawRow[] {
  const filtered: RawRow[] = [];
  for (const r of rows) {
    const lower = r.description.toLowerCase();
    const matched = FALSE_POSITIVE_KEYWORDS.find(kw => lower.includes(kw));
    if (matched) {
      if (DEBUG) console.log(`${LOG_PREFIX} False positive rejected: "${r.description.slice(0, 50)}" (keyword: ${matched})`);
      continue;
    }
    filtered.push(r);
  }
  return filtered;
}

/* ═══════════════════════════════════════════════════════
   TOTALS EXTRACTION
   ═══════════════════════════════════════════════════════ */

function extractTotals(lines: string[], footerStart: number): ParsedTotals {
  const footerLines = lines.slice(footerStart);
  const totals: ParsedTotals = { subtotal: 0, cgst: 0, sgst: 0, igst: 0, grand_total: 0 };

  const findAmount = (patterns: RegExp[]): number => {
    for (const line of footerLines) {
      for (const re of patterns) {
        const m = line.match(re);
        if (m) {
          const nums = [...m[0].matchAll(AMOUNT_RE)].map(mm => mm[1]).map(a => toNum(a)).filter(n => n > 0);
          if (nums.length > 0) return nums[nums.length - 1];
        }
      }
    }
    return 0;
  };

  totals.subtotal = findAmount([/(?:taxable\s*value|sub\s*total|net\s*value)/i]);
  totals.cgst = findAmount([/cgst/i]);
  totals.sgst = findAmount([/sgst/i]);
  totals.igst = findAmount([/igst/i]);
  totals.grand_total = findAmount([/(?:grand\s*total|total\s*(?:amount|value))/i]);

  return totals;
}

/* ═══════════════════════════════════════════════════════
   POST-PROCESSING + FINAL OUTPUT
   ═══════════════════════════════════════════════════════ */

function postProcessTotals(
  items: ParsedLineItem[],
  extractedTotals: ParsedTotals,
): ParsedTotals {
  const computedSubtotal = items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const computedGst = items.reduce((s, li) => s + li.gst_amount, 0);
  return {
    subtotal: extractedTotals.subtotal > 0 ? extractedTotals.subtotal : Math.round(computedSubtotal * 100) / 100,
    cgst: extractedTotals.cgst > 0 ? extractedTotals.cgst : Math.round(computedGst / 2 * 100) / 100,
    sgst: extractedTotals.sgst > 0 ? extractedTotals.sgst : Math.round(computedGst / 2 * 100) / 100,
    igst: extractedTotals.igst,
    grand_total: extractedTotals.grand_total > 0
      ? extractedTotals.grand_total
      : Math.round((computedSubtotal + computedGst) * 100) / 100,
  };
}

/* ═══════════════════════════════════════════════════════
   MAIN ENTRY POINT
   ═══════════════════════════════════════════════════════ */

function emptyParsedResult(warnings: string[]): ParsedPurchaseOrder {
  const header: ParsedHeader = {
    po_number: null, po_date: null, customer_name: null, customer_address: null, customer_gst: null,
    contact_person: null, phone: null, email: null, payment_terms: null, delivery_date: null,
    currency: null, prepared_by: null,
  };
  return {
    header,
    line_items: [],
    totals: { subtotal: 0, cgst: 0, sgst: 0, igst: 0, grand_total: 0 },
    confidence: "low",
    warnings,
  };
}

export function parsePurchaseOrder(rawText: string): ParsedPurchaseOrder {
  const warnings: string[] = [];

  const trimmed = rawText.trim();
  if (trimmed.length < 1) {
    warnings.push("Document is empty or whitespace only.");
    return emptyParsedResult(warnings);
  }

  // Stage 1: Normalize
  const normalized = normalizeText(rawText);
  const lines = normalized.split("\n").map(l => l.trim()).filter(Boolean);
  if (DEBUG) console.log(`${LOG_PREFIX} Input length: ${rawText.length}, lines: ${lines.length}`);

  // Stage 2: Segment
  const sections = detectDocumentSections(lines);

  // Stage 3: Header
  const header = extractHeaderFields(lines, sections.headerEnd);

  // Stage 4: Table boundaries
  const { tableStart, tableEnd } = detectItemTable(lines, sections);

  // Stage 5: Row extraction
  let rows = extractTableRows(lines, tableStart, tableEnd);

  // Stage 6: Multi-line merge
  rows = mergeMultilineDescriptions(rows);

  // Stage 7: Numeric validation
  rows = validateLineItems(rows);

  // Stage 8: False positive filter
  rows = filterFalsePositives(rows);

  // Build line items (default GST 18% when not extracted from document)
  const line_items: ParsedLineItem[] = rows.map((r, idx) => {
    const base = r.quantity * r.unit_price;
    const gstRate = 18;
    const gstAmt = Math.round(base * gstRate / 100 * 100) / 100;
    return {
      sno: idx + 1,
      description: r.description,
      quantity: r.quantity,
      unit: "Nos",
      unit_price: r.unit_price,
      hsn_code: null,
      gst_rate: gstRate,
      gst_amount: gstAmt,
      line_total: Math.round((base + gstAmt) * 100) / 100,
    };
  });

  // Totals
  const rawTotals = extractTotals(lines, sections.footerStart);
  const totals = postProcessTotals(line_items, rawTotals);

  // Confidence scoring
  let score = 0;
  if (header.po_number) score++;
  if (header.customer_name) score++;
  if (line_items.length > 0) score++;
  if (header.po_date) score++;
  if (totals.grand_total > 0) score++;
  const confidence: "high" | "medium" | "low" = score >= 4 ? "high" : score >= 2 ? "medium" : "low";

  if (confidence === "low") {
    warnings.push("Low confidence extraction. Manual verification recommended.");
  }
  if (line_items.length === 0) {
    warnings.push("No line items detected in document.");
  }
  if (DEBUG) console.log(`${LOG_PREFIX} Result: po_number=${header.po_number}, customer=${header.customer_name}, items=${line_items.length}, total=${totals.grand_total}, confidence=${confidence}`);

  return { header, line_items, totals, confidence, warnings };
}
