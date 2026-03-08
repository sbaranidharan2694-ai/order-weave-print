/**
 * Rule-based Purchase Order parser (no AI).
 * Supports: Fujitec, Guindy Machine Tools, Contemporary Leather, Wipro Enterprises, CGRD Chemicals, and other PO formats.
 */

export type ParsedPOLineItem = {
  description: string;
  item_code: string;
  hsn_code: string;
  qty: number;
  uom: string;
  unit_price: number;
  base_amount: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  total_amount: number;
  suggested_product_type: string;
};

export type ParsedPOData = {
  po_number: string;
  po_date: string | null;
  vendor_name: string;
  contact_no: string | null;
  contact_person: string | null;
  contact_email: string | null;
  gstin: string | null;
  vendor_gstin: string | null;
  delivery_address: string | null;
  buyer_address: string | null;
  delivery_date: string | null;
  payment_terms: string | null;
  currency: string;
  gst_extra: boolean;
  total_amount: number;
  tax_amount: number;
  base_amount: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  remarks: string | null;
  line_items: ParsedPOLineItem[];
};

const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]{3}[A-Z]\b/;

/** Match numbers that are not part of a hyphenated code (e.g. avoid "001" in "VC-001") */
const NUMBER_RE = /(?<![-\d.])([\d,]+(?:\.\d{2})?)(?!\d)/g;

function toNum(s: string | number | null | undefined): number {
  if (s == null) return 0;
  if (typeof s === "number") return isNaN(s) ? 0 : s;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function extractNumbers(line: string): number[] {
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(NUMBER_RE.source, "g");
  while ((m = re.exec(line)) !== null) nums.push(toNum(m[1]));
  return nums;
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim() || null : null;
}

/** Normalize various date formats to YYYY-MM-DD */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mon, y] = m;
    return `${y}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DDMMYYYY
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    const [, d, mon, y] = m;
    return `${y}-${mon}-${d}`;
  }

  // DD-MM-YY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) {
    const [, d, mon, y] = m;
    const year = parseInt(y, 10) < 50 ? 2000 + parseInt(y, 10) : 1900 + parseInt(y, 10);
    return `${year}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD.MM.YYYY or DD.MM.YY (e.g. 03.03.2026 or 26.02.26)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const [, d, mon, y] = m;
    const year = y.length === 2 ? (parseInt(y, 10) < 50 ? "20" + y : "19" + y) : y;
    return `${year}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DDDD (e.g. 04032026 or 08032026)
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    const [, d, mon, y] = m;
    return `${y}-${mon}-${d}`;
  }

  // DD-Mon-YYYY (e.g. 24-Feb-2026)
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  m = s.match(/^(\d{1,2})[/-]([A-Za-z]{3})[/-]?(\d{4})$/);
  if (m) {
    const [, d, mon, y] = m;
    const monNum = months[mon.toLowerCase().slice(0, 3)];
    if (monNum) return `${y}-${monNum}-${d.padStart(2, "0")}`;
  }

  return null;
}

/** Skip lines that are footer/metadata — never use as line item description */
function isFooterLine(line: string): boolean {
  const t = line.trim();
  return (
    /GST\s+No\.?|PAN\s+No\.?|Vendor\s+Code|Vendor\s+GST|GSTIN|Tel\.?|Plot\s+|PIN\s+|AUTHORISED\s+SIGNATORY|DELIVERY\s+ADDRESS/i.test(t)
  );
}

/** Only rows that start with numeric Sr/Sl/S.No (1, 2, 3...) are line item rows */
function startsWithNumericIndex(line: string): boolean {
  return /^\s*\d+\s+/.test(line.trim()) || /^\s*\d+\s*$/.test(line.trim());
}

/** Deduplicate line items by description + total_amount (multi-page PDFs) */
function dedupeLineItems(items: ParsedPOLineItem[]): ParsedPOLineItem[] {
  const seen = new Set<string>();
  return items.filter((li) => {
    const key = `${(li.description || "").trim()}|${li.total_amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Recalculate grand total from sum of line item totals (Base + CGST + SGST + IGST) */
function recalcGrandTotal(items: ParsedPOLineItem[]): number {
  return items.reduce((s, li) => s + (li.total_amount || 0), 0);
}

function extractGstin(text: string): string | null {
  const m = text.match(GSTIN_RE);
  return m ? m[0] : null;
}

function mapHsnToProductType(hsn: string): string {
  const code = (hsn || "").replace(/\D/g, "").slice(0, 4);
  const map: Record<string, string> = {
    "3923": "Visiting Cards/Cards", "4911": "Visiting Cards/Cards",
    "3926": "Flex Banner", "3921": "Flex Banner",
    "4910": "Brochure", "4901": "Brochure",
    "3919": "Sticker",
    "4817": "Letterhead",
    "4820": "Bill Book",
    "4819": "Carry Bag", "6305": "Carry Bag",
    "8412": "Other/Book",
  };
  return map[code] || "Other";
}

const emptyLineItem = (): ParsedPOLineItem => ({
  description: "",
  item_code: "",
  hsn_code: "",
  qty: 0,
  uom: "NOS",
  unit_price: 0,
  base_amount: 0,
  cgst_percent: 0,
  cgst_amount: 0,
  sgst_percent: 0,
  sgst_amount: 0,
  igst_percent: 0,
  igst_amount: 0,
  total_amount: 0,
  suggested_product_type: "Other",
});

/** True if line looks like a table header (column titles, not data) */
function isTableHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    (/sr\s*no|s\.no|sl\.?\s*no/i.test(lower) && /description|qty|quantity|unit\s*price|amount/i.test(lower)) ||
    (/part\s*number|item\s*number/i.test(lower) && /qty|uom/i.test(lower) && line.replace(/\d/g, "").length > line.length / 2)
  );
}

