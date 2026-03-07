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
  total_credits: number;
  total_debits: number;
  closing_balance: number;
  file_name?: string | null;
  created_at?: string;
  uploaded_at?: string;
  transaction_count?: number;
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
 * Fetches all statements for an account (by account_key) then ALL transactions
 * for those statements in one query with .in("statement_id", allStatementIds)
 * and .limit(2000) to avoid Supabase default row cap.
 */
export function useAccountTransactions(accountKey: string) {
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
    if (!accountKey) return;
    setLoading(true);
    setError(null);

    try {
      const { data: stmtRows, error: stmtErr } = await supabase
        .from("bank_statements")
        .select("id, period_start, period_end, total_credits, total_debits, closing_balance, file_name, created_at, uploaded_at, transaction_count, pdf_stored, pdf_file_size")
        .eq("account_key", accountKey)
        .order("period_start", { ascending: true });

      if (stmtErr) throw new Error(`Statements load failed: ${stmtErr.message}`);

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

      const allStatementIds = stmts.map((s) => s.id);

      const { data: txRows, error: txErr } = await supabase
        .from("bank_transactions")
        .select("*")
        .in("statement_id", allStatementIds)
        .order("date", { ascending: false })
        .limit(2000);

      if (txErr) throw new Error(`Transactions load failed: ${txErr.message}`);

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
      console.error(`[useAccountTransactions] ${accountKey}:`, msg);
    } finally {
      setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { statements, transactions, summary, loading, error, refetch: load };
}
