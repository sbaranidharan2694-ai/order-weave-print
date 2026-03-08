import { extractTextFromPdf } from "@/utils/extractPdfText";
import { invokeEdgeFunction } from "@/utils/invokeEdgeFunction";
import type { BankStatementData, Transaction } from "@/utils/parseBankStatement";

export type { BankStatementData };

/**
 * Parse a bank statement PDF using Gemini AI via the parse-document edge function.
 * 1. Extract text client-side with PDF.js
 * 2. Send text to Gemini edge function
 * 3. Map response to BankStatementData
 */
export async function parseBankStatementWithAI(
  fileOrUrl: File | string,
  password?: string
): Promise<{ data: BankStatementData; pageCount?: number }> {
  // Step 1: extract text
  const { text, pageCount } = await extractTextFromPdf(fileOrUrl, password);
  if (!text || text.trim().length < 30) {
    throw new Error("No text extracted — PDF may be image/scanned only");
  }

  // Step 2: call edge function
  const { data: result, error: invokeError } = await invokeEdgeFunction<{ success?: boolean; data?: Record<string, unknown>; error?: string }>("parse-document", {
    pdfText: text,
    parseMode: "bank_statement",
  });

  if (invokeError) {
    throw new Error("AI parsing failed: " + invokeError);
  }

  if (!result?.success || !result?.data) {
    throw new Error((result as { error?: string })?.error || "AI returned no data");
  }

  const d = result.data;

  // Step 3: map to BankStatementData
  const transactions: Transaction[] = (d.transactions || []).map(
    (t: Record<string, unknown>) => ({
      date: String(t.date || ""),
      details: String(t.details || ""),
      refNo: String(t.ref_no || ""),
      debit: Number(t.debit) || 0,
      credit: Number(t.credit) || 0,
      balance: Number(t.balance) || 0,
      type: (Number(t.debit) || 0) > 0 ? ("debit" as const) : ("credit" as const),
      counterparty: String(t.counterparty || ""),
    })
  );

  const data: BankStatementData = {
    docType: "bank_statement",
    accountHolder: String(d.account_holder || ""),
    accountNumber: String(d.account_number || ""),
    accountType: String(d.account_type || ""),
    bankName: String(d.bank_name || ""),
    branch: String(d.branch || ""),
    ifsc: String(d.ifsc || ""),
    periodFrom: String(d.period_from || ""),
    periodTo: String(d.period_to || ""),
    openingBalance: Number(d.opening_balance) || 0,
    totalCredits: Number(d.total_credits) || 0,
    totalDebits: Number(d.total_debits) || 0,
    closingBalance: Number(d.closing_balance) || 0,
    transactions,
  };

  return { data, pageCount };
}
