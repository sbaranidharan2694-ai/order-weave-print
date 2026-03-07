/**
 * Parse PDF/image documents via Anthropic Claude API.
 * - PDFs MUST use content type "document" (not "image").
 * - Base64 must be raw (no data URI prefix); use fileToBase64().
 * - File size limit 4MB to avoid base64 bloat and API limits.
 */

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB

const PROMPTS: Record<string, string> = {
  purchase_order: `Extract all data from this Purchase Order. Return ONLY valid JSON, no explanation:
{
  "doc_type": "purchase_order",
  "po_number": "",
  "po_date": "",
  "buyer": { "name": "", "gst": "", "address": "" },
  "vendor": { "name": "", "code": "", "address": "" },
  "items": [{
    "sno": "", "description": "", "hsn": "", "uom": "",
    "qty": 0, "rate": 0, "delivery_date": "",
    "sgst_pct": 0, "cgst_pct": 0, "value_before_tax": 0, "total_value": 0
  }],
  "grand_total": 0,
  "grand_total_words": "",
  "payment_terms": "",
  "delivery_terms": "",
  "order_handled_by": "",
  "order_handler_email": ""
}`,

  bank_statement: `Extract all data from this Bank Statement. Return ONLY valid JSON, no explanation:
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
  "transactions": [{
    "date": "", "details": "", "ref_no": "",
    "debit": 0, "credit": 0, "balance": 0
  }]
}`,

  auto: `Detect document type and extract ALL data as structured JSON. Return ONLY valid JSON, no explanation.`,
};

/**
 * Convert File to raw base64 string (no data URI prefix).
 * Must be awaited; do not use reader.result before onload.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!result || !result.includes(",")) {
        reject(new Error("FileReader failed for: " + file.name));
        return;
      }
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("FileReader failed for: " + file.name));
    reader.readAsDataURL(file);
  });
}

export type ClaudePurchaseOrderResponse = {
  doc_type?: string;
  po_number?: string;
  po_date?: string;
  buyer?: { name?: string; gst?: string; address?: string };
  vendor?: { name?: string; code?: string; address?: string };
  items?: Array<{
    sno?: string;
    description?: string;
    hsn?: string;
    uom?: string;
    qty?: number;
    rate?: number;
    delivery_date?: string;
    sgst_pct?: number;
    cgst_pct?: number;
    value_before_tax?: number;
    total_value?: number;
  }>;
  grand_total?: number;
  grand_total_words?: string;
  payment_terms?: string;
  delivery_terms?: string;
  order_handled_by?: string;
  order_handler_email?: string;
};

export type ClaudeBankStatementResponse = {
  doc_type?: string;
  account_holder?: string;
  account_number?: string;
  account_type?: string;
  bank_name?: string;
  branch?: string;
  ifsc?: string;
  period_from?: string;
  period_to?: string;
  opening_balance?: number;
  total_credits?: number;
  total_debits?: number;
  closing_balance?: number;
  transactions?: Array<{
    date?: string;
    details?: string;
    ref_no?: string;
    debit?: number;
    credit?: number;
    balance?: number;
  }>;
};

function getApiKey(): string | undefined {
  return (
    (import.meta as any).env?.VITE_ANTHROPIC_API_KEY as string | undefined
  )?.trim?.() || undefined;
}

/**
 * Parse a document (PDF or image) with Claude. PDFs use type "document", images use type "image".
 * mode: "purchase_order" | "bank_statement" | "auto"
 */
export async function parseDocumentWithClaude(
  file: File,
  mode: "purchase_order" | "bank_statement" | "auto" = "auto"
): Promise<ClaudePurchaseOrderResponse | ClaudeBankStatementResponse | Record<string, unknown>> {
  if (!file) throw new Error("No file provided");

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 4MB.`
    );
  }

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");

  if (!isPdf && !isImage) {
    throw new Error(
      `Unsupported file type: ${file.type}. Use PDF or image files.`
    );
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "Anthropic API key not set. Add VITE_ANTHROPIC_API_KEY to your environment."
    );
  }

  const base64 = await fileToBase64(file);
  const mediaType = isPdf ? "application/pdf" : file.type;
  const contentType = isPdf ? "document" : "image";
  const prompt = PROMPTS[mode] || PROMPTS.auto;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: contentType,
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const msg =
      (errBody as any)?.error?.message ||
      (errBody as any)?.error ||
      response.statusText;
    throw new Error(`Claude API error ${response.status}: ${JSON.stringify(msg)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const rawText =
    data.content?.find((c) => c.type === "text")?.text?.trim() || "";

  const cleanText = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleanText) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Could not parse Claude response as JSON.\nRaw: ${rawText.substring(0, 400)}`
    );
  }
}
