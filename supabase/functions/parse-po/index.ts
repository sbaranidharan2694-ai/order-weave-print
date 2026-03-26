import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const systemPrompt = `You are an expert Indian Purchase Order parser for a printing press.

THE SELLER receiving this PO is: Super Printers (also written as "Super Screens" in some POs), Chennai, Tamil Nadu, India. Super Printers GST numbers: 33ANVPR5833L1Z7 and 33AAGPB7462F1Z1.
THE CUSTOMER (buyer who ISSUED this PO) is the OTHER company — never Super Printers.

DOCUMENT STRUCTURE — read carefully before extracting:
- If the document has a "FROM" section followed by a "TO" section: FROM = customer (buyer), TO = seller (Super Printers). Extract customer from the FROM block.
- If the document has a "To," header followed by company info: that company is the customer.
- If "Billing Address" and "Delivery Address" appear: Billing Address is the customer, Delivery Address may be different.
- NEVER extract "Super Printers", "Super Screens", 33ANVPR5833L1Z7, or 33AAGPB7462F1Z1 as the customer.

Extract ALL data. Return ONLY valid JSON — no markdown, no backticks, no explanation.

HANDLE ANY FORMAT: standard GST POs, government/PSU POs, corporate POs, informal Excel POs, multi-page POs, scanned OCR text, tabular PDFs where columns are merged on the same line.

EXTRACTION RULES:
- Amounts: Remove Indian commas (1,23,456.78 → 123456.78). Return numbers not strings.
- Dates: Convert ANY format to YYYY-MM-DD.
  Formats to handle: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD-Mon-YYYY (26-Mar-2026), DD Month YYYY, DD/MM/YY, DD.MM.YY.
  For 2-digit years: 00-49 = 2000-2049, 50-99 = 1950-1999. So 26.03.26 → 2026-03-26.
- GST: 15 chars. If customer GST state code (first 2 digits) = 33, taxes are CGST+SGST. Otherwise IGST.
- Quantities: Handle "500 nos", "5 reams", "2000 sheets", "204 IN KG" — extract number and unit separately.
- If GST is inclusive, back-calculate base price.
- For Excel-format POs: column header rows may be split across 2 rows (e.g., "Qty" on row 1, "IN KG" on row 2 directly below it). Merge them: "Qty" + "IN KG" = quantity column with unit KG.
- Formula strings like =F21*G21: calculate using visible row values. If row shows price=8, qty=204, total=8×204=1632.
- For unlabeled payment terms: if a cell in the header area (before line items) contains a standalone credit/payment phrase like "60 DAYS CREDIT", "IMMEDIATE", "ADVANCE", "30 DAYS NET" with no field label, treat it as the payment_terms value.

PO NUMBER — CRITICAL:
- The PO number is the VALUE after the label ("PO No :", "PO NO", "Order No.", "Ref No.", etc.).
- NEVER set po_number to a field label word: "Date", "Incoterms", "Payment Terms", "Dispatch Mode", "Internal Reference", "Delivery Date", "Remarks", "Reference".
- In tabular PDF layouts, PO No and Date often appear on the same text line: extract them independently.
- A valid PO number contains at least one digit and typically has letters+digits+separators (e.g., "GGOR/104PRO/4/1997", "145-03/25-26", "WO/2024/001").
- If extracted po_number has NO digits, set it to null.

PAYMENT TERMS — CRITICAL:
- Extract the VALUE after "Payment Terms" label.
- NEVER set payment_terms to field labels: "Incoterms :", "Dispatch Mode :", "Internal Reference :".
- In linearized PDF text, "Dispatch Mode : Incoterms : Immediate Payment Terms :" means: Incoterms=blank, PaymentTerms=Immediate. "Immediate" is the payment terms value.

LINE ITEMS — CRITICAL:
- ONLY include rows that represent actual products/services ordered.
- A valid line item MUST have: a product/service description AND quantity > 0 AND unit_price > 0.
- EXCLUDE ALL of these — do NOT add them as line items:
  * Any row where description matches: "Total", "Sub Total", "Subtotal", "Grand Total", "Net Total", "Net Amount", "Net Value"
  * Any row starting with: "Amount in Words", "Rupees in words", "₹ in words"
  * Any row starting with: "CGST", "SGST", "IGST", "GST", "Tax", "Discount", "Round Off"
  * Any row where description is a field label with colon: "Subtotal (₹) :", "Total (₹) :"
  * Any row that is a column header (description = "Sr No", "S No", "Item", "Description")
  * Any blank description row
- If the PO has 1 real product row, line_items must have exactly 1 entry.

HSN CODE — CRITICAL:
- HSN codes are 4-8 digit NUMBERS only (e.g., "4821102", "4819", "48192090").
- NEVER use alphabetic batch numbers, lot numbers, or part numbers as HSN codes (e.g., "15L25AD", "13L0125", "P-PM-00627" are NOT HSN codes).
- If no valid numeric HSN code is present, set hsn_code to null.

GST RATE — CRITICAL:
- If the line item row shows CGST%, SGST%, and IGST% ALL as 0 or 0.00, set gst_rate to 0. Do NOT default to 18.
- If the document shows CGST 9% + SGST 9%, set gst_rate to 18 (9+9).
- Valid rates: 0, 5, 12, 18, 28.

PRINTING ITEMS TO RECOGNIZE: visiting cards, wedding cards, letterheads, bill books, brochures, flex banners, rubber stamps, ID cards, envelopes, stickers, binding, lamination, screen printing, posters, catalogs, books, carry bags, labels, packaging materials, chemical compounds (screen printing inks/emulsions), GIANITAN products.

Return this EXACT JSON:
{
  "po_number": "string or null",
  "po_date": "YYYY-MM-DD or null",
  "customer": {
    "name": "string or null",
    "address": "string or null",
    "gst_number": "string or null",
    "contact_person": "string or null",
    "phone": "string or null",
    "email": "string or null"
  },
  "payment_terms": "string or null",
  "delivery_date": "YYYY-MM-DD or null",
  "line_items": [
    {
      "sno": 1,
      "description": "string",
      "quantity": 0,
      "unit": "Nos",
      "unit_price": 0,
      "hsn_code": "string or null",
      "gst_rate": 18,
      "gst_amount": 0,
      "line_total": 0
    }
  ],
  "subtotal": 0,
  "cgst": 0,
  "sgst": 0,
  "igst": 0,
  "discount_amount": 0,
  "total_amount": 0,
  "amount_in_words": "string or null",
  "shipping_address": "string or null",
  "notes": "string or null",
  "confidence": "high|medium|low",
  "warnings": []
}

If a field is not found, use null for strings and 0 for numbers.
Calculate: line_total = qty × unit_price, gst_amount = line_total × gst_rate/100, subtotal = sum(line_totals), total = subtotal + cgst + sgst + igst - discount.
confidence: high = PO number + customer + line items all found. medium = some missing. low = mostly guessing.
line_items MUST always be an array, even if empty [].`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripFences(text: string): string {
  if (!text || typeof text !== "string") return "";
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  return s.trim();
}

