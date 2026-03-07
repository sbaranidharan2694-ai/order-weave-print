import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Transaction {
  id: string;
  statement_id: string;
  date: string;
  details: string | null;
  ref_no: string | null;
  debit: number;
  credit: number;
  balance: number;
  type: string | null;
  counterparty: string | null;
}

export interface StatementRow {
  id: string;
  period_start: string | null;
  period_end: string | null;
  period: string | null;
  total_credits: number;
  total_debits: number;
  closing_balance: number;
  transaction_count: number;
  created_at: string | null;
  file_name?: string | null;
  uploaded_at?: string | null;
  pdf_stored?: boolean;
  pdf_file_size?: number;
}

export interface AccountSummary {
  totalCredits: number;
  totalDebits: number;
  netFlow: number;
  transactionCount: number;
  statementCount: number;
}

/**
 * Fetches ALL statements for an account, then ALL transactions for those statements.
 * Uses .in("statement_id", statementIds) and .limit(2000) — never .eq("statement_id", singleId).
 * If your Supabase Dashboard → Settings → API has "Max Rows" &lt; 2000, increase it (e.g. 1000+).
 */
export function useAccountTransactions(accountIdentifier: string) {
  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<AccountSummary>({
    totalCredits: 0,
    totalDebits: 0,
    netFlow: 0,
    transactionCount: 0,
    statementCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountIdentifier) return;
    setLoading(true);
    setError(null);

    try {
      // ── 1. Load ALL statements for this account (explicit limit to avoid API default cap) ──
      const { data: stmtRows, error: stmtErr } = await supabase
        .from("bank_statements")
        .select("id, period_start, period_end, period, total_credits, total_debits, closing_balance, transaction_count, created_at, file_name, uploaded_at, pdf_stored, pdf_file_size")
        .or(`account_number.eq.${accountIdentifier},account_key.eq.${accountIdentifier}`)
        .order("period_start", { ascending: true })
        .limit(500);

      if (stmtErr) throw new Error(`Statements: ${stmtErr.message}`);

      const stmts = (stmtRows ?? []) as StatementRow[];
      setStatements(stmts);

      if (stmts.length === 0) {
        setTransactions([]);
        setSummary({
          totalCredits: 0,
          totalDebits: 0,
          netFlow: 0,
          transactionCount: 0,
          statementCount: 0,
        });
        setLoading(false);
        return;
      }

      const statementIds = stmts.map((s) => s.id);

      // ── 2. Load ALL transactions for ALL statements (never .eq — always .in + .limit(2000)) ──
      const { data: txRows, error: txErr } = await supabase
        .from("bank_transactions")
        .select("*")
        .in("statement_id", statementIds)
        .order("date", { ascending: false })
        .limit(2000);

      if (txErr) throw new Error(`Transactions: ${txErr.message}`);

      const txns = (txRows ?? []) as Transaction[];
      setTransactions(txns);

      const totalCredits = stmts.reduce((s, r) => s + (Number(r.total_credits) ?? 0), 0);
      const totalDebits = stmts.reduce((s, r) => s + (Number(r.total_debits) ?? 0), 0);

      setSummary({
        totalCredits,
        totalDebits,
        netFlow: totalCredits - totalDebits,
        transactionCount: txns.length,
        statementCount: stmts.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error(`[useAccountTransactions][${accountIdentifier}]`, msg);
    } finally {
      setLoading(false);
    }
  }, [accountIdentifier]);

  useEffect(() => {
    load();
  }, [load]);

  return { statements, transactions, summary, loading, error, refetch: load };
}
