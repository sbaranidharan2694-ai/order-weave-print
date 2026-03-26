// Supabase Edge Function: parse-document
// Parses bank statement PDF text into structured JSON using AI.
// Uses LOVABLE_API_KEY if set (Lovable), else GOOGLE_GEMINI_API_KEY (free at https://aistudio.google.com/apikey).
// Used by Bank Analyser with parseMode: "bank_statement".
// Request: POST { "pdfText": "...", "parseMode": "bank_statement" | "auto" }
// Response: { "success": true, "data": { account_holder, transactions, ... } } or { "error": "..." }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BANK_STATEMENT_PROMPT = `You are a Bank Statement parser for Indian banks (especially CSB Bank / Catholic Syrian Bank).
Extract ALL data from the bank statement text. Be extremely thorough — extract EVERY transaction row.

CRITICAL RULES:
1. Parse ALL transactions — do not skip any rows.
2. Dates: use YYYY-MM-DD. Handle DD-MMM-YYYY, DD/MM/YYYY, DD-MMMYYYY, DDMONYYYY.
3. For each transaction, set debit and credit from the amount columns (one will be 0).
4. "counterparty" = other party name from details (e.g. NEFT/RTGS/UPI payee/payer).
5. Each row should have the running balance after that transaction.
6. Extract account_holder, account_number, branch, ifsc, period_from, period_to, opening_balance, closing_balance.
7. total_credits = sum of all credit amounts; total_debits = sum of all debit amounts.

Return ONLY valid JSON with no markdown fences, no explanation. Use exactly these field names (snake_case):
{
  "doc_type": "bank_statement",
  "account_holder": "",
  "account_number": "",
  "account_type": "SAVING or CURRENT",
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

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function stripMarkdownJson(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/g, "")
    .trim();
}

function detectMode(pdfText: string): "bank_statement" | "purchase_order" {
  const upper = pdfText.toUpperCase();
  if (
    upper.includes("STATEMENT OF ACCOUNT") ||
    upper.includes("OPENING BALANCE") ||
    upper.includes("CLOSING BALANCE") ||
    upper.includes("TOTAL CREDITS") ||
    upper.includes("TOTAL DEBITS")
  ) {
    return "bank_statement";
  }
  if (
    upper.includes("PURCHASE ORDER") ||
    upper.includes("PO NO") ||
    upper.includes("VENDOR CODE") ||
    upper.includes("SUBCON PURCHASE ORDER")
  ) {
    return "purchase_order";
  }
  return "bank_statement";
}

async function callAI(systemPrompt: string, userMessage: string): Promise<{ text: string } | { error: string; status: number }> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")?.trim();
  const googleKey = Deno.env.get("GOOGLE_GEMINI_API_KEY")?.trim() || Deno.env.get("GEMINI_API_KEY")?.trim();

  if (lovableKey) {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        stream: false,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      }),
    });
    if (res.status === 429) return { error: "Rate limit exceeded, please try again later.", status: 429 };
    if (res.status === 402) return { error: "AI credits exhausted. Please add funds to your Lovable workspace.", status: 402 };
    if (!res.ok) {
      console.error("Lovable AI error:", res.status, await res.text().then((t) => t.slice(0, 300)));
      return { error: "AI parsing failed. Please try again.", status: 500 };
    }
    const data = await res.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) return { error: "AI returned no content.", status: 500 };
    return { text };
  }

  if (googleKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(googleKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    });
    if (res.status === 429) return { error: "Rate limit exceeded, please try again later.", status: 429 };
    if (res.status === 403) {
      const errText = await res.text();
      if (/quota|billing|api key/i.test(errText)) {
        return { error: "Gemini API quota exceeded or invalid key. Get a free key at https://aistudio.google.com/apikey", status: 403 };
      }
    }
    if (!res.ok) {
      console.error("Gemini API error:", res.status, await res.text().then((t) => t.slice(0, 300)));
      return { error: "AI parsing failed. Please try again.", status: 500 };
    }
    const data = await res.json().catch(() => null);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text.trim()) return { error: "AI returned no content.", status: 500 };
    return { text };
  }

  return {
    error: "No AI API key. Set LOVABLE_API_KEY (Lovable) or GOOGLE_GEMINI_API_KEY (free at https://aistudio.google.com/apikey) in Edge Function Secrets.",
    status: 503,
  };
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. Use POST." });
  }

  let pdfText: string;
  let parseMode: string;
  try {
    const bodyText = await req.text();
    if (bodyText.length > 100_000) {
      return new Response(
        JSON.stringify({ error: "Input too large. Maximum 100KB per request." }),
        { status: 413, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    const body = JSON.parse(bodyText) as { pdfText?: unknown; parseMode?: unknown };
    if (body == null || typeof body !== "object") {
      return jsonResponse(400, { error: "Request body must be a JSON object." });
    }
    if (body.pdfText == null || body.pdfText === "") {
      return jsonResponse(400, { error: "pdfText is required and cannot be empty." });
    }
    if (typeof body.pdfText !== "string") {
      return jsonResponse(400, { error: "pdfText must be a string." });
    }
    pdfText = body.pdfText;
    parseMode = typeof body.parseMode === "string" ? body.parseMode : "auto";
  } catch {
    return jsonResponse(400, { error: "Invalid JSON in request body." });
  }

  const MAX_LENGTH = 500_000;
  if (pdfText.length > MAX_LENGTH) {
    return jsonResponse(413, {
      error: `Text too large. Maximum ${MAX_LENGTH / 1024}KB allowed.`,
    });
  }

  const mode = parseMode === "auto" ? detectMode(pdfText) : parseMode;
  if (mode !== "bank_statement") {
    return jsonResponse(400, {
      error:
        "parse-document is configured for bank statements only. Use the parse-po function for Purchase Orders.",
    });
  }

  const aiResult = await callAI(BANK_STATEMENT_PROMPT, "Parse this bank statement text:\n\n" + pdfText);
  if ("error" in aiResult) {
    return jsonResponse(aiResult.status ?? 500, { error: aiResult.error });
  }

  const cleanText = stripMarkdownJson(aiResult.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanText);
  } catch (e) {
    console.error("AI response is not valid JSON:", cleanText.slice(0, 300));
    return jsonResponse(500, {
      error: "AI did not return valid JSON. Try a different PDF.",
    });
  }

  if (parsed == null || typeof parsed !== "object") {
    return jsonResponse(500, { error: "AI returned invalid structure." });
  }

  const data = parsed as Record<string, unknown>;
  if (!Array.isArray(data.transactions)) {
    data.transactions = [];
  }

  return jsonResponse(200, { success: true, data });
});
