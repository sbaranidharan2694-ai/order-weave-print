import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StatementRow {
  id: string;
  account_number: string;
  period_start: string;
  period_end: string;
  period: string;
  total_credits: number;
  total_debits: number;
  opening_balance?: number;
  closing_balance: number;
  transaction_count: number;
  file_name: string;
  created_at: string;
  pdf_stored?: boolean;
  pdf_file_size?: number;
  last_validated?: string | null;
}

export interface Transaction {
  id: string;
  statement_id: string;
  date: string;
  details: string;
  ref_no: string;
  debit: number;
  credit: number;
  balance: number;
  type: string;
  counterparty: string;
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
        .select("id, account_number, period_start, period_end, period, total_credits, total_debits, opening_balance, closing_balance, transaction_count, file_name, created_at, pdf_stored, pdf_file_size, last_validated")
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

      // ── 2. Load ALL transactions for ALL statements (paginate to avoid Supabase 1000-row default) ──
      const allTxRows: Transaction[] = [];
      const PAGE_SIZE = 1000;
      for (const stmtId of statementIds) {
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: txPage, error: txErr } = await supabase
            .from("bank_transactions")
            .select("id, statement_id, date, details, ref_no, debit, credit, balance, type, counterparty")
            .eq("statement_id", stmtId)
            .order("date", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

          if (txErr) throw new Error(`Transactions: ${txErr.message}`);
          const rows = (txPage ?? []) as Transaction[];
          allTxRows.push(...rows);
          hasMore = rows.length === PAGE_SIZE;
          from += PAGE_SIZE;
        }
      }

      const txns = allTxRows;
      setTransactions(txns);

      const totalCredits = stmts.reduce((s, r) => s + (Number(r.total_credits) || 0), 0);
      const totalDebits = stmts.reduce((s, r) => s + (Number(r.total_debits) || 0), 0);
      const transactionCountFromMetadata = stmts.reduce((s, r) => s + (Number(r.transaction_count) || 0), 0);

      setSummary({
        totalCredits,
        totalDebits,
        netFlow: totalCredits - totalDebits,
        transactionCount: transactionCountFromMetadata,
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
