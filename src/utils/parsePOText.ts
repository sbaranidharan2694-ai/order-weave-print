/**
 * Rule-based Purchase Order parser (no AI).
 * Supports: Fujitec (SUBCON), Guindy Machine Tools (LOC), Contemporary Leather (SAP).
 * Uses UOM-anchored extraction for reliable qty/price parsing.
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

function toNum(s: string | number | null | undefined): number {
  if (s == null) return 0;
  if (typeof s === "number") return isNaN(s) ? 0 : s;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? (m[1] || "").trim() || null : null;
}

/** Normalize various date formats to YYYY-MM-DD */
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // DDMMYYYY (8 digits, no separators) e.g. 04032026
  let m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    const [, d, mon, y] = m;
    return `${y}-${mon}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mon, y] = m;
    return `${y}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

function extractAllGstins(text: string): string[] {
  const matches = text.match(new RegExp(GSTIN_RE.source, "g"));
  return matches || [];
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

/** Lines that should NOT be parsed as line items */
function isFooterLine(line: string): boolean {
  return /^(Net\s+Value|Taxable|Total\s+Value|CGST|SGST|IGST|PAYMENT|For\s+GUINDY|GST\s+No|PAN\s+No|Vendor\s+(Code|GST)|TIN\s+No|Address|Manager|Page\s+\d|GOODS\s+INWARD)/i.test(line);
}

// ─── Guindy Machine Tools (LOC) ───────────────────────────────────────────

function tryGuindy(text: string): ParsedPOData | null {
  if (!/GUINDY MACHINE TOOLS|LOC[\s/]*\d{5,}/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const gstExtra = /GST\s+EXTRA|CGST[, ]*SGST[, ]*IGST\s+EXTRA/i.test(text);

  // Extract PO number: LOC/252566 or LOC252566
  let poNumber = "";
  let poDateRaw = "";

  // Try "PO No & Date : LOC/252566 04/03/2026" pattern
  const poNoDateLine = firstMatch(text, /PO\s+No\s*&?\s*Date\s*[:\s]*(.+)/i);
  if (poNoDateLine) {
    const locMatch = poNoDateLine.match(/(LOC[\s/]*\d+)/i);
    poNumber = locMatch ? locMatch[1].replace(/\s/g, "") : "";
    // Date with separators
    const dateMatch = poNoDateLine.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
    if (dateMatch) {
      poDateRaw = dateMatch[1];
    } else {
      // Date without separators: 8 digits DDMMYYYY
      const dateMatch2 = poNoDateLine.match(/(\d{8})/);
      if (dateMatch2) poDateRaw = dateMatch2[1];
    }
  }

  if (!poNumber) {
    const m = text.match(/(LOC[\s/]*\d+)/i);
    poNumber = m ? m[1].replace(/\s/g, "") : "";
  }
  if (!poDateRaw) {
    const m = text.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
    if (m) poDateRaw = m[1];
    else {
      const m2 = text.match(/LOC[\s/]*\d+\s+(\d{8})/i);
      if (m2) poDateRaw = m2[1];
    }
  }

  // Delivery date: with or without separators
  let deliveryDateRaw = firstMatch(text, /Delivery\s+Date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  if (!deliveryDateRaw) {
    deliveryDateRaw = firstMatch(text, /Delivery\s+Date\s*[:\s]*(\d{8})/i);
  }

  const paymentTerms = firstMatch(text, /Payment\s+Terms\s*[:\s]*([^\n]+?)(?=\s*(?:Delivery|GST|Vendor|$))/i);
  const preparedBy = firstMatch(text, /Prepared\s+by\s*[:\s]*([^\n]+)/i);
  const gstins = extractAllGstins(text);
  // Last GSTIN in Guindy format is typically the buyer's (at the footer)
  const buyerGstin = gstins.length > 0 ? gstins[gstins.length - 1] : null;

  // Parse line items
  const lineItems: ParsedPOLineItem[] = [];

  const tableStart = lines.findIndex((l) =>
    /Sl\.?\s*No|Item\s*(Number|Description)/i.test(l) && /Qty|Amount|Price/i.test(l)
  );

  if (tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isFooterLine(line)) break;
      if (/^\d+\.\s/.test(line) && !/^\d+\s/.test(line)) break; // numbered notes like "1. CGST..."

      // Pattern: ... QTY NOS UNIT_PRICE AMOUNT
      const uomMatch = line.match(/(\d[\d,]*(?:\.\d+)?)\s+(NOS|EA|PCS|SET|KG|MTR|SETS|DOZ|BOX)\s+([\d,.]+)\s+([\d,]+\.\d{2})/i);
      if (uomMatch) {
        const qty = toNum(uomMatch[1]);
        const uom = uomMatch[2].toUpperCase();
        const unitPrice = toNum(uomMatch[3]);
        const amount = toNum(uomMatch[4]);

        if (qty > 0 && amount > 0) {
          const qtyIdx = line.indexOf(uomMatch[0]);
          let descPart = line.slice(0, qtyIdx).trim();

          // Remove leading serial number
          descPart = descPart.replace(/^\d+\s+/, "");
          // Remove item code like STA001221
          descPart = descPart.replace(/^[A-Z]{2,4}\d{3,}\s+/, "");
          // Remove purchase req ref like "251803 / CON"
          descPart = descPart.replace(/\d{5,}\s*\/?\s*[A-Z]{2,4}\s*/g, "").trim();
          const description = descPart || "Item";

          const itemCodeMatch = line.match(/\b(STA\d+|[A-Z]{3}\d{5,})\b/);

          lineItems.push({
            ...emptyLineItem(),
            description,
            item_code: itemCodeMatch ? itemCodeMatch[1] : "",
            qty,
            uom,
            unit_price: unitPrice,
            base_amount: amount,
            total_amount: amount, // GST is extra for Guindy
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    }
  }

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);

  return {
    po_number: poNumber || "LOC-PO",
    po_date: normalizeDate(poDateRaw),
    vendor_name: "Guindy Machine Tools Limited",
    contact_no: null,
    contact_person: preparedBy,
    contact_email: null,
    gstin: buyerGstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(deliveryDateRaw),
    payment_terms: paymentTerms,
    currency: "INR",
    gst_extra: gstExtra,
    base_amount: baseAmount,
    total_amount: baseAmount,
    tax_amount: 0,
    cgst_percent: 0,
    cgst_amount: 0,
    sgst_percent: 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    remarks: gstExtra ? "CGST, SGST, IGST EXTRA" : null,
    line_items: lineItems,
  };
}

// ─── Fujitec India (SUBCON PURCHASE ORDER) ────────────────────────────────

function tryFujitec(text: string): ParsedPOData | null {
  if (!/SUBCON|FUJITEC|List\s*of\s*Subcon|ListOfSubcon/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // PO Number: "Purchase /Job Order No PO-FIN-M-26005326 (0)" or "Purchase Job Order No: PO-FIN-M-26005326"
  const poNumber = firstMatch(text, /Purchase\s*[\s/]*Job\s*Order\s*No\.?\s*[:\s]*([A-Z0-9][\w-]+)/i)
    || firstMatch(text, /Order\s+No\.?\s*[:\s]*([A-Z0-9][\w-]+)/i);

  // Date: "Date : 24-Feb-2026"
  const poDateRaw = firstMatch(text, /(?:^|\n)\s*Date\s*[:\s]+(\d{1,2}[/-][A-Za-z]{3}[/-]?\d{4})/im)
    || firstMatch(text, /(?:^|\n)\s*Date\s*[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{4})/im);

  // Completion Date: "Place of Completion Date: 27-Feb-2026" or "Completion Date: ..."
  const completionDate = firstMatch(text, /(?:Place\s+of\s+)?Completion\s+Date\s*[:\s]*([\d][\d/-A-Za-z]+\d{4})/i);

  // Payment terms: "Terms of Payment in Days: 30"
  const paymentDays = firstMatch(text, /Terms\s+of\s+Payment\s+in\s+Days\s*[:\s]*(\d+)/i);

  // Vendor name = PO Organization (buyer company), NOT the vendor
  const vendorName = firstMatch(text, /PO\s+Organization\s*[:\s]*(.+?)(?=\s{2,}|$)/i) || "Fujitec India Pvt Ltd";

  // Contact person from Approved By
  const contactPerson = firstMatch(text, /Approved\s+By\s*[:\s]*([A-Za-z\s.]+?)(?=\s{2,}|$)/i);

  const gstins = extractAllGstins(text);
  // First GSTIN is buyer (Fujitec), second is vendor
  const buyerGstin = gstins.length > 0 ? gstins[0] : null;
  const vendorGstin = gstins.length > 1 ? gstins[1] : null;

  const lineItems: ParsedPOLineItem[] = [];

  // Find table header row
  const tableStart = lines.findIndex((l) =>
    /Sr\s*No/i.test(l) && /Description|Qty|Unit\s*Price/i.test(l)
  );

  if (tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      // Stop at totals/footer/terms - exclude GST No, PAN No, Vendor lines
      if (/^(Total|Grand|Subtotal|GST\s|Remarks|INR|Rupees|Chennai|Plot|Delivery|Terms|Prepared|Approved|PCD|Page|This\s+order)/i.test(line)) break;
      if (/GST\s+No|PAN\s+No|Vendor\s+(Code|GST)/i.test(line)) continue;
      if (line.length < 5) continue;

      // Must start with a numeric Sr No
      if (!/^\d+\s/.test(line)) continue;

      // Pattern: QTY UOM UNIT_PRICE TOTAL_PRICE [CGST_RATE CGST_AMT SGST_RATE SGST_AMT]
      const uomMatch = line.match(/(\d[\d,]*(?:\.\d+)?)\s+(Nos|NOS|EA|PCS|SET|KG|MTR)\s+([\d,.]+)\s+([\d,]+\.\d{2})/i);
      if (uomMatch) {
        const qty = toNum(uomMatch[1]);
        const uom = uomMatch[2].toUpperCase();
        const unitPrice = toNum(uomMatch[3]);
        const totalPrice = toNum(uomMatch[4]);

        if (qty > 0 && totalPrice > 0) {
          // Extract description: between sr no and qty
          const qtyIdx = line.indexOf(uomMatch[0]);
          let descPart = line.slice(0, qtyIdx).trim();
          // Remove leading serial number
          descPart = descPart.replace(/^\d+\s+/, "");
          // Remove dates like 24-02-2026
          descPart = descPart.replace(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g, "").trim();
          // Remove part numbers
          descPart = descPart.replace(/[A-Z]{2,3}-\d{3,}/g, "").trim();
          descPart = descPart.replace(/\s{2,}/g, " ").trim();
          const description = descPart || "Item";

          // Extract tax info after total price
          const afterTotal = line.slice(line.indexOf(uomMatch[4]) + uomMatch[4].length).trim();
          const taxNums = afterTotal.match(/(\d+)\s+([\d,]+(?:\.\d+)?)\s+(\d+)\s+([\d,]+(?:\.\d+)?)/);

          let cgstPct = 0, cgstAmt = 0, sgstPct = 0, sgstAmt = 0;
          if (taxNums) {
            cgstPct = toNum(taxNums[1]);
            cgstAmt = toNum(taxNums[2]);
            sgstPct = toNum(taxNums[3]);
            sgstAmt = toNum(taxNums[4]);
          }

          lineItems.push({
            ...emptyLineItem(),
            description,
            qty,
            uom,
            unit_price: unitPrice,
            base_amount: totalPrice,
            cgst_percent: cgstPct,
            cgst_amount: cgstAmt,
            sgst_percent: sgstPct,
            sgst_amount: sgstAmt,
            total_amount: totalPrice + cgstAmt + sgstAmt,
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    }
  }

  // Fallback: parse without UOM markers using qty*price=total triplet
  if (lineItems.length === 0 && tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(Total|Grand|Subtotal|GST\s|Remarks|INR|Rupees|Chennai|Plot|Delivery|Terms|Prepared|Approved)/i.test(line)) break;
      if (/GST\s+No|PAN\s+No|Vendor\s+(Code|GST)/i.test(line)) continue;
      if (line.length < 5) continue;
      if (!/^\d+\s/.test(line)) continue;

      const allNums: { val: number; idx: number }[] = [];
      const numRe = /(?<![.\d])([\d,]+(?:\.\d{1,2})?)(?![.\d])/g;
      let nm: RegExpExecArray | null;
      while ((nm = numRe.exec(line)) !== null) {
        allNums.push({ val: toNum(nm[1]), idx: nm.index });
      }

      if (allNums.length >= 3) {
        let found = false;
        for (let a = 1; a < allNums.length - 2 && !found; a++) {
          for (let b = a + 1; b < allNums.length - 1 && !found; b++) {
            for (let c = b + 1; c < allNums.length && !found; c++) {
              const qty = allNums[a].val;
              const price = allNums[b].val;
              const total = allNums[c].val;
              if (qty > 0 && qty < 100000 && price > 0 && total > 0 && Math.abs(total - qty * price) < 1) {
                const descEnd = allNums[a].idx;
                let desc = line.slice(0, descEnd).replace(/^\d+\s+/, "").trim();
                desc = desc.replace(/\s{2,}/g, " ").trim();
                if (desc.length > 1 && !/^(Total|Subtotal)$/i.test(desc)) {
                  let cgstPct = 0, cgstAmt = 0, sgstPct = 0, sgstAmt = 0;
                  if (c + 4 < allNums.length) {
                    cgstPct = allNums[c + 1].val;
                    cgstAmt = allNums[c + 2].val;
                    sgstPct = allNums[c + 3].val;
                    sgstAmt = allNums[c + 4].val;
                  }
                  lineItems.push({
                    ...emptyLineItem(),
                    description: desc,
                    qty,
                    unit_price: price,
                    base_amount: total,
                    cgst_percent: cgstPct,
                    cgst_amount: cgstAmt,
                    sgst_percent: sgstPct,
                    sgst_amount: sgstAmt,
                    total_amount: total + cgstAmt + sgstAmt,
                    suggested_product_type: mapHsnToProductType(""),
                  });
                  found = true;
                }
              }
            }
          }
        }
      }
    }
  }

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);
  const totalCgst = lineItems.reduce((s, li) => s + li.cgst_amount, 0);
  const totalSgst = lineItems.reduce((s, li) => s + li.sgst_amount, 0);
  const totalAmount = baseAmount + totalCgst + totalSgst;

  return {
    po_number: poNumber || "FUJITEC-PO",
    po_date: normalizeDate(poDateRaw),
    vendor_name: vendorName,
    contact_no: null,
    contact_person: contactPerson,
    contact_email: null,
    gstin: buyerGstin,
    vendor_gstin: vendorGstin,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(completionDate),
    payment_terms: paymentDays ? `${paymentDays} Days` : null,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: totalCgst + totalSgst,
    cgst_percent: 0,
    cgst_amount: totalCgst,
    sgst_percent: 0,
    sgst_amount: totalSgst,
    igst_percent: 0,
    igst_amount: 0,
    remarks: null,
    line_items: lineItems,
  };
}

// ─── Contemporary Leather (SAP Business One) ─────────────────────────────

function tryContemporary(text: string): ParsedPOData | null {
  if (!/Contemporary Leather|SAP Business One/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /PO\s+No\.?\s*[:\s]*(\d+)/i);
  const poDateRaw = firstMatch(text, /PO\s+Date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const deliveryDate = firstMatch(text, /Delivery\s+Date\s*[:\s]*([\d/-]+)/i);
  const paymentTerms = firstMatch(text, /Payment\s+terms?\s*[:\s]*([^\n]+?)(?=\s*(?:Currency|Contact|Delivery|GSTIN|$))/i);
  const contactPerson = firstMatch(text, /Contact\s+Person\s*[:\s]*([^\n]+?)(?=\s*(?:Contact\s+No|$))/i);
  const contactNo = firstMatch(text, /Contact\s+No\.?\s*[:\s]*([\d\s-+]{10,})/i);

  const gstins = extractAllGstins(text);
  const buyerGstin = gstins.length > 0 ? gstins[0] : null;
  const vendorGstin = gstins.length > 1 ? gstins[1] : null;

  const remarksMatch = text.match(/Remarks\s*[:\s]*\n?(.*?)(?=\n\s*(?:Authorized|Origin|This is a computer|Printed))/is);
  const remarks = remarksMatch ? remarksMatch[1].trim().replace(/\n/g, " ") : null;

  const lineItems: ParsedPOLineItem[] = [];

  // Find table header
  const tableStart = lines.findIndex((l) =>
    /S\.?\s*No/i.test(l) && /Description|HSN/i.test(l)
  );

  if (tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(SubTotal|Total|Base\s+Amount|Tax|Discount|Amount\s+in|Remarks|Origin|Authorized|Printed|CGST|SGST|IGST)/i.test(line)) break;
      if (line.length < 10) continue;

      // Must start with a numeric S.No
      if (!/^\d+\s/.test(line)) continue;

      // Contemporary format: "1  CUT BOARDS 295 X 205 MM  4820  2400.00  UNIT  1 NOS  3.50  8400.00  9.00  756.00  9.00  756.00  0.00  0.00"
      // Or with "2 NOS": "1  WHITE BOARD 40 X 22CM  4819  4600.00  UNIT  2  NOS  4.95  22770.00  9.00  2049.30  9.00  2049.30  0.00  0.00"

      // Find NOS marker position
      const uomIdx = line.search(/\bNOS\b/i);
      if (uomIdx < 0) continue;

      // Extract everything after "NOS": unit_price base_amount cgst_rate cgst_amt sgst_rate sgst_amt igst_rate igst_amt
      const afterNos = line.slice(uomIdx).replace(/^NOS\s+/i, "");
      const amounts = afterNos.match(/([\d,]+(?:\.\d{1,2})?)/g);
      if (!amounts || amounts.length < 2) continue;

      const unitPrice = toNum(amounts[0]);
      const baseAmount = toNum(amounts[1]);
      let cgstRate = 0, cgstAmt = 0, sgstRate = 0, sgstAmt = 0, igstRate = 0, igstAmt = 0;
      if (amounts.length >= 8) {
        cgstRate = toNum(amounts[2]);
        cgstAmt = toNum(amounts[3]);
        sgstRate = toNum(amounts[4]);
        sgstAmt = toNum(amounts[5]);
        igstRate = toNum(amounts[6]);
        igstAmt = toNum(amounts[7]);
      }

      // Extract parts before NOS
      const beforeNos = line.slice(0, uomIdx).trim();

      // Find qty: the decimal number before "UNIT" e.g. "4820  2400.00  UNIT  1" or "4820  2400.00  UNIT  2"
      // Pattern: look for NUMBER.00 UNIT [N] (where N is the multiplier before NOS)
      const qtyUnitMatch = beforeNos.match(/([\d,]+\.\d{2})\s+UNIT(?:\s+(\d+))?$/i);
      let qty = 0;
      let hsnCode = "";

      if (qtyUnitMatch) {
        qty = toNum(qtyUnitMatch[1]);
        // Part before qty: contains description and HSN
        const beforeQty = beforeNos.slice(0, beforeNos.lastIndexOf(qtyUnitMatch[0])).trim();
        // HSN is typically a 4-digit number
        const hsnMatch = beforeQty.match(/\b(\d{4})\b/);
        if (hsnMatch) hsnCode = hsnMatch[1];

        // Description: remove S.No, HSN
        let description = beforeQty.replace(/^\d+\s+/, ""); // remove leading S.No
        if (hsnCode) description = description.replace(new RegExp("\\b" + hsnCode + "\\b"), "");
        description = description.replace(/\s{2,}/g, " ").trim();

        if (qty > 0 && baseAmount > 0) {
          lineItems.push({
            ...emptyLineItem(),
            description: description || "Item",
            hsn_code: hsnCode,
            qty,
            uom: "NOS",
            unit_price: unitPrice,
            base_amount: baseAmount,
            cgst_percent: cgstRate,
            cgst_amount: cgstAmt,
            sgst_percent: sgstRate,
            sgst_amount: sgstAmt,
            igst_percent: igstRate,
            igst_amount: igstAmt,
            total_amount: baseAmount + cgstAmt + sgstAmt + igstAmt,
            suggested_product_type: mapHsnToProductType(hsnCode),
          });
        }
      } else {
        // Fallback: try to find qty differently
        // Remove leading S.No
        let rest = beforeNos.replace(/^\d+\s+/, "");
        // Find all numbers
        const nums = rest.match(/([\d,]+(?:\.\d{1,2})?)/g);
        if (nums && nums.length >= 1) {
          // Last number before NOS is likely the qty or multiplier
          qty = toNum(nums[nums.length - 1]);
          // If qty < 10, might be multiplier, check second-to-last
          if (qty < 10 && nums.length >= 2) {
            qty = toNum(nums[nums.length - 2]);
          }
          const hsnMatch = rest.match(/\b(\d{4})\b/);
          if (hsnMatch) hsnCode = hsnMatch[1];
          let description = rest;
          if (hsnCode) description = description.replace(new RegExp("\\b" + hsnCode + "\\b"), "");
          // Remove numbers that look like qty
          description = description.replace(/([\d,]+\.\d{2})/g, "").replace(/\s+UNIT\s*/i, " ").replace(/\s{2,}/g, " ").trim();

          if (qty > 0 && baseAmount > 0) {
            lineItems.push({
              ...emptyLineItem(),
              description: description || "Item",
              hsn_code: hsnCode,
              qty,
              uom: "NOS",
              unit_price: unitPrice,
              base_amount: baseAmount,
              cgst_percent: cgstRate,
              cgst_amount: cgstAmt,
              sgst_percent: sgstRate,
              sgst_amount: sgstAmt,
              igst_percent: igstRate,
              igst_amount: igstAmt,
              total_amount: baseAmount + cgstAmt + sgstAmt + igstAmt,
              suggested_product_type: mapHsnToProductType(hsnCode),
            });
          }
        }
      }
    }
  }

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);
  const totalCgst = lineItems.reduce((s, li) => s + li.cgst_amount, 0);
  const totalSgst = lineItems.reduce((s, li) => s + li.sgst_amount, 0);
  const totalIgst = lineItems.reduce((s, li) => s + li.igst_amount, 0);
  const totalAmount = baseAmount + totalCgst + totalSgst + totalIgst;

  return {
    po_number: poNumber || "SAP-PO",
    po_date: normalizeDate(poDateRaw),
    vendor_name: "Contemporary Leather Pvt Ltd",
    contact_no: contactNo?.replace(/\s/g, "") || null,
    contact_person: contactPerson,
    contact_email: null,
    gstin: buyerGstin,
    vendor_gstin: vendorGstin,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(deliveryDate),
    payment_terms: paymentTerms,
    currency: "INR",
    gst_extra: false,
    base_amount: baseAmount,
    total_amount: totalAmount,
    tax_amount: totalCgst + totalSgst + totalIgst,
    cgst_percent: 0,
    cgst_amount: totalCgst,
    sgst_percent: 0,
    sgst_amount: totalSgst,
    igst_percent: 0,
    igst_amount: totalIgst,
    remarks,
    line_items: lineItems,
  };
}

// ─── Generic fallback ─────────────────────────────────────────────────────

function tryGeneric(text: string): ParsedPOData | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /(?:PO\s*#?|Order\s*No\.?|P\.?O\.?\s*No\.?)\s*[:\s]*([A-Z0-9/-]+)/i)
    || firstMatch(text, /([A-Z]{2,5}\/?\s*\d{5,})/i);
  const poDateRaw = firstMatch(text, /(?:Date|PO\s+Date)\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)
    || firstMatch(text, /(\d{1,2}[/-][A-Za-z]{3}[/-]\d{4})/);
  const gstin = extractAllGstins(text)[0] || null;

  const lineItems: ParsedPOLineItem[] = [];

  for (const line of lines) {
    if (/^(Sr\s*No|S\.No|Sl|Total|Subtotal|Grand|Page|Net|Base|Tax|Discount|Amount)/i.test(line)) continue;
    if (/GST\s+No|PAN\s+No|Vendor\s+(Code|GST)/i.test(line)) continue;

    // UOM-anchored pattern
    const uomMatch = line.match(/(\d[\d,]*(?:\.\d+)?)\s+(NOS|EA|PCS|SET|KG|MTR|DOZ|BOX)\s+([\d,.]+)\s+([\d,]+\.\d{2})/i);
    if (uomMatch) {
      const qty = toNum(uomMatch[1]);
      const unitPrice = toNum(uomMatch[3]);
      const amount = toNum(uomMatch[4]);
      if (qty > 0 && amount > 0) {
        const qtyIdx = line.indexOf(uomMatch[0]);
        let desc = line.slice(0, qtyIdx).replace(/^\d+\s+/, "").trim();
        desc = desc.replace(/\s{2,}/g, " ").trim();
        if (desc.length > 1) {
          lineItems.push({
            ...emptyLineItem(),
            description: desc || "Item",
            qty,
            uom: uomMatch[2].toUpperCase(),
            unit_price: unitPrice,
            base_amount: amount,
            total_amount: amount,
          });
        }
      }
      continue;
    }

    // Fallback: qty * price = total triplet
    const nums: number[] = [];
    let m2: RegExpExecArray | null;
    const numRe = /(?<![-\d.])([\d,]+(?:\.\d{1,2})?)(?!\d)/g;
    while ((m2 = numRe.exec(line)) !== null) nums.push(toNum(m2[1]));

    if (nums.length >= 3) {
      let bestMatch: { qty: number; price: number; total: number } | null = null;
      for (let a = 0; a < nums.length - 2; a++) {
        for (let b = a + 1; b < nums.length - 1; b++) {
          for (let c = b + 1; c < nums.length; c++) {
            const qty = nums[a], price = nums[b], total = nums[c];
            if (qty > 0 && qty < 100000 && price > 0 && total > 0 && Math.abs(total - qty * price) < 1) {
              if (!bestMatch || qty > bestMatch.qty) bestMatch = { qty, price, total };
            }
          }
        }
      }
      if (bestMatch) {
        const desc = line.replace(/[\d,]+(?:\.\d{1,2})?/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        if (desc.length > 2 && !/^(Total|Subtotal|Grand|Page|\d+)$/i.test(desc)) {
          lineItems.push({
            ...emptyLineItem(),
            description: desc,
            qty: bestMatch.qty,
            unit_price: bestMatch.price,
            base_amount: bestMatch.total,
            total_amount: bestMatch.total,
          });
        }
      }
    }
  }

  if (lineItems.length === 0) return null;

  const baseAmount = lineItems.reduce((s, li) => s + li.base_amount, 0);

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
    total_amount: baseAmount,
    tax_amount: 0,
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

// ─── Main entry point ─────────────────────────────────────────────────────

const EMPTY_RESULT: ParsedPOData = {
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

/**
 * Parse PO text with built-in rule-based logic (no AI).
 * Tries Guindy → Fujitec → Contemporary → generic.
 */
export function parsePOText(pdfText: string): ParsedPOData {
  const t = pdfText.trim();
  if (!t || t.length < 20) return { ...EMPTY_RESULT };

  const result = tryGuindy(t) || tryFujitec(t) || tryContemporary(t) || tryGeneric(t);
  return result || { ...EMPTY_RESULT };
}