function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function extractAndParse(raw: string): { parsed: Record<string, unknown> | null; parseError?: string } {
  const unfenced = stripFences(raw);
  let candidate = extractBalancedJsonObject(unfenced);
  if (!candidate) {
    const collapsed = unfenced.replace(/\s+/g, " ");
    const fb = collapsed.indexOf("{");
    const lb = collapsed.lastIndexOf("}");
    if (fb >= 0 && lb > fb) candidate = collapsed.slice(fb, lb + 1);
  }
  if (!candidate) return { parsed: null, parseError: "No JSON object found" };
  const attempts = [
    candidate,
    candidate.replace(/,(\s*[}\]])/g, "$1"),
    candidate.replace(/,(\s*[}\]])/g, "$1").replace(/(\d)\s+(\d)/g, "$1,$2"),
  ];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const parsed = JSON.parse(attempts[i]) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") return { parsed };
    } catch (e) {
      if (i === attempts.length - 1) return { parsed: null, parseError: (e as Error).message };
    }
  }
  return { parsed: null, parseError: "All parse attempts failed" };
}

function ensureMinimumStructure(parsed: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(parsed.line_items)) parsed.line_items = [];
  const items = parsed.line_items as Array<Record<string, unknown>>;
  for (let i = 0; i < items.length; i++) {
    const li = items[i];
    if (!li || typeof li !== "object") continue;
    const qty = Number(li.quantity ?? li.qty ?? 1) || 1;
    const price = Number(li.unit_price ?? 0) || 0;
    li.quantity = qty;
    li.unit_price = price;
    if (li.line_total == null || Number(li.line_total) === 0) {
      li.line_total = Math.round(qty * price * 100) / 100;
    }
    li.unit = li.unit ?? li.uom ?? "Nos";
  }
  return parsed;
}

