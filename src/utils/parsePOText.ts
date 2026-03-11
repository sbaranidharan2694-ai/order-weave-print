/**
 * Universal PO Parser Engine
 * Multi-layer parser: normalization → synonym matching → regex extraction → heuristic fallback
 */

/* ─── Types ─── */
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

/* ─── LAYER 1: Text Normalization ─── */
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ");
}

function normLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

/* ─── LAYER 2: Field Synonym Dictionary ─── */
const FIELD_SYNONYMS: Record<string, string[]> = {
  po_number: [
    "po number", "po no", "purchase order", "order number", "order no",
    "p o", "po ref", "ref no", "ref id", "indent no", "work order",
    "order ref", "po#", "order#",
  ],
  customer: [
    "customer", "client", "company", "bill to", "buyer", "party name",
    "supplier", "vendor", "name", "firm",
  ],
  quantity: [
    "qty", "quantity", "order qty", "ordered", "units", "nos",
    "total qty", "qty ordered",
  ],
  product: [
    "product", "item", "description", "material", "service",
    "particulars", "goods", "item description",
  ],
  delivery_date: [
    "delivery date", "due date", "required date", "dispatch date",
    "expected date", "ship date", "delivery by",
  ],
  amount: [
    "amount", "total", "grand total", "invoice total", "net amount",
    "total amount", "payable",
  ],
  gst: [
    "gst", "gstin", "gst no", "gst number", "tax id",
  ],
  address: [
    "address", "delivery address", "bill to", "ship to", "shipping address",
  ],
  contact_person: [
    "contact person", "contact name", "attn", "attention",
  ],
  phone: [
    "phone", "mobile", "contact no", "tel", "telephone",
  ],
  email: [
    "email", "e mail", "mail",
  ],
  payment_terms: [
    "payment terms", "terms", "credit terms", "payment",
  ],
  po_date: [
    "date", "po date", "order date", "dated",
  ],
};

/* ─── LAYER 3: Flexible Field Matching ─── */
function matchField(label: string): string | null {
  const norm = normLabel(label);
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    if (synonyms.some(s => norm.includes(s) || norm.startsWith(s))) {
      return field;
    }
  }
  return null;
}

/** Find value after a label on the same or next line */
function findLabelValue(lines: string[], field: string): string | null {
  const synonyms = FIELD_SYNONYMS[field];
  if (!synonyms) return null;
  for (let i = 0; i < lines.length; i++) {
    const norm = normLabel(lines[i]);
    for (const syn of synonyms) {
      const idx = norm.indexOf(syn);
      if (idx >= 0) {
        // Extract value after the synonym on same line
        const afterSyn = lines[i].substring(idx + syn.length).replace(/^[\s:;\-–—]+/, "").trim();
        if (afterSyn.length > 1) return afterSyn;
        // Check next line
        if (i + 1 < lines.length && lines[i + 1].trim().length > 1) {
          return lines[i + 1].trim();
        }
      }
    }
  }
  return null;
}

