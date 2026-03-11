import * as pdfjsLib from "pdfjs-dist";

// Worker version MUST match pdfjs-dist version (e.g. 4.4.168) to avoid "API version does not match Worker version" error.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

export interface ExtractResult {
  text: string;
  pageCount: number;
  isPasswordProtected: boolean;
  usedOcr?: boolean;
  /** True when OCR was attempted but failed (caller can show "Partial extraction (no OCR)"). */
  ocrFailed?: boolean;
}

export async function extractTextFromPdf(
  source: File | ArrayBuffer | Blob | string,
  password?: string
): Promise<ExtractResult> {
  let data: ArrayBuffer;

  if (source instanceof File || source instanceof Blob) {
    data = await source.arrayBuffer();
  } else if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
    data = await res.arrayBuffer();
  } else {
    data = source;
  }

  const loadParams: Record<string, unknown> = { data };
  if (password != null && String(password).trim() !== "") {
    loadParams.password = String(password).trim();
  }

  let pdf: pdfjsLib.PDFDocumentProxy;

  try {
    pdf = await pdfjsLib.getDocument(loadParams).promise;
  } catch (err: unknown) {
    const errName = (err as { name?: string })?.name;
    if (errName === "PasswordException" || /password|no password/i.test(String((err as Error)?.message ?? ""))) {
      throw new Error("PASSWORD_REQUIRED");
    }
    throw err;
  }

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const text = await extractOrderedPageText(page);
    if (text) pageTexts.push(text);
  }

  let finalText = pageTexts.join("\n\n").trim();
  let usedOcr = false;
  let ocrFailed = false;

  if (shouldRunOcrFallback(finalText, pdf.numPages)) {
    try {
      const ocrTexts = await extractTextWithOcr(pdf);
      const ocrCombined = ocrTexts.join("\n\n").trim();
      if (ocrCombined.length > finalText.length) {
        finalText = ocrCombined;
        usedOcr = true;
      }
    } catch (ocrErr) {
      console.warn("OCR fallback failed:", ocrErr);
      ocrFailed = true;
    }
  }

  return {
    text: finalText,
    pageCount: pdf.numPages,
    isPasswordProtected: !!password,
    usedOcr,
    ocrFailed,
  };
}

async function extractOrderedPageText(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const textContent = await page.getTextContent();

  type PositionedToken = { text: string; x: number; y: number; width: number };

  const tokens: PositionedToken[] = [];
  for (const item of textContent.items) {
    if (!("str" in item) || typeof item.str !== "string") continue;

    const text = item.str.trim();
    if (!text) continue;

    const transform = Array.isArray(item.transform) ? item.transform : [0, 0, 0, 0, 0, 0];
    const x = Number(transform[4] ?? 0);
    const y = Number(transform[5] ?? 0);
    const width = typeof item.width === "number" && item.width > 0 ? item.width : Math.max(4, text.length * 4.2);

    tokens.push({ text, x, y, width });
  }

  tokens.sort((a, b) => (Math.abs(a.y - b.y) <= 1 ? a.x - b.x : b.y - a.y));

  const rows: Array<{ y: number; tokens: PositionedToken[] }> = [];
  for (const token of tokens) {
    const row = rows.find((r) => Math.abs(r.y - token.y) <= 2.5);
    if (row) {
      row.tokens.push(token);
      row.y = (row.y + token.y) / 2;
    } else {
      rows.push({ y: token.y, tokens: [token] });
    }
  }

  rows.sort((a, b) => b.y - a.y);

  const lines = rows.map((row) => {
    const sorted = row.tokens.sort((a, b) => a.x - b.x);
    let current = "";
    let lastEnd = 0;

    for (let i = 0; i < sorted.length; i++) {
      const tk = sorted[i];
      const gap = i === 0 ? 0 : tk.x - lastEnd;
      if (i > 0 && gap > 2) current += " ";
      if (i > 0 && gap > 22) current += " ";
      current += tk.text;
      lastEnd = tk.x + tk.width;
    }

    return fixMidWordSpaces(current.trim());
  }).filter(Boolean);

  (page as { cleanup?: () => void }).cleanup?.();
  return lines.join("\n");
}

async function extractTextWithOcr(pdf: pdfjsLib.PDFDocumentProxy): Promise<string[]> {
  if (typeof document === "undefined") return [];

  const { recognize } = await import("tesseract.js");
  const pages = Math.min(pdf.numPages, 12);
  const out: string[] = [];

  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) continue;

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    await page.render({ canvasContext: ctx, viewport }).promise;

    const result = await recognize(canvas, "eng");
    const cleaned = normalizeOcrText(result.data?.text ?? "");
    if (cleaned.length > 0) out.push(cleaned);

    (page as { cleanup?: () => void }).cleanup?.();
    canvas.width = 0;
    canvas.height = 0;
  }

  return out;
}

function shouldRunOcrFallback(text: string, pageCount: number): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 80) return true;

  const hasTableSignals = /(s\.?\s*no|sl\.?\s*no|description|qty|quantity|uom|unit\s*price|amount|hsn|cgst|sgst|igst)/i.test(trimmed);
  const amountCount = (trimmed.match(/\b\d{2,}(?:\.\d{2})\b/g) ?? []).length;
  const lineCount = trimmed.split(/\n+/).length;
  const minAmountSignals = Math.min(8, Math.max(4, pageCount * 2));

  if (!hasTableSignals) return true;
  if (amountCount < minAmountSignals) return true;
  if (lineCount < Math.max(10, pageCount * 5)) return true;

  return false;
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/[|]/g, " ")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

/** Fix ALL CAPS words split mid-word (e.g. "PA CKAGINGS" -> "PACKAGINGS"). */
function fixMidWordSpaces(line: string): string {
  return line.replace(/\b([A-Z]{2})\s+([A-Z]{2,})\b/g, "$1$2");
}
