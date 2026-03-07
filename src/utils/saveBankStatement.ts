import { supabase } from "@/integrations/supabase/client";

function safeNum(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  const n =
    typeof val === "string"
      ? parseFloat(val.replace(/[^0-9.-]/g, ""))
      : Number(val);
  return isNaN(n) ? 0 : n;
}

function safeStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

export function extractParty(details: string): string {
  const upi = details.match(/UPI\/(?:DR|CR)\/\d+\/([^/]+)/i);
  if (upi) return upi[1].trim();
  const neft = details.match(/NEFT\s+Cr--[A-Z0-9]+-([^-]+)/i);
  if (neft) return neft[1].trim();
  const imps = details.match(/IMPS--\d+-([A-Z\s]+)/i);
  if (imps) return imps[1].trim();
  if (/ATW\s+using/i.test(details)) return "ATM Withdrawal";
  if (/Chq\s+Paid/i.test(details)) return "Cheque Payment";
  if (/GOOGLE/i.test(details)) return "Google Pay";
  if (/SWIGGY/i.test(details)) return "Swiggy";
  return details.substring(0, 40).trim() || "Unknown";
}

export async function saveBankStatementToDb(
  parsed: {
    accountNumber?: unknown;
    periodFrom?: unknown;
    period_start?: unknown;
    periodStart?: unknown;
    periodTo?: unknown;
    period_end?: unknown;
    periodEnd?: unknown;
    openingBalance?: unknown;
    closingBalance?: unknown;
    totalCredits?: unknown;
    totalDebits?: unknown;
    transactions?: Array<{
      date?: unknown;
      details?: unknown;
      refNo?: unknown;
      ref_no?: unknown;
      debit?: unknown;
      credit?: unknown;
      balance?: unknown;
      type?: unknown;
      category?: unknown;
      counterparty?: unknown;
    }>;
  },
  fileName?: string
): Promise<{ statementId: string; isNew: boolean; savedCount: number }> {
  const accountNumber = safeStr(parsed.accountNumber);
  const periodStart = safeStr(
    parsed.periodFrom ?? parsed.period_start ?? parsed.periodStart
  );
  const periodEnd = safeStr(
    parsed.periodTo ?? parsed.period_end ?? parsed.periodEnd
  );

  const ACCOUNT_KEY_MAP: Record<string, string> = {
    "0244020077280": "superprinters",
    "0244020080155": "superscreens",
    "0244011477662": "revathy",
  };
  const accountKey = ACCOUNT_KEY_MAP[accountNumber] ?? accountNumber;

  const { data: existing } = await supabase
    .from("bank_statements")
    .select("id")
    .eq("account_number", accountNumber)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (existing?.id) {
    console.log("[save] Duplicate — skipping:", existing.id);
    return { statementId: existing.id, isNew: false, savedCount: 0 };
  }

  const statementId = btoa(
    accountKey + periodStart + periodEnd + Date.now()
  )
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 40);

  const { error: stmtErr } = await supabase.from("bank_statements").insert({
    id: statementId,
    account_key: accountKey,
    file_name: safeStr(fileName) || "statement.pdf",
    period: `${periodStart} – ${periodEnd}`,
    period_start: periodStart,
    period_end: periodEnd,
    account_number: accountNumber,
    opening_balance: safeNum(parsed.openingBalance),
    closing_balance: safeNum(parsed.closingBalance),
    total_credits: safeNum(parsed.totalCredits),
    total_debits: safeNum(parsed.totalDebits),
    transaction_count: parsed.transactions?.length ?? 0,
    pdf_stored: false,
    pdf_file_size: 0,
    pdf_chunks: 1,
  });

  if (stmtErr) {
    throw new Error(`Statement insert failed: ${stmtErr.message}`);
  }

  console.log(
    `[save] Statement saved: ${statementId} | txns: ${parsed.transactions?.length}`
  );

  let savedCount = 0;
  const txns = parsed.transactions ?? [];
  for (let i = 0; i < txns.length; i++) {
    const tx = txns[i];
    const txnId = btoa(statementId + String(i) + safeStr(tx.date) + safeNum(tx.debit) + safeNum(tx.credit))
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 40);
    const { error: txErr } = await supabase.from("bank_transactions").insert({
      id: txnId,
      statement_id: statementId,
      date: safeStr(tx.date),
      details: safeStr(tx.details),
      ref_no: safeStr(tx.refNo ?? tx.ref_no),
      debit: safeNum(tx.debit),
      credit: safeNum(tx.credit),
      balance: safeNum(tx.balance),
      type: safeStr(tx.type) || (safeNum(tx.debit) > 0 ? "debit" : "credit"),
      counterparty: extractParty(safeStr(tx.details)),
    });

    if (txErr) {
      console.error("[save] TX failed:", txErr.message, tx);
    } else {
      savedCount++;
    }
  }

  console.log(
    `[save] Done: ${savedCount}/${txns.length} transactions`
  );
  return { statementId, isNew: true, savedCount };
}
