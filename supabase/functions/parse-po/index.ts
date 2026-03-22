import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const systemPrompt = `You are an expert Indian Purchase Order parser for a printing press (Super Printers, Chennai, Tamil Nadu, India, GST 33ANVPR5833L1Z7).

Extract ALL data from the PO text. Return ONLY valid JSON — no markdown, no backticks, no explanation.

HANDLE ANY FORMAT: standard GST POs, government/PSU POs, corporate POs, informal POs, multi-page POs, scanned OCR text.

EXTRACTION RULES:
- Amounts: Remove Indian commas (1,23,456.78 → 123456.78). Return numbers, not strings.
- Dates: Convert any format to YYYY-MM-DD.
- GST: 15 chars. If customer state code (first 2 digits) = 33, use CGST+SGST. Otherwise IGST.
- Quantities: Handle "500 nos", "5 reams", "2000 sheets" — extract number and unit separately.
- If GST is inclusive, back-calculate base price.
- PO number may be labeled: "Purchase Order No.", "PO No.", "Order No.", "Ref No.", "Indent No.", "Work Order No."

PRINTING ITEMS TO RECOGNIZE: visiting cards, wedding cards, letterheads, bill books, brochures, flex banners, rubber stamps, ID cards, envelopes, stickers, binding, lamination, screen printing, posters, catalogs, books, carry bags.

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
Calculate missing fields: line_total = qty × unit_price, gst_amount = line_total × gst_rate/100, subtotal = sum of line_totals, total = subtotal + taxes - discount.
confidence: high if PO number + customer + items found, medium if some missing, low if mostly guessing.
IMPORTANT: line_items MUST always be an array, even if empty [].`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip markdown fences only — do not collapse whitespace (breaks valid JSON). */
function stripFences(text: string): string {
  if (!text || typeof text !== "string") return "";
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  return s.trim();
}

/**
 * First balanced `{...}` object, respecting strings (handles `}` inside string values).
 */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract and parse JSON from AI output.
 */
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
      if (i === attempts.length - 1) {
        return { parsed: null, parseError: (e as Error).message };
      }
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
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const body = JSON.parse(bodyText);
    const { pdfText } = body;
    if (!pdfText || typeof pdfText !== "string") {
      return jsonResponse({ success: false, error: "Missing or invalid pdfText", raw_ai_text: "" }, 400);
    }

    if (pdfText.length > 500_000) {
      return jsonResponse(
        { success: false, error: "Payload too large. Maximum 500KB.", raw_ai_text: "" },
        413
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return jsonResponse({
        success: false,
        error: "AI API key not configured. Ensure Lovable Cloud is enabled.",
        raw_ai_text: "",
      }, 503);
    }

    console.log("[parse-po] PDF text length:", pdfText.length);

    const trimmed = pdfText.length > 180_000 ? pdfText.slice(0, 180_000) : pdfText;
    const maxAttempts = 3;
    const backoffMs = 300;

    let rawContent = "";
    let lastError = "";
    let parsed: Record<string, unknown> | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            temperature: 0,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Parse this purchase order and return ONLY the JSON:\n\n${trimmed}` },
            ],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("[parse-po] AI gateway error attempt", attempt, response.status, errText.slice(0, 200));
          lastError = `AI gateway ${response.status}: ${errText.slice(0, 150)}`;
          if (response.status === 429 || response.status === 502) {
            await sleep(backoffMs * attempt);
            continue;
          }
          if (response.status === 402) {
            return jsonResponse({
              success: false,
              error: "AI credits exhausted. Add credits in workspace settings.",
              parse_error: lastError,
              raw_ai_text: "",
            });
          }
          if (attempt === maxAttempts) {
            return jsonResponse({
              success: false,
              error: lastError,
              parse_error: lastError,
              raw_ai_text: "",
            });
          }
          await sleep(backoffMs * attempt);
          continue;
        }

        const data = await response.json();
        rawContent = data?.choices?.[0]?.message?.content ?? "";
        console.log("[parse-po] Attempt", attempt, "AI response length:", rawContent.length, "first 120:", rawContent.slice(0, 120));

        const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          try {
            parsed = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
            break;
          } catch {
            // fall through to content extraction
          }
        }

        if (rawContent) {
          const result = extractAndParse(rawContent);
          if (result.parsed) {
            parsed = result.parsed;
            break;
          }
          lastError = result.parseError ?? "Parse failed";
          console.log("[parse-po] Parse attempt", attempt, "failed:", lastError);
        }

        if (attempt < maxAttempts) await sleep(backoffMs * attempt);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error("[parse-po] Attempt", attempt, "error:", lastError);
        if (attempt < maxAttempts) await sleep(backoffMs * attempt);
      }
    }

    if (!parsed) {
      return jsonResponse({
        success: false,
        error: "Failed to parse AI response",
        parse_error: lastError || "No valid JSON extracted",
        raw_ai_text: rawContent.slice(0, 2000),
      });
    }

    parsed = ensureMinimumStructure(parsed);

    return jsonResponse({
      success: true,
      data: parsed,
      raw_ai_text: rawContent ? rawContent.slice(0, 500) : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PO parsing failed";
    console.error("[parse-po] Error:", e);
    return jsonResponse(
      {
        success: false,
        error: msg,
        parse_error: msg,
        raw_ai_text: "",
      },
      500
    );
  }
});
