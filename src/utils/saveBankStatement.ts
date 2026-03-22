import { supabase } from "@/integrations/supabase/client";
import { extractCounterparty } from "@/utils/extractCounterparty";
import { logAudit } from "@/utils/auditLog";
import { logger } from "@/lib/logger";

function n(val: unknown): number {
  if (!val && val !== 0) return 0;
  const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(parsed) ? 0 : parsed;
}

function s(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/** @deprecated Use extractCounterparty from @/utils/extractCounterparty. Kept for backward compatibility. */
export const extractParty = extractCounterparty;

// Account key mapping loaded at runtime from settings. Empty default — configure
// via Settings page / `settings` table, not in source code.
const ACCOUNT_KEY: Record<string, string> = {};

export async function saveBankStatementToDb(
  parsed: any,
  fileName = "statement.pdf"
): Promise<{ statementId: string; isNew: boolean; savedCount: number }> {

  const accountNumber = s(parsed.accountNumber);
  const periodStart = s(parsed.periodFrom ?? parsed.period_start ?? parsed.periodStart ?? "");
  const periodEnd = s(parsed.periodTo ?? parsed.period_end ?? parsed.periodEnd ?? "");

  // ── STEP 1: DUPLICATE CHECK (plain select — NO upsert, NO onConflict) ──
  const { data: existing, error: checkErr } = await supabase
    .from("bank_statements")
    .select("id")
    .eq("account_number", accountNumber)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (checkErr) {
    logger.error("[save] Duplicate check error:", checkErr.message);
  }

  if (existing?.id) {
    logger.log("[save] Duplicate — skipping");
    return { statementId: existing.id, isNew: false, savedCount: 0 };
  }

  // ── STEP 2: INSERT STATEMENT (plain insert — NO upsert) ────────────────
  const statementId = btoa(accountNumber + periodStart + periodEnd + Date.now())
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 40);

  const { data: { user } } = await supabase.auth.getUser();
  const { error: stmtErr } = await supabase.from("bank_statements").insert({
    id: statementId,
    created_by: user?.id ?? null,
    account_key: ACCOUNT_KEY[accountNumber] ?? "unknown",
    file_name: s(fileName) || "statement.pdf",
    period: `${periodStart} – ${periodEnd}`,
    period_start: periodStart,
    period_end: periodEnd,
    account_number: accountNumber,
    opening_balance: n(parsed.openingBalance),
    closing_balance: n(parsed.closingBalance),
    total_credits: n(parsed.totalCredits),
    total_debits: n(parsed.totalDebits),
    transaction_count: parsed.transactions?.length ?? 0,
    pdf_stored: false,
    pdf_file_size: 0,
    pdf_chunks: 1,
  });

  if (stmtErr) {
    throw new Error(`Statement insert failed: ${stmtErr.message}`);
  }
  await logAudit("Bank statement parsed", "bank_statement", statementId);

  const txns = parsed.transactions ?? [];
  logger.log(`[save] Statement ${statementId} | ${txns.length} transactions to save`);

  // ── STEP 3: INSERT TRANSACTIONS IN BATCHES OF 100 ──────────────────────
  let savedCount = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < txns.length; i += BATCH_SIZE) {
    const batch = txns.slice(i, i + BATCH_SIZE);
    const rows = batch.map((tx: any, j: number) => {
      const idx = i + j;
      const txnId = btoa(statementId + String(idx) + s(tx.date) + n(tx.debit) + n(tx.credit))
        .replace(/[^a-zA-Z0-9]/g, "")
        .substring(0, 40);
      return {
        id: txnId,
        statement_id: statementId,
        date: s(tx.date),
        details: s(tx.details),
        ref_no: s(tx.refNo ?? tx.ref_no ?? ""),
        debit: n(tx.debit),
        credit: n(tx.credit),
        balance: n(tx.balance),
        type: s(tx.type) || (n(tx.debit) > 0 ? "debit" : "credit"),
        counterparty: extractCounterparty(s(tx.details)),
      };
    });

    const { error: batchErr, data: inserted } = await supabase
      .from("bank_transactions")
      .insert(rows)
      .select("id");

    if (batchErr) {
      if (import.meta.env.DEV) console.warn(`[save] Batch ${i}-${i + batch.length} failed:`, batchErr.message);
    } else {
      savedCount += inserted?.length ?? 0;
    }
  }

  logger.log(`[save] Saved ${savedCount}/${txns.length} transactions`);
  return { statementId, isNew: true, savedCount };
}