/** True if line is a total/subtotal/grand row */
function isTotalLine(line: string): boolean {
  const t = line.trim();
  if (/^(Total|Subtotal|Grand\s*Total|Net\s*Amount|Tax|CGST|SGST|IGST)\s*[:.]?\s*[\d,.]*$/i.test(t)) return true;
  const nums = extractNumbers(t);
  return nums.length <= 2 && nums.some((n) => n > 10000);
}

/** Fujitec India: detection FUJITEC INDIA PVT LTD or PO-FIN-M- or SUBCON/List of Subcon/SUPER */
function tryFujitec(text: string): ParsedPOData | null {
  if (!/FUJITEC INDIA PVT LTD|PO-FIN-M-|SUBCON PURCHASE ORDER|FUJITEC INDIA|List\s*of\s*Subcon|ListOfSubcon|ListOfSubconPurchaseOrder|SUPER\s*\d+|SUPER\s*PRINTERS|Purchase\s+Order/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const superMatch = text.match(/SUPER\s*[_\s]*(\d+)/i);
  const poNumber = (superMatch ? `SUPER_${superMatch[1]}` : null)
    || firstMatch(text, /Purchase\s+Job\s+Order\s+No\s+(PO-[\w-]+)/i)
    || firstMatch(text, /Order\s+No\.?\s*[:\s]*([A-Z0-9-]+)/i)
    || firstMatch(text, /PO\s*[#:]?\s*([A-Z0-9-]+)/i);
  const poDateRaw = firstMatch(text, /Date\s+(\d{2}-\w+-\d{4})/i)
    || firstMatch(text, /(?:^|\s)Date\s*[:\s]*(\d{1,2}[/-][A-Za-z]{3}[/-]?\d{4})/i);
  const completionDate = firstMatch(text, /Completion\s+Date\s*[:\s]*(\d{2}-\w+-\d{4})/i);
  const paymentDays = firstMatch(text, /Terms\s+of\s+Payment\s+in\s+Days\s*[:\s]*(\d+)/i);
  const contactPerson = firstMatch(text, /Approved\s+By\s+(.+?)(?=\s*(?:GST|$|\n))/i)
    || firstMatch(text, /Contact\s+Person\s*[:\s]*([^\n]+?)(?=\s*(?:GST|$))/i);

  const gstin = firstMatch(text, /GST\s+No\.?\s+(33AAAC\w+)/i) || extractGstin(text);
  const vendorName = /FUJITEC INDIA/i.test(text) ? "Fujitec India Pvt Ltd" : /SUPER\s*PRINTERS/i.test(text) ? "Super Printers" : "Vendor";

  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /Sr\s*No.*Description.*Part\s*Number|Req\.On\s*Date.*Cost\s*Entity|Qty\s+UOM\s+Unit\s*Price\s+Total\s*Price\s+CGST\s+SGST|Sr\s*No.*Description.*(Qty|Unit\s*Price|Amount)/i.test(l));
  const startIndex = tableStart >= 0 ? tableStart + 1 : 0;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (isFooterLine(line)) continue;
    if (isTableHeaderLine(line)) continue;
    if (isTotalLine(line) || (/Total|Grand|Subtotal/i.test(line) && line.length < 50)) break;
    if (!startsWithNumericIndex(line)) continue;
    const nums = extractNumbers(line);
    if (nums.length >= 8 && nums[1] <= 100000 && nums[2] > 0 && nums[2] < 100000 && Math.abs(nums[3] - nums[1] * nums[2]) < 0.02 * (nums[1] * nums[2] || 1)) {
      const qty = nums[1];
      const unitPrice = nums[2];
      const base = nums[3];
      const cgstPct = nums[4] ?? 0;
      const cgstAmt = nums[5] ?? 0;
      const sgstPct = nums[6] ?? 0;
      const sgstAmt = nums[7] ?? 0;
      const total = base + cgstAmt + sgstAmt;
      if (qty > 0 && unitPrice >= 0) {
        const descMatch = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim();
        const desc = descMatch.slice(0, 120).trim() || "Item";
        if (desc && !/^\d+$/.test(desc)) {
          lineItems.push({
            ...emptyLineItem(),
            description: desc,
            qty,
            uom: "NOS",
            unit_price: unitPrice,
            base_amount: base,
            cgst_percent: cgstPct,
            cgst_amount: cgstAmt,
            sgst_percent: sgstPct,
            sgst_amount: sgstAmt,
            total_amount: total,
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    } else if (nums.length >= 9) {
      let qty: number;
      let unitPrice: number;
      let base: number;
      let cgstPct: number;
      let cgstAmt: number;
      let sgstPct: number;
      let sgstAmt: number;
      if (Math.abs((nums[8] ?? 0) - (nums[5] ?? 0) * (nums[7] ?? 0)) < 0.02 * ((nums[5] ?? 0) * (nums[7] ?? 1)) && (nums[5] ?? 0) > 0) {
        qty = nums[5];
        unitPrice = nums[7];
        base = nums[8];
        cgstPct = nums[9] ?? 0;
        cgstAmt = nums[10] ?? 0;
        sgstPct = nums[11] ?? 0;
        sgstAmt = nums[12] ?? 0;
      } else if (Math.abs((nums[4] ?? 0) - (nums[2] ?? 0) * (nums[3] ?? 0)) < 0.02 * ((nums[2] ?? 0) * (nums[3] ?? 1)) && (nums[2] ?? 0) > 0) {
        qty = nums[2];
        unitPrice = nums[3];
        base = nums[4];
        cgstPct = nums[5] ?? 0;
        cgstAmt = nums[6] ?? 0;
        sgstPct = nums[7] ?? 0;
        sgstAmt = nums[8] ?? 0;
      } else {
        qty = 0;
        unitPrice = 0;
        base = 0;
        cgstPct = 0;
        cgstAmt = 0;
        sgstPct = 0;
        sgstAmt = 0;
      }
      const total = base + cgstAmt + sgstAmt;
      if (qty > 0 && unitPrice >= 0 && base > 0) {
        const descMatch = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim();
        const desc = descMatch.slice(0, 120).trim() || "Item";
        if (desc && !/^\d+$/.test(desc)) {
          lineItems.push({
            ...emptyLineItem(),
            description: desc,
            qty,
            uom: "NOS",
            unit_price: unitPrice,
            base_amount: base,
            cgst_percent: cgstPct,
            cgst_amount: cgstAmt,
            sgst_percent: sgstPct,
            sgst_amount: sgstAmt,
            total_amount: total,
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    } else if (nums.length >= 4) {
      const qty = nums[1];
      const unitPrice = nums[2];
      const total = nums[3];
      const expectedTotal = qty * unitPrice;
      const totalOk = total > 0 && (Math.abs(total - expectedTotal) < 0.02 || (Math.abs(total - expectedTotal) / total) < 0.02);
      if (qty > 0 && qty <= 100000 && unitPrice >= 0 && totalOk) {
        const descMatch = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim();
        const desc = descMatch.slice(0, 120).trim() || "Item";
        if (desc && !/^\d+$/.test(desc)) {
          lineItems.push({
            ...emptyLineItem(),
            description: desc,
            qty,
            uom: "NOS",
            unit_price: unitPrice,
            base_amount: total,
            total_amount: total,
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    }
  }

  const deduped = dedupeLineItems(lineItems);
  if (deduped.length === 0) return null;

  const baseAmount = deduped.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = recalcGrandTotal(deduped);
  const taxAmount = totalAmount - baseAmount;

  return {
    po_number: poNumber || "",
    po_date: normalizeDate(poDateRaw),
    vendor_name: vendorName,
    contact_no: null,
    contact_person: contactPerson,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(completionDate),
    payment_terms: paymentDays ? `${paymentDays} Days` : null,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: taxAmount,
    cgst_percent: 0,
    cgst_amount: deduped.reduce((s, li) => s + li.cgst_amount, 0),
    sgst_percent: 0,
    sgst_amount: deduped.reduce((s, li) => s + li.sgst_amount, 0),
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: deduped,
  };
}

/** Guindy Machine Tools: detection GUINDY MACHINE TOOLS or LOC\\d+ */
function tryGuindy(text: string): ParsedPOData | null {
  if (!/GUINDY MACHINE TOOLS|LOC\d+|LOC\/|LOC\s*\d+/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const gstExtra = /GST\s+EXTRA|CGST[, ]*SGST[, ]*IGST\s+EXTRA/i.test(text);

  const locMatch = text.match(/^(LOC\d+)/im);
  const poNumber = locMatch ? locMatch[1] : firstMatch(text, /(LOC\d+)/i) || "";
  const poDateRaw = firstMatch(text, /LOC\d+\s+(\d{8})/i);
  const deliveryDateRaw = firstMatch(text, /Delivery\s+Date\s+(\d{8})/i);
  const paymentTerms = firstMatch(text, /Payment\s+Terms\s+(.+?)(?=\s*(?:Delivery|GST|$|\n))/i);
  const contactPerson = firstMatch(text, /Prepared\s+by\s+(.+?)(?=\s*$|\n)/i);

  const gstin = firstMatch(text, /GST\s+No\.?\s+(33AAACG\w+)/i) || extractGstin(text);
  const vendorName = "Guindy Machine Tools Limited";

  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /Sl\.?\s*No|Item\s*Number|Description\s*\|?\s*Qty|Qty\s*\|?\s*UOM/i.test(l));
  const startIndex = tableStart >= 0 ? tableStart + 1 : 0;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (isFooterLine(line)) continue;
    if (isTableHeaderLine(line)) continue;
    if (isTotalLine(line) || (/Total|Grand|Subtotal|GST\s+EXTRA/i.test(line) && line.length < 50)) break;
    if (!startsWithNumericIndex(line)) continue;
    const nums = extractNumbers(line);
    if (nums.length >= 4) {
      const qty = nums[1];
      const unitPrice = nums[2];
      const amount = nums[3];
      if (qty > 0 && unitPrice >= 0 && amount > 0 && Math.abs(amount - qty * unitPrice) < 0.02) {
        const desc = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim() || "Item";
        if (desc && !/^\d+$/.test(desc)) {
          lineItems.push({
            ...emptyLineItem(),
            description: desc,
            qty,
            uom: "NOS",
            unit_price: unitPrice,
            base_amount: amount,
            total_amount: amount,
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    } else if (nums.length === 3) {
      const qty = nums[0];
      const unitPrice = nums[1];
      const amount = nums[2];
      if (qty > 0 && unitPrice >= 0 && amount > 0 && Math.abs(amount - qty * unitPrice) < 0.02) {
        const desc = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim() || "Item";
        if (desc && !/^\d+$/.test(desc)) {
          lineItems.push({
            ...emptyLineItem(),
            description: desc,
            qty,
            uom: "NOS",
            unit_price: unitPrice,
            base_amount: amount,
            total_amount: amount,
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    }
  }

  const deduped = dedupeLineItems(lineItems);
  if (deduped.length === 0) return null;

  const baseAmount = deduped.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = recalcGrandTotal(deduped);

  return {
    po_number: poNumber || "",
    po_date: poDateRaw ? normalizeDate(poDateRaw.slice(0, 2) + "-" + poDateRaw.slice(2, 4) + "-" + poDateRaw.slice(4)) : null,
    vendor_name: vendorName,
    contact_no: null,
    contact_person: contactPerson,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: deliveryDateRaw ? normalizeDate(deliveryDateRaw.slice(0, 2) + "-" + deliveryDateRaw.slice(2, 4) + "-" + deliveryDateRaw.slice(4)) : null,
    payment_terms: paymentTerms,
    currency: "INR",
    gst_extra: gstExtra,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: gstExtra ? 0 : totalAmount - baseAmount,
    cgst_percent: 0,
    cgst_amount: 0,
    sgst_percent: 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: deduped,
  };
}

/** Contemporary Leather (SAP Business One): PO No 8 digits, PO Date DD-MM-YY, GST 33AADC... */
function tryContemporary(text: string): ParsedPOData | null {
  if (!/Contemporary Leather|SAP Business One/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /PO\s+No\s+(\d{8})/i) || firstMatch(text, /PO\s+No\.?\s*[:\s]*(\d+)/i);
  const poDateRaw = firstMatch(text, /PO\s+Date\s+(\d{2}-\d{2}-\d{2})/i) || firstMatch(text, /PO\s+Date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const deliveryDateRaw = firstMatch(text, /Delivery\s+Date\s+(\d{2}-\d{2}-\d{4})/i) || firstMatch(text, /Delivery\s+Date\s*[:\s]*([\d/-]+)/i);
  const paymentTerms = firstMatch(text, /Payment\s+terms?\s*[:\s]*([^\n]+?)(?=\s*(?:Contact|Delivery|$))/i) || "60 DAYS";
  const contactPerson = firstMatch(text, /Contact\s+Person\s*[:\s]*([^\n]+?)(?=\s*(?:Contact\s+No|$))/i) || "Mr. Bharani";
  const contactNo = firstMatch(text, /Contact\s+No\.?\s*[:\s]*([\d\s-+]{10,})/i) || "9840199878";

  const gstin = firstMatch(text, /GST\s+(33AADC\w+)/i) || extractGstin(text);
  const vendorName = "Contemporary Leather Pvt Ltd";

  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /S\.?\s*No|Description\s*\|?\s*HSN|HSN\s+CODE\s*\|?\s*QTY/i.test(l));
  const startIndex = tableStart >= 0 ? tableStart + 1 : 0;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (isFooterLine(line)) continue;
    if (isTableHeaderLine(line)) continue;
    if (isTotalLine(line) || (/Total|Grand|Subtotal/i.test(line) && line.length < 40)) break;
    if (!startsWithNumericIndex(line)) continue;
    const nums = extractNumbers(line);
    if (nums.length >= 5) {
      const qty = nums[2] || nums[1];
      const unitPrice = nums.length >= 7 ? nums[4] : nums[3];
      const baseAmt = nums.length >= 6 ? nums[5] : qty * unitPrice;
      const totalAmt = nums[nums.length - 1] || baseAmt;
      const cgstPct = nums.length >= 8 ? nums[6] : 9;
      const sgstPct = nums.length >= 10 ? nums[8] : 9;
      const valid = qty > 0 && unitPrice >= 0 && baseAmt > 0;
      if (valid) {
        const desc = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim() || "Item";
        const hsnMatch = line.match(/\b(\d{4,8})\b/);
        const hsn = hsnMatch ? hsnMatch[1] : "";
        if (desc && !/^\d+$/.test(desc)) {
          const cgstAmt = baseAmt * (cgstPct / 100);
          const sgstAmt = baseAmt * (sgstPct / 100);
          const total = baseAmt + cgstAmt + sgstAmt;
          lineItems.push({
            ...emptyLineItem(),
            description: desc,
            hsn_code: hsn,
            qty,
            uom: "NOS",
            unit_price: unitPrice,
            base_amount: baseAmt,
            cgst_percent: cgstPct,
            sgst_percent: sgstPct,
            cgst_amount: cgstAmt,
            sgst_amount: sgstAmt,
            total_amount: total,
            suggested_product_type: mapHsnToProductType(hsn),
          });
        }
      }
    }
  }

  const deduped = dedupeLineItems(lineItems);
  if (deduped.length === 0) return null;

  const baseAmount = deduped.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = recalcGrandTotal(deduped);
  const taxAmount = totalAmount - baseAmount;

  return {
    po_number: poNumber || "",
    po_date: normalizeDate(poDateRaw),
    vendor_name: vendorName,
    contact_no: contactNo,
    contact_person: contactPerson,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(deliveryDateRaw),
    payment_terms: paymentTerms,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: taxAmount,
    cgst_percent: 0,
    cgst_amount: deduped.reduce((s, li) => s + li.cgst_amount, 0),
    sgst_percent: 0,
    sgst_amount: deduped.reduce((s, li) => s + li.sgst_amount, 0),
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: deduped,
  };
}

/** Wipro Enterprises: detection Wipro Enterprises Private Limited AND PURCHASE ORDER No */
function tryWipro(text: string): ParsedPOData | null {
  if (!/Wipro Enterprises Private Limited/i.test(text) || !/PURCHASE ORDER No/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /PURCHASE ORDER No\s+(\d+)/i);
  const poDateRaw = firstMatch(text, /Dt\s+(\d{2}\.\d{2}\.\d{4})/i);
  const gstin = firstMatch(text, /GST No\s+(33AAJCA\w+)/i) || extractGstin(text);
  const paymentTerms = firstMatch(text, /Terms of Payment\s+(.+?)(?=\s*(?:Order Handled|Email|$|\n))/i);
  const contactPerson = firstMatch(text, /Order Handled BY\s+(.+?)(?=\s*$|\n)/i);
  let contactEmail = firstMatch(text, /Email\s+(\S+)/i);
  if (contactEmail && !contactEmail.includes("@") && /wipro/i.test(contactEmail)) {
    contactEmail = contactEmail.replace(/\.wipro\./i, ".@wipro.");
  }
  const vendorName = "Wipro Enterprises Private Limited";

  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /S\.?\s*No|Description|HSN|Qty|Unit\s*Price|Amount/i.test(l) && /S\.?\s*No/i.test(l));
  let endIndex = lines.length;
  const versionPageIdx = lines.findIndex((l) => /Version\s+Page\s*3/i.test(l));
  if (versionPageIdx >= 0) endIndex = versionPageIdx;

  for (let i = tableStart >= 0 ? tableStart + 1 : 0; i < endIndex; i++) {
    const line = lines[i];
    if (isFooterLine(line)) continue;
    if (isTotalLine(line)) continue;
    if (!startsWithNumericIndex(line)) continue;
    const nums = extractNumbers(line);
    if (nums.length >= 4) {
      const hsnMatch = line.match(/HSN\s+(\d+)/i);
      const hsn = hsnMatch ? hsnMatch[1] : "";
      let desc = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim();
      if (hsn) desc = desc.replace(new RegExp(`HSN\\s*${hsn}`, "gi"), "").replace(/\s+/g, " ").trim();
      desc = desc.slice(0, 120).trim() || "Item";
      if (/^\d+$/.test(desc)) continue;
      const qty = nums[1];
      const unitPrice = nums[2];
      const total = nums[3];
      const base = qty * unitPrice;
      const cgstMatch = text.match(/CGST-\s*(\d+)\s*-\s*([\d,.]+)/i);
      const sgstMatch = text.match(/SGST-\s*(\d+)\s*-\s*([\d,.]+)/i);
      const cgstPct = cgstMatch ? toNum(cgstMatch[1]) : 9;
      const sgstPct = sgstMatch ? toNum(sgstMatch[1]) : 9;
      const cgstAmt = base * (cgstPct / 100);
      const sgstAmt = base * (sgstPct / 100);
      const lineTotal = base + cgstAmt + sgstAmt;
      if (qty > 0 && unitPrice > 0) {
        lineItems.push({
          ...emptyLineItem(),
          description: desc,
          hsn_code: hsn,
          qty,
          uom: "EA",
          unit_price: unitPrice,
          base_amount: base,
          cgst_percent: cgstPct,
          cgst_amount: cgstAmt,
          sgst_percent: sgstPct,
          sgst_amount: sgstAmt,
          total_amount: lineTotal,
          suggested_product_type: mapHsnToProductType(hsn),
        });
      }
    }
  }

  const deduped = dedupeLineItems(lineItems);
  if (deduped.length === 0) return null;

  const baseAmount = deduped.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = recalcGrandTotal(deduped);
  const taxAmount = totalAmount - baseAmount;

  const deliveryDateRaw = firstMatch(text, /Delivery\s+(\d{2}\.\d{2}\.\d{4})/i);

  return {
    po_number: poNumber || "",
    po_date: normalizeDate(poDateRaw),
    vendor_name: vendorName,
    contact_no: null,
    contact_person: contactPerson,
    contact_email: contactEmail,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(deliveryDateRaw),
    payment_terms: paymentTerms,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: taxAmount,
    cgst_percent: 0,
    cgst_amount: deduped.reduce((s, li) => s + li.cgst_amount, 0),
    sgst_percent: 0,
    sgst_amount: deduped.reduce((s, li) => s + li.sgst_amount, 0),
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: deduped,
  };
}

/** CGRD Chemicals (Excel): detection CGRD Chemicals or 33AALCC5735C1ZW */
function tryCGRD(text: string): ParsedPOData | null {
  if (!/CGRD Chemicals|CGRD CHEMICALS|33AALCC5735C1ZW/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /PO NO\s+([\w-]+)/i);
  const poDateRaw = firstMatch(text, /DATE\s+(\d{2}\.\d{2}\.\d{2})/i);
  const gstin = firstMatch(text, /GST IN\s+(33AALCC\w+)/i) || firstMatch(text, /33AALCC5735C1ZW/i) || extractGstin(text);
  const paymentTerms = firstMatch(text, /(\d+)\s+DAYS CREDIT/i);
  const contactPerson = firstMatch(text, /APPROVED BY\s+(.+?)(?=\s*$|\n)/i);
  const vendorName = "CGRD Chemicals India Pvt Ltd";

  const cgstTotalMatch = text.match(/CGST\s+([\d.]+)/i);
  const sgstTotalMatch = text.match(/SGST\s+([\d.]+)/i);
  const cgstTotal = cgstTotalMatch ? toNum(cgstTotalMatch[1]) : 0;
  const sgstTotal = sgstTotalMatch ? toNum(sgstTotalMatch[1]) : 0;
  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /S\s*no|PRODUCT\s*NAME|BATCH\s*NO|Price\s*kg|Qty|AMOUNT/i.test(l));
  const startIndex = tableStart >= 0 ? tableStart + 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (isFooterLine(line)) continue;
    if (isTotalLine(line) || /^TOTAL\s+[\d.]+$/i.test(line)) break;
    if (!startsWithNumericIndex(line)) continue;
    const parts = line.split(/\s+/).filter(Boolean);
    const nums = extractNumbers(line);
    const descPart = parts.slice(1, -4).join(" ").trim();
    if (!descPart || descPart.length < 2) continue;
    if (nums.length >= 3) {
      const unitPrice = nums[nums.length - 3];
      const qty = nums[nums.length - 2];
      const amount = nums[nums.length - 1];
      if (amount < 10 && nums.length === 3 && qty > 100) continue;
      const base = amount > 0 ? amount : qty * unitPrice;
      if (qty <= 0 || unitPrice <= 0) continue;
      lineItems.push({
        ...emptyLineItem(),
        description: descPart.slice(0, 120),
        qty,
        uom: "KG",
        unit_price: unitPrice,
        base_amount: base,
        total_amount: base,
        suggested_product_type: mapHsnToProductType(""),
      });
    }
  }

  const totalBase = lineItems.reduce((s, li) => s + li.base_amount, 0);
  const cgstPct = totalBase > 0 && cgstTotal > 0 ? (cgstTotal / totalBase) * 100 : 9;
  const sgstPct = totalBase > 0 && sgstTotal > 0 ? (sgstTotal / totalBase) * 100 : 9;
  for (const li of lineItems) {
    li.cgst_percent = Math.round(cgstPct * 100) / 100;
    li.sgst_percent = Math.round(sgstPct * 100) / 100;
    li.cgst_amount = Math.round(li.base_amount * (cgstPct / 100) * 100) / 100;
    li.sgst_amount = Math.round(li.base_amount * (sgstPct / 100) * 100) / 100;
    li.total_amount = li.base_amount + li.cgst_amount + li.sgst_amount;
  }

  const deduped = dedupeLineItems(lineItems);
  if (deduped.length === 0) return null;

  const baseAmount = deduped.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = recalcGrandTotal(deduped);

  return {
    po_number: poNumber || "",
    po_date: normalizeDate(poDateRaw),
    vendor_name: vendorName,
    contact_no: null,
    contact_person: contactPerson,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: null,
    payment_terms: paymentTerms ? `${paymentTerms} DAYS CREDIT` : null,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: totalAmount - baseAmount,
    cgst_percent: 0,
    cgst_amount: deduped.reduce((s, li) => s + li.cgst_amount, 0),
    sgst_percent: 0,
    sgst_amount: deduped.reduce((s, li) => s + li.sgst_amount, 0),
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: deduped,
  };
}

/** Try to add one line item from numbers; returns true if added */
function tryAddGenericLineItem(
  line: string,
  lineItems: ParsedPOLineItem[],
  tolerance = 0.02
): boolean {
  const nums = extractNumbers(line);
  const descRaw = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim();
  if (descRaw.length < 2 || /^(Total|Subtotal|Grand|Page|\d+)$/i.test(descRaw) || /^\d+$/.test(descRaw)) return false;

  const validTotal = (qty: number, unitPrice: number, total: number) =>
    total > 0 && qty > 0 && unitPrice >= 0 &&
    (Math.abs(total - qty * unitPrice) < 0.02 || (Math.abs(total - qty * unitPrice) / total) <= tolerance);

  if (nums.length >= 4) {
    const qty1 = nums[1];
    const unitPrice1 = nums[2];
    const total1 = nums[3];
    if (qty1 > 0 && qty1 < 100000 && unitPrice1 >= 0 && validTotal(qty1, unitPrice1, total1)) {
      lineItems.push({
        ...emptyLineItem(),
        description: descRaw || "Item",
        qty: qty1,
        unit_price: unitPrice1,
        base_amount: total1,
        total_amount: total1,
        suggested_product_type: mapHsnToProductType(""),
      });
      return true;
    }
  }
  if (nums.length >= 3) {
    const qty = nums[0];
    const unitPrice = nums[1];
    const total = nums[2];
    if (qty > 0 && qty < 100000 && unitPrice > 0 && validTotal(qty, unitPrice, total)) {
      lineItems.push({
        ...emptyLineItem(),
        description: descRaw || "Item",
        qty,
        unit_price: unitPrice,
        base_amount: total,
        total_amount: total,
        suggested_product_type: mapHsnToProductType(""),
      });
      return true;
    }
  }
  return false;
}

/** Generic fallback: try to get PO number, dates, and any table rows with qty/price */
function tryGeneric(text: string): ParsedPOData | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /(?:PO\s*#?|Order\s*No\.?|P\.?O\.?\s*No\.?)\s*[:\s]*([A-Z0-9/-]+)/i)
    || firstMatch(text, /([A-Z]{2,5}\/?\s*\d{5,})/i);
  const poDateRaw = firstMatch(text, /(?:Date|PO\s+Date)\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)
    || firstMatch(text, /(\d{1,2}[/-][A-Za-z]{3}[/-]\d{4})/);
  const gstin = extractGstin(text);

  const lineItems: ParsedPOLineItem[] = [];
  for (const line of lines) {
    if (isFooterLine(line) || isTableHeaderLine(line) || isTotalLine(line)) continue;
    if (!startsWithNumericIndex(line)) continue;
    tryAddGenericLineItem(line, lineItems, 0.08);
  }

  const deduped = dedupeLineItems(lineItems);
  if (deduped.length === 0) return null;

  const baseAmount = deduped.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = recalcGrandTotal(deduped);

  return {
    po_number: poNumber || "",
    po_date: normalizeDate(poDateRaw),
    vendor_name: "Vendor",
    contact_no: null,
    contact_person: null,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: null,
    payment_terms: null,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: totalAmount - baseAmount,
    cgst_percent: 0,
    cgst_amount: 0,
    sgst_percent: 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: deduped,
  };
}

/** Last-resort: any line that looks like qty/unit price/total, no numeric-index requirement */
function tryAnyTable(text: string): ParsedPOData | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const poNumber = firstMatch(text, /(?:PO\s*#?|Order\s*No\.?|P\.?O\.?\s*No\.?)\s*[:\s]*([A-Z0-9/-]+)/i)
    || firstMatch(text, /([A-Z]{2,5}\/?\s*\d{5,})/i);
  const poDateRaw = firstMatch(text, /(?:Date|PO\s+Date)\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)
    || firstMatch(text, /(\d{1,2}[/-][A-Za-z]{3}[/-]\d{4})/);
  const gstin = extractGstin(text);

  const lineItems: ParsedPOLineItem[] = [];
  for (const line of lines) {
    if (line.length < 10) continue;
    if (isFooterLine(line) || isTableHeaderLine(line) || isTotalLine(line)) continue;
    tryAddGenericLineItem(line, lineItems, 0.12);
  }

  const deduped = dedupeLineItems(lineItems);
  if (deduped.length === 0) return null;

  const baseAmount = deduped.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = recalcGrandTotal(deduped);

  return {
    po_number: poNumber || "",
    po_date: normalizeDate(poDateRaw),
    vendor_name: "Vendor",
    contact_no: null,
    contact_person: null,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: null,
    payment_terms: null,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: totalAmount - baseAmount,
    cgst_percent: 0,
    cgst_amount: 0,
    sgst_percent: 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: deduped,
  };
}

/**
 * Parse PO text with built-in rule-based logic (no AI).
 * Tries Fujitec → Guindy → Contemporary → Wipro → CGRD → generic → anyTable.
 */
export function parsePOText(pdfText: string): ParsedPOData {
  const t = pdfText.trim();
  if (!t || t.length < 20) {
    return {
      po_number: "",
      po_date: null,
      vendor_name: "",
      contact_no: null,
      contact_person: null,
      contact_email: null,
      gstin: null,
      vendor_gstin: null,
      delivery_address: null,
      buyer_address: null,
      delivery_date: null,
      payment_terms: null,
      currency: "INR",
      gst_extra: false,
      total_amount: 0,
      tax_amount: 0,
      base_amount: 0,
      cgst_percent: 0,
      cgst_amount: 0,
      sgst_percent: 0,
      sgst_amount: 0,
      igst_percent: 0,
      igst_amount: 0,
      remarks: null,
      line_items: [],
    };
  }

  const result = tryFujitec(t) || tryGuindy(t) || tryContemporary(t) || tryWipro(t) || tryCGRD(t) || tryGeneric(t) || tryAnyTable(t);
  if (result) return result;

  return {
    po_number: "",
    po_date: null,
    vendor_name: "",
    contact_no: null,
    contact_person: null,
    contact_email: null,
    gstin: null,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: null,
    payment_terms: null,
    currency: "INR",
    gst_extra: false,
    total_amount: 0,
    tax_amount: 0,
    base_amount: 0,
    cgst_percent: 0,
    cgst_amount: 0,
    sgst_percent: 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: [],
  };
}
