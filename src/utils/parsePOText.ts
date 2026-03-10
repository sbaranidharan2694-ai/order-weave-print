/**
 * Rule-based fallback parser for purchase order text.
 * Used when AI parse-po edge function fails. Extracts common PO fields via regex.
 */

export interface RuleParsedPO {
  po_number: string | null;
  po_date: string | null;
  customer?: {
    name: string | null;
    address: string | null;
    gst_number: string | null;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
  };
  vendor_name?: string | null;
  delivery_address?: string | null;
  gstin?: string | null;
  contact_no?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  payment_terms: string | null;
  delivery_date: string | null;
  line_items: Array<{
    sno?: number;
    description: string;
    quantity: number;
    unit?: string;
    qty?: number;
    unit_price: number;
    hsn_code?: string | null;
    gst_rate?: number;
    gst_amount?: number;
    line_total?: number;
  }>;
  subtotal?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  discount_amount?: number;
  total_amount?: number;
  amount_in_words?: string | null;
  shipping_address?: string | null;
  notes?: string | null;
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
}

/** Parse amount: strip commas and non-numeric chars, then parseFloat */
function toNum(s: string | undefined | null): number {
  if (s == null || s === "") return 0;
  const n = parseFloat(String(s).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

const AMOUNT_REGEX = /\d{1,3}(,\d{3})*(\.\d{2})?|\d+(\.\d{2})?/g;

function toDate(s: string | undefined | null): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const d = trimmed.match(/(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})/);
  if (d) {
    const [, day, month, year] = d;
    const y = year.length === 2 ? (parseInt(year, 10) < 50 ? "20" + year : "19" + year) : year;
    return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = trimmed.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

const GST_REGEX = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i;

/**
 * Rule-based extraction from raw PO text. Returns structure compatible with ImportPO form.
 */
export function parsePOText(text: string): RuleParsedPO {
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);

  let po_number: string | null = null;
  let po_date: string | null = null;
  let vendorName: string | null = null;
  let address: string | null = null;
  let gstin: string | null = null;
  let contactPerson: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  let paymentTerms: string | null = null;
  let deliveryDate: string | null = null;
  let totalAmount = 0;
  const lineItems: RuleParsedPO["line_items"] = [];
  const warnings: string[] = ["Parsed with rule-based fallback; please verify fields."];

  // PO number: PO 123, PO/122-02, PO No: 12345, etc.
  const poNumMatch = t.match(/PO[\s\/\-:]*([A-Z0-9\/\-]+)/i) ?? t.match(/(?:Order\s*#?|Ref\.?\s*#?|Purchase\s*Order\s*No\.?|Work\s*Order\s*#?)\s*[:\s]*([A-Z0-9\-/]+)/i);
  if (poNumMatch) po_number = poNumMatch[1].trim();

  // Date: DD/MM/YY, DD-MM-YYYY, etc.
  const dateMatch = t.match(/(?:Date|Dated?)\s*[:\s]*(\d{1,2}[\/\-\.\s]\d{1,2}[\/\-\.\s]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i);
  if (dateMatch) po_date = toDate(dateMatch[1]);
  if (!po_date) {
    const firstDate = t.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/);
    if (firstDate) po_date = toDate(firstDate[0]);
  }

  const gstMatch = t.match(GST_REGEX);
  if (gstMatch) gstin = gstMatch[0].toUpperCase();

  const nameMatch = t.match(/(?:Supplier|Vendor|Party\s*Name|Name)\s*[:\s]*([^\n]+?)(?:\n|$)/i);
  if (nameMatch) vendorName = nameMatch[1].trim().slice(0, 200);

  const addrMatch = t.match(/(?:Address|Delivery\s*Address|Bill\s*To)\s*[:\s]*([^\n]+(?:\n(?!\s*(?:GST|Phone|Contact|Amount|Item|S\.?No))[^\n]+)*)/i);
  if (addrMatch) address = addrMatch[1].replace(/\n/g, " ").trim().slice(0, 500);

  const totalMatch = t.match(/(?:Total|Grand\s*Total|Amount)\s*[:\s]*[₹Rs.]?\s*([\d,]+(?:\.\d{2})?)/i) ?? t.match(/([\d,]+(?:\.\d{2})?)\s*$/m);
  if (totalMatch) totalAmount = toNum(totalMatch[1]);

  const deliveryMatch = t.match(/(?:Delivery\s*Date|Due\s*Date)\s*[:\s]*(\d{1,2}[\/\-\.\s]\d{1,2}[\/\-\.\s]\d{2,4})/i);
  if (deliveryMatch) deliveryDate = toDate(deliveryMatch[1]);

  const payMatch = t.match(/(?:Payment\s*Terms|Terms)\s*[:\s]*([^\n]+)/i);
  if (payMatch) paymentTerms = payMatch[1].trim().slice(0, 200);

  const phoneMatch = t.match(/(?:Phone|Mobile|Contact\s*No\.?)\s*[:\s]*([+\d\s\-]{10,20})/i);
  if (phoneMatch) phone = phoneMatch[1].trim();

  const emailMatch = t.match(/(?:Email|E-?mail)\s*[:\s]*([^\s@]+@[^\s]+)/i);
  if (emailMatch) email = emailMatch[1].trim();

  const descMatch = t.match(/(?:Contact\s*Person)\s*[:\s]*([^\n]+)/i);
  if (descMatch) contactPerson = descMatch[1].trim().slice(0, 100);

  const itemSection = t.match(/(?:Item|Description|Particulars|Goods|S\.?No)[\s\S]*?(?=\s*(?:Total|Grand|Subtotal|Amount|Tax)|$)/i);
  const itemBlock = itemSection ? itemSection[0] : t;
  const amountPattern = /\d{1,3}(,\d{3})*(\.\d{2})?|\d+(\.\d{2})?/g;

  // Row pattern: optional sno, quantity (number), description, price (number with optional decimals)
  const descLinePattern = /(?:^|\n)\s*(\d+)\s+([^\d\n][^\n]*?)\s+(\d+(?:,\d+)*(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)\s*$/gm;
  let m;
  let sno = 0;
  while ((m = descLinePattern.exec(itemBlock)) !== null) {
    const qtyNum = toNum(m[1]);
    const qty = qtyNum > 0 ? qtyNum : 1;
    const price = toNum(m[3]) || toNum(m[4]);
    if (/\d+/.test(String(qty)) && /\d+(\.\d{2})?$/.test(m[3] || m[4] || "")) {
      sno++;
      const lineTotal = qty * price;
      lineItems.push({
        sno,
        description: m[2].trim().slice(0, 300) || "Item",
        quantity: qty,
        unit: "Nos",
        unit_price: price,
        line_total: Math.round(lineTotal * 100) / 100,
        gst_rate: 18,
        gst_amount: Math.round(lineTotal * 0.18 * 100) / 100,
      });
    }
  }
  if (lineItems.length === 0) {
    const simpleLines = itemBlock.split(/\n/).filter((l) => l.length > 8 && /[a-zA-Z]/.test(l) && /\d/.test(l));
    for (let i = 0; i < Math.min(simpleLines.length, 50); i++) {
      const line = simpleLines[i];
      const amounts = line.match(amountPattern);
      const amt = amounts && amounts.length > 0 ? toNum(amounts[amounts.length - 1]) : 0;
      const desc = line.replace(amountPattern, "").replace(/\s+/g, " ").trim().slice(0, 200) || `Line ${i + 1}`;
      if (desc && (amt > 0 || desc.length > 5)) {
        lineItems.push({
          sno: lineItems.length + 1,
          description: desc,
          quantity: 1,
          unit: "Nos",
          unit_price: amt,
          line_total: amt,
          gst_rate: 18,
          gst_amount: Math.round(amt * 0.18 * 100) / 100,
        });
      }
    }
  }

  const customerName = vendorName || (lineItems.length > 0 ? "Supplier" : null);

  return {
    po_number,
    po_date: po_date || null,
    customer: {
      name: customerName,
      address: address || null,
      gst_number: gstin,
      contact_person: contactPerson,
      phone: phone || null,
      email: email || null,
    },
    vendor_name: vendorName,
    delivery_address: address,
    gstin,
    contact_no: phone,
    contact_person: contactPerson,
    contact_email: email,
    payment_terms: paymentTerms,
    delivery_date: deliveryDate,
    line_items: lineItems.length > 0 ? lineItems : [{ description: "Item 1", quantity: 1, unit: "Nos", unit_price: 0, line_total: 0 }],
    subtotal: totalAmount,
    total_amount: totalAmount,
    confidence: lineItems.length > 0 && po_number ? "medium" : "low",
    warnings,
  };
}
