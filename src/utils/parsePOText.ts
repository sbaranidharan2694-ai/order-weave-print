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

  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
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

function extractGstin(text: string): string | null {
  const m = text.match(GSTIN_RE);
  return m ? m[0] : null;
}

/** Extract all GSTINs from text */
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

/** Extract trailing amounts from a string (right-to-left) */
function extractTrailingAmounts(text: string): { amounts: number[]; beforeAmounts: string } {
  const amounts: number[] = [];
  let remaining = text.trimEnd();
  
  // Keep extracting numbers from the right
  while (true) {
    const m = remaining.match(/([\d,]+\.\d{2})\s*$/);
    if (!m) break;
    amounts.unshift(toNum(m[1]));
    remaining = remaining.slice(0, m.index).trimEnd();
  }
  
  // Also try integers at the end (like tax rates: 9, 0)
  return { amounts, beforeAmounts: remaining };
}

// ─── Guindy Machine Tools (LOC) ───────────────────────────────────────────

function tryGuindy(text: string): ParsedPOData | null {
  if (!/GUINDY MACHINE TOOLS|LOC\//i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const gstExtra = /GST\s+EXTRA|CGST[, ]*SGST[, ]*IGST\s+EXTRA/i.test(text);

  // Extract PO number and date from "PO No & Date : LOC/252566 04/03/2026"
  const poNoDateLine = firstMatch(text, /PO\s+No\s*&?\s*Date\s*[:\s]*(.+)/i);
  let poNumber = "";
  let poDateRaw = "";
  if (poNoDateLine) {
    const locMatch = poNoDateLine.match(/(LOC\/?\s*\d+)/i);
    poNumber = locMatch ? locMatch[1].replace(/\s/g, "") : "";
    const dateMatch = poNoDateLine.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
    poDateRaw = dateMatch ? dateMatch[1] : "";
  }
  if (!poNumber) {
    const m = text.match(/(LOC\/?\s*\d+)/i);
    poNumber = m ? m[1].replace(/\s/g, "") : "";
  }
  if (!poDateRaw) {
    const m = text.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{4})/);
    poDateRaw = m ? m[1] : "";
  }

  const deliveryDate = firstMatch(text, /Delivery\s+Date\s*[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  const paymentTerms = firstMatch(text, /Payment\s+Terms\s*[:\s]*([^\n]+?)(?=\s*(?:Delivery|GST|$))/i);
  const preparedBy = firstMatch(text, /Prepared\s+by\s*[:\s]*([^\n]+)/i);
  const gstins = extractAllGstins(text);
  const gstin = gstins.length > 0 ? gstins[0] : null;

  // Parse line items using UOM anchor pattern: QTY NOS PRICE AMOUNT
  const lineItems: ParsedPOLineItem[] = [];
  
  // Find table start
  const tableStart = lines.findIndex((l) =>
    /Sl\.?\s*No|Item\s*(Number|Description)/i.test(l) && /Qty|Amount|Price/i.test(l)
  );
  
  if (tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      // Stop at totals/footer
      if (/^(Net\s+Value|Taxable|Total\s+Value|CGST|SGST|IGST|PAYMENT|For\s+GUINDY)/i.test(line)) break;
      if (/^\d+\.\s/.test(line) && !/^\d+\s/.test(line)) break; // numbered notes like "1. CGST..."
      
      // Pattern: ... QTY NOS UNIT_PRICE AMOUNT ...
      // e.g. "1 STA001221 251803 / CON FINAL INSPECTION TAG (BLUE COLOUR) 3000 NOS 1.50 4,500.00"
      const uomMatch = line.match(/(\d[\d,]*(?:\.\d+)?)\s+(NOS|EA|PCS|SET|KG|MTR|SETS|DOZ|BOX)\s+([\d,.]+)\s+([\d,]+\.\d{2})/i);
      if (uomMatch) {
        const qty = toNum(uomMatch[1]);
        const uom = uomMatch[2].toUpperCase();
        const unitPrice = toNum(uomMatch[3]);
        const amount = toNum(uomMatch[4]);
        
        if (qty > 0 && amount > 0) {
          // Extract description: everything before the qty
          const qtyIdx = line.indexOf(uomMatch[0]);
          let descPart = line.slice(0, qtyIdx).trim();
          
          // Remove leading serial number and item code
          descPart = descPart.replace(/^\d+\s+/, ""); // remove "1 "
          descPart = descPart.replace(/^[A-Z]{2,3}\d{3,}\s+/, ""); // remove "STA001221 "
          descPart = descPart.replace(/^\d+\s*\/?\s*\w+\s+/, ""); // remove "251803 / CON "
          // Try to keep just the description
          const descClean = descPart.replace(/\d{5,}\s*\/?\s*\w{2,4}\s*/g, "").trim();
          const description = descClean || descPart || "Item";
          
          // Extract item code
          const itemCodeMatch = line.match(/\b(STA\d+|[A-Z]{3}\d{5,})\b/);
          
          lineItems.push({
            ...emptyLineItem(),
            description,
            item_code: itemCodeMatch ? itemCodeMatch[1] : "",
            qty,
            uom,
            unit_price: unitPrice,
            base_amount: amount,
            total_amount: amount,
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
    gstin,
    vendor_gstin: null,
    delivery_address: null,
    buyer_address: null,
    delivery_date: normalizeDate(deliveryDate),
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
  if (!/SUBCON PURCHASE ORDER|FUJITEC/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const poNumber = firstMatch(text, /Purchase\s*(?:\/?\s*Job)?\s*Order\s+No\.?\s*[:\s]*([A-Z0-9-]+)/i)
    || firstMatch(text, /Order\s+No\.?\s*[:\s]*([A-Z0-9-]+)/i);
  const poDateRaw = firstMatch(text, /(?:^|\s)Date\s*[:\s]*(\d{1,2}[/-][A-Za-z]{3}[/-]?\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4})/i);
  const completionDate = firstMatch(text, /Completion\s+Date\s*[:\s]*([\d/-A-Za-z]+)/i)
    || firstMatch(text, /Place\s+of\s+Completion\s+Date\s*[:\s]*([\d/-A-Za-z]+)/i);
  const paymentDays = firstMatch(text, /Terms\s+of\s+Payment\s+in\s+Days\s*[:\s]*(\d+)/i);
  const vendorCode = firstMatch(text, /Vendor\s+Code\s*[:\s]*(\d+)/i);
  
  const gstins = extractAllGstins(text);
  // First GSTIN is typically buyer (Fujitec), second is vendor
  const buyerGstin = gstins.length > 0 ? gstins[0] : null;
  const vendorGstin = gstins.length > 1 ? gstins[1] : null;

  const lineItems: ParsedPOLineItem[] = [];
  
  // Find table header
  const tableStart = lines.findIndex((l) =>
    /Sr\s*No/i.test(l) && /Description|Qty|Unit\s*Price/i.test(l)
  );
  
  if (tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(Total|Grand|Subtotal|GST|Remarks|INR|Rupees|Chennai|Plot|Delivery|Terms)/i.test(line)) break;
      if (line.length < 5) continue;
      
      // Pattern: QTY UOM UNIT_PRICE TOTAL_PRICE [CGST_RATE CGST_AMT SGST_RATE SGST_AMT]
      // e.g. "1 Safety inspection tag  24-02-2026  3000 Nos 3.50 10,500.00 9 945 9 945"
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
          // Remove extra whitespace
          descPart = descPart.replace(/\s{2,}/g, " ").trim();
          const description = descPart || "Item";
          
          // Extract tax info from after total price
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
            total_amount: totalPrice,
            suggested_product_type: mapHsnToProductType(""),
          });
        }
      }
    }
  }

  // Fallback: parse table rows without UOM markers (simple Qty / Unit Price / Amount)
  if (lineItems.length === 0 && tableStart >= 0) {
    for (let i = tableStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^(Total|Grand|Subtotal|GST|Remarks|INR|Rupees|Chennai|Plot|Delivery|Terms)/i.test(line)) break;
      if (line.length < 5) continue;
      
      // Extract all numbers from the line
      const allNums: { val: number; idx: number }[] = [];
      const numRe = /(?<![.\d])([\d,]+(?:\.\d{1,2})?)(?![.\d])/g;
      let nm: RegExpExecArray | null;
      while ((nm = numRe.exec(line)) !== null) {
        allNums.push({ val: toNum(nm[1]), idx: nm.index });
      }
      
      if (allNums.length >= 3) {
        // Skip first number (likely Sr No), then find qty*price=amount triplet
        // Try from index 1 onwards
        let found = false;
        for (let a = 1; a < allNums.length - 2 && !found; a++) {
          for (let b = a + 1; b < allNums.length - 1 && !found; b++) {
            for (let c = b + 1; c < allNums.length && !found; c++) {
              const qty = allNums[a].val;
              const price = allNums[b].val;
              const total = allNums[c].val;
              if (qty > 0 && qty < 100000 && price > 0 && total > 0 && Math.abs(total - qty * price) < 1) {
                // Get description: text between sr no and qty
                const descEnd = allNums[a].idx;
                let desc = line.slice(0, descEnd).replace(/^\d+\s+/, "").trim();
                desc = desc.replace(/\s{2,}/g, " ").trim();
                if (desc.length > 1 && !/^(Total|Subtotal)$/i.test(desc)) {
                  // Check for tax columns after total
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
                    total_amount: total,
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
    vendor_name: "Fujitec India Pvt Ltd",
    contact_no: null,
    contact_person: null,
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
  // First is buyer (Contemporary), second is vendor (Super Printers)
  const buyerGstin = gstins.length > 0 ? gstins[0] : null;
  const vendorGstin = gstins.length > 1 ? gstins[1] : null;

  // Extract remarks
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
      if (/^(SubTotal|Total|Base\s+Amount|Tax|Discount|Amount\s+in|Remarks|Origin|Authorized|Printed)/i.test(line)) break;
      if (line.length < 10) continue;
      
      // Strategy: Find NOS/EA UOM marker, then extract amounts after it
      // Pattern: ... QTY ... UOM_MARKER UNIT_PRICE BASE_AMT CGST_RATE CGST_AMT SGST_RATE SGST_AMT IGST_RATE IGST_AMT
      // Contemporary format: "1 NOS" is the UOM column (1 unit = 1 NOS)
      
      // Try to find the UOM marker pattern: "N NOS" or just "NOS"
      const uomIdx = line.search(/\d\s+NOS\s+|NOS\s+[\d,.]/i);
      if (uomIdx < 0) continue;
      
      // Find the part after UOM
      const afterUomMatch = line.match(/(?:\d\s+)?NOS\s+([\d,.]+)\s+([\d,]+\.\d{2})\s+([\d,.]+)\s+([\d,]+\.\d{2})\s+([\d,.]+)\s+([\d,]+\.\d{2})\s+([\d,.]+)\s+([\d,]+\.\d{2})/i);
      if (!afterUomMatch) continue;
      
      const unitPrice = toNum(afterUomMatch[1]);
      const baseAmount = toNum(afterUomMatch[2]);
      const cgstRate = toNum(afterUomMatch[3]);
      const cgstAmt = toNum(afterUomMatch[4]);
      const sgstRate = toNum(afterUomMatch[5]);
      const sgstAmt = toNum(afterUomMatch[6]);
      const igstRate = toNum(afterUomMatch[7]);
      const igstAmt = toNum(afterUomMatch[8]);
      
      // Extract parts before UOM
      const beforeUom = line.slice(0, uomIdx).trim();
      
      // Find qty: look for a number followed by optional ".00" before UNIT/WHSE
      const qtyMatch = beforeUom.match(/([\d,]+(?:\.\d+)?)\s+(?:UNIT|WHSE|\d)/i)
        || beforeUom.match(/([\d,]+\.\d{2})\s*$/);
      
      // Find HSN: 4-digit number
      const hsnMatch = beforeUom.match(/\b(\d{4})\b/);
      
      // Extract description
      let description = beforeUom;
      // Remove leading S.No
      description = description.replace(/^\d+\s+/, "");
      // Remove HSN code
      if (hsnMatch) description = description.replace(hsnMatch[0], "");
      // Remove qty and everything after
      if (qtyMatch) {
        const qtyIdx2 = description.lastIndexOf(qtyMatch[1]);
        if (qtyIdx2 >= 0) description = description.slice(0, qtyIdx2);
      }
      description = description.replace(/\s+/g, " ").trim();
      
      let qty = 0;
      if (qtyMatch) {
        qty = toNum(qtyMatch[1]);
      } else if (unitPrice > 0 && baseAmount > 0) {
        qty = Math.round(baseAmount / unitPrice);
      }
      
      if (qty > 0 && baseAmount > 0) {
        lineItems.push({
          ...emptyLineItem(),
          description: description || "Item",
          hsn_code: hsnMatch ? hsnMatch[1] : "",
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
          suggested_product_type: mapHsnToProductType(hsnMatch ? hsnMatch[1] : ""),
        });
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
  const gstin = extractGstin(text);

  const lineItems: ParsedPOLineItem[] = [];
  
  for (const line of lines) {
    // Skip headers and totals
    if (/^(Sr\s*No|S\.No|Sl|Total|Subtotal|Grand|Page|Net|Base|Tax|Discount|Amount)/i.test(line)) continue;
    
    // Try UOM-anchored pattern first
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
    
    // Fallback: look for qty * price = total pattern
    const nums: number[] = [];
    let m2: RegExpExecArray | null;
    const numRe = /(?<![-\d.])([\d,]+(?:\.\d{1,2})?)(?!\d)/g;
    while ((m2 = numRe.exec(line)) !== null) nums.push(toNum(m2[1]));
    
    if (nums.length >= 3) {
      // Find the best triplet where qty * price ≈ total (prefer largest qty)
      let bestMatch: { qty: number; price: number; total: number } | null = null;
      for (let a = 0; a < nums.length - 2; a++) {
        for (let b = a + 1; b < nums.length - 1; b++) {
          for (let c = b + 1; c < nums.length; c++) {
            const qty = nums[a];
            const price = nums[b];
            const total = nums[c];
            if (qty > 0 && qty < 100000 && price > 0 && total > 0 && Math.abs(total - qty * price) < 1) {
              if (!bestMatch || qty > bestMatch.qty) {
                bestMatch = { qty, price, total };
              }
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
