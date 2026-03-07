import { supabase } from "@/integrations/supabase/client";

function n(val: unknown): number {
  if (!val && val !== 0) return 0;
  const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(parsed) ? 0 : parsed;
}

function s(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function extractParty(details: string): string {
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

const ACCOUNT_KEY: Record<string, string> = {
  "0244020077280": "superprinters",
  "0244020080155": "superscreens",
  "0244011477662": "revathy",
};

export { extractParty };

export async function saveBankStatementToDb(
  parsed: any,
  fileName = "statement.pdf"
): Promise<{ statementId: string; isNew: boolean; savedCount: number }> {
  console.log("PARSED TRANSACTIONS COUNT:", parsed.transactions?.length);
  console.log("FIRST TX:", parsed.transactions?.[0]);
  console.log("LAST TX:", parsed.transactions?.[parsed.transactions?.length - 1]);

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
    console.error("[save] Duplicate check error:", checkErr.message);
  }

  if (existing?.id) {
    console.log("[save] Duplicate — skipping");
    return { statementId: existing.id, isNew: false, savedCount: 0 };
  }

  // ── STEP 2: INSERT STATEMENT (plain insert — NO upsert) ────────────────
  const statementId = btoa(accountNumber + periodStart + periodEnd + Date.now())
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 40);

  const { error: stmtErr } = await supabase.from("bank_statements").insert({
    id: statementId,
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

  const txns = parsed.transactions ?? [];
  console.log(`[save] Statement ${statementId} | ${txns.length} transactions to save`);

  // ── STEP 3: INSERT TRANSACTIONS ONE BY ONE ─────────────────────────────
  let savedCount = 0;

  for (let i = 0; i < txns.length; i++) {
    const tx = txns[i];
    const txnId = btoa(statementId + String(i) + s(tx.date) + n(tx.debit) + n(tx.credit))
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 40);

    const { error: txErr } = await supabase
      .from("bank_transactions")
      .insert({
        id: txnId,
        statement_id: statementId,
        date: s(tx.date),
        details: s(tx.details),
        ref_no: s(tx.refNo ?? tx.ref_no ?? ""),
        debit: n(tx.debit),
        credit: n(tx.credit),
        balance: n(tx.balance),
        type: s(tx.type) || (n(tx.debit) > 0 ? "debit" : "credit"),
        counterparty: extractParty(s(tx.details)),
      });

    if (txErr) {
      console.error(`[save] TX row ${i + 1} failed: ${txErr.message}`);
    } else {
      savedCount++;
    }
  }

  console.log(`[save] Saved ${savedCount}/${txns.length} transactions`);
  return { statementId, isNew: true, savedCount };
}
