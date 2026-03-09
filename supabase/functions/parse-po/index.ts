import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
confidence: high if PO number + customer + items found, medium if some missing, low if mostly guessing.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfText } = await req.json();
    if (!pdfText || typeof pdfText !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid pdfText" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pdfText.length > 500_000) {
      return new Response(
        JSON.stringify({ error: "Payload too large. Maximum 500KB." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI API key not configured. Ensure Lovable Cloud is enabled." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Trim text for AI context window
    const trimmed = pdfText.length > 180_000 ? pdfText.slice(0, 180_000) : pdfText;

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
      console.error("[parse-po] AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `AI gateway returned ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response
    let parsed: Record<string, unknown> | null = null;

    // Try tool_calls first
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try { parsed = JSON.parse(toolCall.function.arguments); } catch { /* fallback */ }
    }

    // Then try content
    if (!parsed && rawContent) {
      let jsonStr = rawContent.trim();
      // Strip markdown code blocks
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      // Find JSON object
      const start = jsonStr.indexOf("{");
      const end = jsonStr.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(jsonStr.slice(start, end + 1)); } catch { /* fallback */ }
      }
    }

    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "AI did not return structured data. Try again or enter manually." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PO parsing failed";
    console.error("[parse-po] Error:", e);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
