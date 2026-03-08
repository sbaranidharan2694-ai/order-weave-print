import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const bankStatementPrompt = `You are a Bank Statement parser for Indian banks (especially CSB Bank / Catholic Syrian Bank).
Extract ALL data from the bank statement text. Be extremely thorough — extract EVERY transaction row.

CRITICAL RULES:
1. Parse ALL transactions — do not skip any rows
2. Dates: parse as YYYY-MM-DD. Handle formats: DD-MMM-YYYY, DD/MM/YYYY, DD-MMMYYYY (no separator), DDMONYYYY
3. For each transaction, determine if it's a debit or credit based on the amount columns
4. "counterparty" = extract the other party name from the transaction details (e.g., from NEFT/RTGS/UPI descriptions)
5. Balance must be tracked — each row should have the running balance
6. Extract account holder name, account number, branch, IFSC, period, opening/closing balances
7. Total credits and total debits should be the sum of all credit and debit transactions respectively

Return ONLY valid JSON with no markdown fences, no explanation:
{
  "doc_type": "bank_statement",
  "account_holder": "",
  "account_number": "",
  "account_type": "",
  "bank_name": "",
  "branch": "",
  "ifsc": "",
  "period_from": "YYYY-MM-DD",
  "period_to": "YYYY-MM-DD",
  "opening_balance": 0,
  "total_credits": 0,
  "total_debits": 0,
  "closing_balance": 0,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "details": "",
      "ref_no": "",
      "debit": 0,
      "credit": 0,
      "balance": 0,
      "counterparty": ""
    }
  ]
}`;

const purchaseOrderPrompt = `You are a Purchase Order parser for a printing press business in India.
Extract ALL data from the purchase order text.

Return ONLY valid JSON with no markdown fences, no explanation:
{
  "doc_type": "purchase_order",
  "po_number": "",
  "po_date": "YYYY-MM-DD",
  "buyer": { "name": "", "gst": "", "pan": "", "address": "" },
  "vendor": { "name": "", "code": "", "address": "" },
  "items": [{ "sno": "", "description": "", "hsn": "", "uom": "", "qty": 0, "rate": 0, "delivery_date": "", "sgst_pct": 0, "cgst_pct": 0, "value_before_tax": 0, "total_value": 0 }],
  "grand_total": 0,
  "grand_total_words": "",
  "payment_terms": "",
  "delivery_terms": "",
  "order_handled_by": "",
  "order_handler_email": ""
}`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not set");
    }

    const body = await req.json();
    const { pdfText, parseMode = "auto" } = body;

    if (!pdfText || typeof pdfText !== "string") {
      return new Response(
        JSON.stringify({ error: "pdfText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pdfText.length > 500_000) {
      return new Response(
        JSON.stringify({ error: "Text too large. Maximum 500KB allowed." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect document type
    let mode = parseMode;
    if (mode === "auto") {
      const upper = pdfText.toUpperCase();
      if (
        upper.includes("STATEMENT OF ACCOUNT") ||
        upper.includes("OPENING BALANCE") ||
        upper.includes("CLOSING BALANCE") ||
        upper.includes("TOTAL CREDITS")
      ) {
        mode = "bank_statement";
      } else if (
        upper.includes("PURCHASE ORDER") ||
        upper.includes("PO NO") ||
        upper.includes("VENDOR CODE")
      ) {
        mode = "purchase_order";
      } else {
        mode = "bank_statement";
      }
    }

    const prompt = mode === "bank_statement" ? bankStatementPrompt : purchaseOrderPrompt;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: "Parse this document:\n\n" + pdfText },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Lovable AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to your Lovable workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI parsing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content ?? "";

    const cleanText = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      console.error("Failed to parse AI response:", rawText.substring(0, 500));
      throw new Error("Could not parse AI response as JSON");
    }

    return new Response(
      JSON.stringify({ success: true, data: parsed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("parse-document error:", message);

    return new Response(
      JSON.stringify({ success: false, error: "Document parsing failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
