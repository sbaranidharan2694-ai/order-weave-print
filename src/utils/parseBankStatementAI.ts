import { extractTextFromPdf } from "@/utils/extractPdfText";
import { parseBankStatement } from "@/utils/parseBankStatement";
import type { BankStatementData } from "@/utils/parseBankStatement";

export type { BankStatementData };

/**
 * Parse a bank statement PDF using built-in rule-based parser (no AI).
 * 1. Extract text client-side with PDF.js
 * 2. Parse with parseBankStatement (CSB and similar formats)
 */
export async function parseBankStatementWithAI(
  fileOrUrl: File | string,
  password?: string
): Promise<{ data: BankStatementData; pageCount?: number }> {
  const { text, pageCount } = await extractTextFromPdf(fileOrUrl, password);
  if (!text || text.trim().length < 30) {
    throw new Error("No text extracted — PDF may be image/scanned only");
  }

  const data = parseBankStatement(text);
  return { data, pageCount };
}
