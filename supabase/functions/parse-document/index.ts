import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not set in Supabase secrets");
    }

    const body = await req.json();
    const { fileBase64, fileName, parseMode = "auto" } = body;

    if (!fileBase64) {
      throw new Error("fileBase64 is required in request body");
    }

    // Strip data URI prefix if present
    const cleanBase64 = fileBase64.includes(",")
      ? fileBase64.split(",")[1]
      : fileBase64;

    // Size guard — base64 length * 0.75 = approximate bytes
    const approxBytes = cleanBase64.length * 0.75;
    if (approxBytes > 4_500_000) {
      return new Response(
        JSON.stringify({
          error: `File too large (${(approxBytes / 1024 / 1024).toFixed(1)}MB). Maximum is 4MB.`,
        }),
        {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Detect file type
    const isPdf =
      fileName?.toLowerCase().endsWith(".pdf") ||
      (typeof fileBase64 === "string" && fileBase64.startsWith("data:application/pdf"));
    const mediaType = isPdf ? "application/pdf" : "image/jpeg";
    const contentBlockType = isPdf ? "document" : "image";

    const prompt = getPrompt(parseMode);

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "pdfs-2024-09-25",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: contentBlockType,
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: cleanBase64,
                  },
                },
                {
                  type: "text",
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.json().catch(() => ({}));
      const err = errBody as { error?: { message?: string } };
      throw new Error(
        `Anthropic API error ${anthropicResponse.status}: ${
          err?.error?.message ?? JSON.stringify(errBody)
        }`
      );
    }

    const anthropicData = (await anthropicResponse.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const rawText =
      anthropicData.content?.find((c: { type?: string }) => c.type === "text")
        ?.text ?? "";

    const cleanText = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      throw new Error(
        `Could not parse Claude response as JSON. Raw response: ${rawText.substring(0, 500)}`
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: parsed }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Edge Function error:", message);

    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getPrompt(mode: string): string {
  const prompts: Record<string, string> = {
    purchase_order: `Extract all data from this Purchase Order PDF. Return ONLY valid JSON with no explanation, no markdown:
{
  "doc_type": "purchase_order",
  "po_number": "",
  "po_date": "",
  "buyer": { "name": "", "gst": "", "pan": "", "address": "" },
  "vendor": { "name": "", "code": "", "address": "" },
  "items": [{ "sno": "", "description": "", "hsn": "", "uom": "", "qty": 0, "rate": 0, "delivery_date": "", "sgst_pct": 0, "cgst_pct": 0, "value_before_tax": 0, "total_value": 0 }],
  "grand_total": 0,
  "grand_total_words": "",
  "payment_terms": "",
  "delivery_terms": "",
  "order_handled_by": "",
  "order_handler_email": ""
}`,

    bank_statement: `Extract ALL data from this Bank Statement PDF. Return ONLY valid JSON with no explanation, no markdown:
{
  "doc_type": "bank_statement",
  "account_holder": "",
  "account_number": "",
  "account_type": "",
  "bank_name": "",
  "branch": "",
  "ifsc": "",
  "period_from": "",
  "period_to": "",
  "opening_balance": 0,
  "total_credits": 0,
  "total_debits": 0,
  "closing_balance": 0,
  "transactions": [{ "date": "", "details": "", "ref_no": "", "debit": 0, "credit": 0, "balance": 0 }]
}`,

    auto: `Detect document type (purchase_order, bank_statement, invoice) and extract ALL data. Return ONLY valid JSON, no markdown, no explanation.`,
  };

  return prompts[mode] ?? prompts.auto;
}