const FOOTER_DESC_PATTERNS = [
  /^(sub\s*total|subtotal|total|grand\s*total|net\s*total|net\s*amount|net\s*value)[\s:₹(]*$/i,
  /^amount\s+in\s+words/i,
  /^(cgst|sgst|igst|gst|tax|discount|round\s*off)[\s:0-9%.]*$/i,
  /^(for\s+and\s+on\s+behalf|authorized\s*signatory|prepared\s+by|reviewed?\s+by)/i,
  /^[₹\d,.\s]+$/,
  /^(sr\.?\s*no\.?|s\.?\s*no\.?|sno\.?|item\s*no\.?|sl\.?\s*no\.?)$/i,
  /subtotal\s*[₹(]/i,
];

const INVALID_PO_NUMBER_PATTERNS = [
  /^date$/i,
  /^incoterms?:?$/i,
  /^payment\s*terms?:?$/i,
  /^dispatch\s*mode:?$/i,
  /^internal\s*ref/i,
  /^delivery\s*date:?$/i,
  /^remarks?:?$/i,
  /^reference:?$/i,
  /^[a-z][a-z\s]{0,20}:?\s*$/i,
];

function isSpuriousLineItem(item: Record<string, unknown>): boolean {
  const desc = String(item.description ?? "").trim();
  if (!desc) return true;
  for (const pat of FOOTER_DESC_PATTERNS) {
    if (pat.test(desc)) return true;
  }
  if (/^[\w\s]{1,25}:\s*$/.test(desc) && !/\d/.test(desc)) return true;
  return false;
}

function sanitizePoNumber(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  for (const pat of INVALID_PO_NUMBER_PATTERNS) {
    if (pat.test(v)) return null;
  }
  if (!/\d/.test(v)) return null;
  return v;
}

function sanitizePaymentTerms(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/^incoterms?\s*:?\s*$/i.test(v)) return null;
  if (/^(dispatch|delivery|internal|reference)\s/i.test(v)) return null;
  return v;
}

function postProcessParsed(parsed: Record<string, unknown>): Record<string, unknown> {
  parsed.po_number = sanitizePoNumber(parsed.po_number);
  parsed.payment_terms = sanitizePaymentTerms(parsed.payment_terms);

  if (Array.isArray(parsed.line_items)) {
    const before = (parsed.line_items as unknown[]).length;
    parsed.line_items = (parsed.line_items as Record<string, unknown>[]).filter(
      (item) => !isSpuriousLineItem(item),
    );
    const removed = before - (parsed.line_items as unknown[]).length;
    if (removed > 0) {
      const warnings = Array.isArray(parsed.warnings) ? (parsed.warnings as string[]) : [];
      warnings.push(`Removed ${removed} spurious footer row(s) from line items.`);
      parsed.warnings = warnings;
    }
  }
  return parsed;
}

async function callAI(
  prompt: string,
  userMessage: string,
): Promise<{ text: string } | { error: string; status: number; retryable: boolean }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")?.trim();
  const googleKey =
    Deno.env.get("GOOGLE_GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GEMINI_API_KEY")?.trim();

  if (lovableKey) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        stream: false,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (res.status === 402) return { error: "AI credits exhausted. Add credits in workspace settings.", status: 402, retryable: false };
    if (res.status === 429) return { error: "Rate limited. Retrying...", status: 429, retryable: true };
    if (!res.ok) {
      console.error("[parse-po] Lovable AI error:", res.status, await res.text().then((t) => t.slice(0, 200)));
      return { error: "AI gateway error. Retrying...", status: res.status, retryable: true };
    }
    const data = await res.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return { error: "AI returned no content.", status: 500, retryable: true };
    return { text };
  }

  if (googleKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(googleKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      }),
    });
    if (res.status === 429) return { error: "Gemini rate limited. Retrying...", status: 429, retryable: true };
    if (res.status === 403) {
      const errText = await res.text();
      return { error: /quota|billing/i.test(errText) ? "Gemini quota exceeded." : "Gemini key invalid.", status: 403, retryable: false };
    }
    if (!res.ok) {
      console.error("[parse-po] Gemini error:", res.status, await res.text().then((t) => t.slice(0, 200)));
      return { error: "Gemini API error. Retrying...", status: res.status, retryable: true };
    }
    const data = await res.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text.trim()) return { error: "Gemini returned no content.", status: 500, retryable: true };
    return { text };
  }

  return {
    error: "No AI API key configured. Set LOVABLE_API_KEY or GEMINI_API_KEY in Supabase edge function secrets.",
    status: 503,
    retryable: false,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonResponse = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const bodyText = await req.text();
    if (bodyText.length > 100_000) {
      return new Response(
        JSON.stringify({ error: "Input too large. Maximum 100KB per request." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body", raw_ai_text: "" }, 400);
    }
    const { pdfText } = body;
    if (!pdfText || typeof pdfText !== "string") {
      return jsonResponse({ success: false, error: "Missing or invalid pdfText", raw_ai_text: "" }, 400);
    }
    if (pdfText.length > 500_000) {
      return jsonResponse({ success: false, error: "Payload too large. Maximum 500KB.", raw_ai_text: "" }, 413);
    }

    function smartTruncate(text: string, max: number): string {
      if (text.length <= max) return text;
      const head = text.slice(0, 40_000);
      const tail = text.slice(-60_000);
      const mid = text.slice(40_000, -60_000).slice(0, max - 100_000);
      return head + (mid ? "\n[...truncated...]\n" + mid : "") + tail;
    }

    const trimmed = smartTruncate(pdfText, 180_000);
    console.log("[parse-po] PDF text length:", pdfText.length, "trimmed:", trimmed.length);

    const maxAttempts = 3;
    const backoffMs = 2000;
    let rawContent = "";
    let lastError = "";
    let parsed: Record<string, unknown> | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const aiResult = await callAI(
          systemPrompt,
          `Parse this purchase order and return ONLY the JSON:\n\n${trimmed}`,
        );

        if ("error" in aiResult) {
          lastError = aiResult.error;
          if (!aiResult.retryable) {
            return jsonResponse(
              { success: false, error: aiResult.error, parse_error: aiResult.error, raw_ai_text: "" },
              aiResult.status,
            );
          }
          if (attempt < maxAttempts) {
            await sleep(backoffMs * attempt);
            continue;
          }
          return jsonResponse(
            { success: false, error: lastError, parse_error: lastError, raw_ai_text: "" },
            aiResult.status,
          );
        }

        rawContent = aiResult.text;
        console.log("[parse-po] Attempt", attempt, "response length:", rawContent.length, "preview:", rawContent.slice(0, 120));

        const result = extractAndParse(rawContent);
        if (result.parsed) {
          parsed = result.parsed;
          break;
        }
        lastError = result.parseError ?? "JSON parse failed";
        console.warn("[parse-po] Attempt", attempt, "parse failed:", lastError);
        if (attempt < maxAttempts) await sleep(backoffMs * attempt);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("[parse-po] Attempt", attempt, "exception:", lastError);
        if (attempt < maxAttempts) await sleep(backoffMs * attempt);
      }
    }

    if (!parsed) {
      return jsonResponse({
        success: false,
        error: "Failed to parse AI response after all attempts",
        parse_error: lastError || "No valid JSON extracted",
        raw_ai_text: rawContent.slice(0, 2000),
      });
    }

    parsed = ensureMinimumStructure(parsed);
    parsed = postProcessParsed(parsed);
    return jsonResponse({
      success: true,
      data: parsed,
      raw_ai_text: rawContent ? rawContent.slice(0, 500) : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PO parsing failed";
    console.error("[parse-po] Unhandled error:", e);
    return jsonResponse({ success: false, error: msg, parse_error: msg, raw_ai_text: "" }, 500);
  }
});
