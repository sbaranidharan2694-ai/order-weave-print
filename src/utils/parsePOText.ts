/**
 * Rule-based Purchase Order parser (no AI).
 * Supports: Fujitec (SUBCON), Guindy Machine Tools (LOC), Contemporary Leather (SAP).
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

/** Try Fujitec India (SUBCON PURCHASE ORDER) or SUPER / List of Subcon / Purchase Order POs */
function tryFujitec(text: string): ParsedPOData | null {
  if (!/SUBCON PURCHASE ORDER|FUJITEC INDIA|List\s*of\s*Subcon|ListOfSubcon|SUPER\s*\d+|SUPER\s*PRINTERS|Purchase\s+Order/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /Purchase\s+Job\s+Order\s+No\.?\s*[:\s]*([A-Z0-9-]+)/i)
    || firstMatch(text, /Order\s+No\.?\s*[:\s]*([A-Z0-9-]+)/i)
    || firstMatch(text, /SUPER\s*[_\s]*(\d+)/i)
    || firstMatch(text, /PO\s*[#:]?\s*([A-Z0-9-]+)/i);
  const poDateRaw = firstMatch(text, /(?:^|\s)Date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-][A-Za-z]{3}[/-]?\d{4})/i)
    || firstMatch(text, /(\d{1,2}[/-][A-Za-z]{3}[/-]\d{4})/);
  const completionDate = firstMatch(text, /Completion\s+Date\s*[:\s]*([\d/-A-Za-z]+)/i);
  const paymentDays = firstMatch(text, /Terms\s+of\s+Payment\s+in\s+Days\s*[:\s]*(\d+)/i);
  const contactPerson = firstMatch(text, /Contact\s+Person\s*[:\s]*([^\n]+?)(?=\s*(?:GST|$))/i);

  const gstin = extractGstin(text);
  const vendorName = /FUJITEC INDIA/i.test(text) ? "Fujitec India Pvt Ltd" : "Vendor";

  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /Sr\s*No|Description\s*\|?\s*Part\s*Number|Qty\s*\|?\s*UOM|Sl\.?\s*No|S\.?\s*No\s+Description|Part\s*Number|Unit\s*Price|Total\s*Price/i.test(l));
  const startIndex = tableStart >= 0 ? tableStart + 1 : 0;
  for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (isTableHeaderLine(line)) continue;
      if (isTotalLine(line)) break;
      if (/Total|Grand|Subtotal/i.test(line) && line.length < 50) break;
      const nums = extractNumbers(line);
      // Fujitec: Sr No | Description | Part No | Qty | UOM | Unit Price | Total Price | CGST Rate | CGST Amt | SGST Rate | SGST Amt
      // So numbers on line: [srNo, qty, unitPrice, totalPrice, ...tax]. Use index 1,2,3 for qty, unitPrice, total.
      if (nums.length >= 4) {
        const srNo = nums[0];
        const qty = nums[1];
        const unitPrice = nums[2];
        const total = nums[3];
        const expectedTotal = qty * unitPrice;
        const totalOk = total > 0 && (Math.abs(total - expectedTotal) < 0.02 || Math.abs(total - expectedTotal) / total < 0.01);
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
      } else if (nums.length === 3) {
        const qty = nums[0];
        const unitPrice = nums[1];
        const total = nums[2];
        if (qty > 0 && unitPrice >= 0 && total > 0 && Math.abs(total - qty * unitPrice) < 0.02) {
          const descMatch = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
          const desc = descMatch.trim() || "Item";
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

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = lineItems.reduce((s, li) => s + li.total_amount, 0);
  const taxAmount = totalAmount - baseAmount;

  return {
    po_number: poNumber || "FUJITEC-PO",
    po_date: normalizeDate(poDateRaw),
    vendor_name: /SUPER\s*PRINTERS/i.test(text) ? "Super Printers" : vendorName,
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
    cgst_amount: 0,
    sgst_percent: 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: lineItems,
  };
}

/** Try Guindy Machine Tools (LOC) format */
function tryGuindy(text: string): ParsedPOData | null {
  if (!/GUINDY MACHINE TOOLS|LOC\/|LOC\s*\d+/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const gstExtra = /GST\s+EXTRA|CGST[, ]*SGST[, ]*IGST\s+EXTRA/i.test(text);

  const poNoDate = firstMatch(text, /PO\s+No\s*&\s*Date\s*[:\s]*([^\n]+)/i)
    || firstMatch(text, /(LOC\/?\s*\d+)\s*[/-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})?/i);
  let poNumber = "";
  let poDateRaw = "";
  if (poNoDate) {
    const parts = poNoDate.split(/\s+[/-]\s+|\s+/);
    poNumber = parts[0]?.trim() || "";
    poDateRaw = parts[1]?.trim() || firstMatch(text, /(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
  }
  if (!poNumber && /LOC/i.test(text)) {
    const m = text.match(/(LOC\/?\s*\d+)/i);
    poNumber = m ? m[1].replace(/\s/g, "") : "";
  }
  const deliveryDate = firstMatch(text, /Delivery\s+Date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  const paymentTerms = firstMatch(text, /Payment\s+Terms\s*[:\s]*([^\n]+?)(?=\s*(?:Delivery|GST|$))/i);

  const gstin = extractGstin(text);
  const vendorName = "Guindy Machine Tools Limited";

  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /Sl\.?\s*No|Item\s*Number|Description\s*\|?\s*Qty|Qty\s*\|?\s*UOM/i.test(l));
  if (tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isTableHeaderLine(line)) continue;
      if (isTotalLine(line) || (/Total|Grand|Subtotal|GST\s+EXTRA/i.test(line) && line.length < 50)) break;
      const nums = extractNumbers(line);
      // Guindy: Sl.No | Item/Description | Qty | UOM | Unit Price | Amount → [slNo, qty, unitPrice, amount]
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
  }

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = lineItems.reduce((s, li) => s + li.total_amount, 0);

  return {
    po_number: poNumber || "LOC-PO",
    po_date: normalizeDate(poDateRaw),
    vendor_name: vendorName,
    contact_no: null,
    contact_person: null,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(deliveryDate),
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
    line_items: lineItems,
  };
}

/** Try Contemporary Leather (SAP Business One) format */
function tryContemporary(text: string): ParsedPOData | null {
  if (!/Contemporary Leather|SAP Business One/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /PO\s+No\.?\s*[:\s]*(\d+)/i);
  const poDateRaw = firstMatch(text, /PO\s+Date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const deliveryDate = firstMatch(text, /Delivery\s+Date\s*[:\s]*([\d/-]+)/i);
  const paymentTerms = firstMatch(text, /Payment\s+terms?\s*[:\s]*([^\n]+?)(?=\s*(?:Contact|Delivery|$))/i);
  const contactPerson = firstMatch(text, /Contact\s+Person\s*[:\s]*([^\n]+?)(?=\s*(?:Contact\s+No|$))/i);
  const contactNo = firstMatch(text, /Contact\s+No\.?\s*[:\s]*([\d\s-+]{10,})/i);

  const gstin = extractGstin(text);
  const vendorName = "Contemporary Leather Pvt Ltd";

  const lineItems: ParsedPOLineItem[] = [];
  const tableStart = lines.findIndex((l) => /S\.?\s*No|Description\s*\|?\s*HSN|HSN\s+CODE\s*\|?\s*QTY/i.test(l));
  if (tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isTableHeaderLine(line)) continue;
      if (isTotalLine(line) || (/Total|Grand|Subtotal/i.test(line) && line.length < 40)) break;
      const nums = extractNumbers(line);
      if (nums.length >= 5) {
        const qty = nums[2] || nums[1];
        const unitPrice = nums.length >= 7 ? nums[4] : nums[3];
        const baseAmt = nums.length >= 6 ? nums[5] : qty * unitPrice;
        const totalAmt = nums[nums.length - 1] || baseAmt;
        const valid = qty > 0 && unitPrice >= 0 && baseAmt > 0 && (Math.abs(baseAmt - qty * unitPrice) < 0.02 || baseAmt >= qty * unitPrice * 0.99);
        if (valid) {
          const desc = line.replace(/[\d,]+(?:\.\d{2})?/g, " ").replace(/\s+/g, " ").trim().slice(0, 120).trim() || "Item";
          const hsnMatch = line.match(/\b(\d{4,8})\b/);
          const hsn = hsnMatch ? hsnMatch[1] : "";
          if (desc && !/^\d+$/.test(desc)) {
            const cgstPct = nums.length >= 8 ? nums[6] : 0;
            const sgstPct = nums.length >= 10 ? nums[8] : 0;
            const igstPct = nums.length >= 12 ? nums[10] : 0;
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
              igst_percent: igstPct,
              cgst_amount: baseAmt * (cgstPct / 100),
              sgst_amount: baseAmt * (sgstPct / 100),
              igst_amount: baseAmt * (igstPct / 100),
              total_amount: totalAmt,
              suggested_product_type: mapHsnToProductType(hsn),
            });
          }
        }
      }
    }
  }

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = lineItems.reduce((s, li) => s + li.total_amount, 0);
  const taxAmount = totalAmount - baseAmount;

  return {
    po_number: poNumber || "SAP-PO",
    po_date: normalizeDate(poDateRaw),
    vendor_name: vendorName,
    contact_no: contactNo,
    contact_person: contactPerson,
    contact_email: null,
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(deliveryDate),
    payment_terms: paymentTerms,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: taxAmount,
    cgst_percent: 0,
    cgst_amount: 0,
    sgst_percent: 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: lineItems,
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
    if (isTableHeaderLine(line) || isTotalLine(line)) continue;
    tryAddGenericLineItem(line, lineItems, 0.05);
  }

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);
  const totalAmount = lineItems.reduce((s, li) => s + li.total_amount, 0);

  return {
    po_number: poNumber || "PO",
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
    line_items: lineItems,
  };
}

/**
 * Parse PO text with built-in rule-based logic (no AI).
 * Tries Fujitec → Guindy → Contemporary → generic.
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

  const result = tryFujitec(t) || tryGuindy(t) || tryContemporary(t) || tryGeneric(t);
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