/* ─── LAYER 4: Regex Value Extraction ─── */
const REGEX_PO_NUMBER = /(?:po|purchase\s*order|order|indent|work\s*order)[\s\-#.:\/]*([A-Za-z0-9\-\/]{3,30})/i;
const REGEX_QUANTITY = /(?:qty|quantity|ordered)[\s:.\-]*(\d+)/i;
const REGEX_CURRENCY = /[₹]|Rs\.?|INR/i;
const REGEX_DATE = /(\d{1,2})[\/\-\.\s](\d{1,2})[\/\-\.\s](\d{2,4})/;
const REGEX_ISO_DATE = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/;
const REGEX_GST = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i;
const REGEX_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const REGEX_PHONE = /(?:\+91[\s\-]?)?[6-9]\d{9}/;
const REGEX_AMOUNT = /\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g;

function toNum(s: string | undefined | null): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/,/g, "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function toDate(s: string | undefined | null): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  const d = trimmed.match(REGEX_DATE);
  if (d) {
    const [, day, month, year] = d;
    const y = year.length === 2 ? (parseInt(year, 10) < 50 ? "20" + year : "19" + year) : year;
    return `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const iso = trimmed.match(REGEX_ISO_DATE);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

/* ─── LAYER 5: Heuristic Fallback ─── */
function heuristicPONumber(lines: string[]): string | null {
  // Look for largest alphanumeric code near top of document
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const match = lines[i].match(/([A-Z0-9\-\/]{4,25})/i);
    if (match && /\d/.test(match[1]) && /[A-Za-z]/.test(match[1])) {
      return match[1];
    }
  }
  return null;
}

function heuristicAmount(text: string): number {
  const amounts = text.match(REGEX_AMOUNT) || [];
  let largest = 0;
  for (const a of amounts) {
    const v = toNum(a);
    if (v > largest) largest = v;
  }
  return largest;
}

function heuristicQuantity(text: string): number {
  const qtyMatch = text.match(REGEX_QUANTITY);
  if (qtyMatch) return parseInt(qtyMatch[1], 10) || 0;
  // Fallback: find integers near common quantity words
  const norm = text.toLowerCase();
  const qtyWords = ["qty", "quantity", "nos", "units", "pcs", "copies"];
  for (const w of qtyWords) {
    const idx = norm.indexOf(w);
    if (idx >= 0) {
      const nearby = text.substring(Math.max(0, idx - 30), idx + w.length + 30);
      const nums = nearby.match(/\d+/g);
      if (nums) {
        const largest = Math.max(...nums.map(n => parseInt(n, 10)));
        if (largest > 0 && largest < 1_000_000) return largest;
      }
    }
  }
  return 0;
}

function heuristicDate(text: string, field: string): string | null {
  const synonyms = FIELD_SYNONYMS[field] || [];
  const norm = text.toLowerCase();
  for (const syn of synonyms) {
    const idx = norm.indexOf(syn);
    if (idx >= 0) {
      const nearby = text.substring(idx, idx + 80);
      const dateMatch = nearby.match(REGEX_DATE) || nearby.match(REGEX_ISO_DATE);
      if (dateMatch) return toDate(dateMatch[0]);
    }
  }
  // Global fallback — find any date
  const globalDate = text.match(REGEX_DATE) || text.match(REGEX_ISO_DATE);
  return globalDate ? toDate(globalDate[0]) : null;
}

/* ─── Line Item Extraction ─── */
function extractLineItems(text: string): RuleParsedPO["line_items"] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items: RuleParsedPO["line_items"] = [];

  // Pattern 1: structured rows — sno, description, qty, price, total
  const rowPattern = /(?:^|\n)\s*(\d+)\s+([^\d\n][^\n]*?)\s+(\d+(?:,\d+)*(?:\.\d{2})?)\s+([\d,]+(?:\.\d{2})?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowPattern.exec(text)) !== null) {
    const qty = toNum(m[3]) || 1;
    const price = toNum(m[4]);
    items.push({
      sno: items.length + 1,
      description: m[2].trim().slice(0, 300) || "Item",
      quantity: qty,
      unit: "Nos",
      unit_price: price,
      line_total: Math.round(qty * price * 100) / 100,
      gst_rate: 18,
      gst_amount: Math.round(qty * price * 0.18 * 100) / 100,
    });
  }

  // Pattern 2: simpler lines with amounts
  if (items.length === 0) {
    const candidateLines = lines.filter(l => l.length > 8 && /[a-zA-Z]/.test(l) && /\d/.test(l));
    for (let i = 0; i < Math.min(candidateLines.length, 50); i++) {
      const line = candidateLines[i];
      const amounts = line.match(REGEX_AMOUNT);
      const amt = amounts?.length ? toNum(amounts[amounts.length - 1]) : 0;
      const desc = line.replace(REGEX_AMOUNT, "").replace(/\s+/g, " ").trim().slice(0, 200) || `Line ${i + 1}`;
      if (desc && (amt > 0 || desc.length > 5)) {
        items.push({
          sno: items.length + 1,
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

  return items;
}

/* ─── SECTION 4: Auto Field Correction ─── */
function selectBestValue(candidates: string[], context: "quantity" | "amount" | "po_number"): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  
  if (context === "quantity") {
    // Pick the most reasonable integer (not too large, not zero)
    const nums = candidates.map(c => parseInt(c.replace(/,/g, ""), 10)).filter(n => n > 0 && n < 1_000_000);
    return nums.length > 0 ? String(Math.max(...nums)) : candidates[0];
  }
  if (context === "amount") {
    // Pick the largest currency value
    const nums = candidates.map(c => toNum(c)).filter(n => n > 0);
    return nums.length > 0 ? String(Math.max(...nums)) : candidates[0];
  }
  // po_number: pick the first non-trivial one
  return candidates[0];
}

/* ─── Main Parser ─── */
export function parsePOText(text: string): RuleParsedPO {
  const t = normalize(text);
  const lines = t.split("\n").map(l => l.trim()).filter(Boolean);
  const warnings: string[] = ["Parsed with rule-based fallback; please verify fields."];

  console.log(`[parsePOText] Input length: ${text.length}, lines: ${lines.length}`);

  // --- Layer 3+4: Synonym + Regex extraction ---
  let po_number = findLabelValue(lines, "po_number");
  if (!po_number) {
    const regexMatch = t.match(REGEX_PO_NUMBER);
    po_number = regexMatch ? regexMatch[1].trim() : null;
  }
  if (!po_number) {
    po_number = heuristicPONumber(lines);
    if (po_number) warnings.push("PO number detected via heuristic fallback.");
  }

  let po_date = heuristicDate(t, "po_date");
  let deliveryDate = heuristicDate(t, "delivery_date");

  const gstMatch = t.match(REGEX_GST);
  const gstin = gstMatch ? gstMatch[0].toUpperCase() : null;

  const vendorName = findLabelValue(lines, "customer");
  const address = findLabelValue(lines, "address");
  const contactPerson = findLabelValue(lines, "contact_person");

  const phoneMatch = t.match(REGEX_PHONE);
  const phone = phoneMatch ? phoneMatch[0].trim() : null;

  const emailMatch = t.match(REGEX_EMAIL);
  const email = emailMatch ? emailMatch[0].trim() : null;

  const paymentTerms = findLabelValue(lines, "payment_terms");

  // --- Line items ---
  const lineItems = extractLineItems(t);

  // --- Amounts ---
  const totalAmount = heuristicAmount(t);
  const subtotal = lineItems.reduce((s, li) => s + (li.line_total || 0), 0) || totalAmount;

  // --- Confidence scoring ---
  let score = 0;
  if (po_number) score++;
  if (vendorName) score++;
  if (lineItems.length > 0) score++;
  if (po_date) score++;
  if (totalAmount > 0) score++;
  const confidence: "high" | "medium" | "low" = score >= 4 ? "high" : score >= 2 ? "medium" : "low";

  // Log detected fields
  console.log(`[parsePOText] Detected: po_number=${po_number}, customer=${vendorName}, items=${lineItems.length}, amount=${totalAmount}, confidence=${confidence}`);
  if (confidence === "low") {
    console.warn("[parsePOText] Low confidence parse — heuristic fallbacks used");
    warnings.push("Low confidence extraction. Manual verification recommended.");
  }

  const customerName = vendorName || null;

  return {
    po_number,
    po_date: po_date || null,
    customer: {
      name: customerName,
      address: address || null,
      gst_number: gstin,
      contact_person: contactPerson || null,
      phone: phone || null,
      email: email || null,
    },
    vendor_name: vendorName || null,
    delivery_address: address || null,
    gstin,
    contact_no: phone,
    contact_person: contactPerson || null,
    contact_email: email || null,
    payment_terms: paymentTerms || null,
    delivery_date: deliveryDate || null,
    line_items: lineItems.length > 0 ? lineItems : [{ description: "Item 1", quantity: 1, unit: "Nos", unit_price: 0, line_total: 0 }],
    subtotal,
    total_amount: totalAmount,
    confidence,
    warnings,
  };
}
