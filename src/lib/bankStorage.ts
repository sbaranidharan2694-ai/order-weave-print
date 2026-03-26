/**
 * Bank Analyser storage: all data in Supabase (database + storage).
 * No localStorage fallback — run migrations so tables and bucket exist.
 */

import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/integrations/supabase/config";
import type { Database } from "@/integrations/supabase/types";
import { logAudit } from "@/utils/auditLog";

const BANK_PDF_BUCKET = "bank-pdfs";

/** Supabase/PostgrestError can be a plain object; always throw Error with readable message. */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err != null && typeof err === "object") {
    const o = err as { message?: string; details?: string; hint?: string };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.details === "string" && o.details) return o.details;
    if (typeof o.hint === "string" && o.hint) return o.hint;
  }
  return typeof err === "string" ? err : JSON.stringify(err);
}

export type BankStatement = {
  id: string;
  accountKey: string;
  fileName: string;
  uploadedAt: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  accountNumber: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  pdfStored: boolean;
  pdfFileSize: number;
  pdfChunks: number;
  lastValidated: string | null;
};

export type BankTransaction = {
  id: string;
  statementId: string;
  date: string;
  details: string;
  refNo: string;
  debit: number;
  credit: number;
  balance: number;
  type: string;
  counterparty: string;
};

function statementToRow(stmt: BankStatement): Database["public"]["Tables"]["bank_statements"]["Insert"] {
  return {
    id: stmt.id,
    account_key: stmt.accountKey,
    file_name: stmt.fileName,
    uploaded_at: stmt.uploadedAt,
    period: stmt.period || null,
    period_start: stmt.periodStart || null,
    period_end: stmt.periodEnd || null,
    account_number: stmt.accountNumber || null,
    opening_balance: Number(stmt.openingBalance) || 0,
    closing_balance: Number(stmt.closingBalance) || 0,
    total_credits: Number(stmt.totalCredits) || 0,
    total_debits: Number(stmt.totalDebits) || 0,
    transaction_count: Number(stmt.transactionCount) || 0,
    pdf_stored: Boolean(stmt.pdfStored),
    pdf_file_size: Number(stmt.pdfFileSize) || 0,
    pdf_chunks: Number(stmt.pdfChunks) || 0,
    last_validated: stmt.lastValidated || null,
  };
}

function rowToStatement(row: Database["public"]["Tables"]["bank_statements"]["Row"]): BankStatement {
  return {
    id: row.id,
    accountKey: row.account_key,
    fileName: row.file_name,
    uploadedAt: row.uploaded_at,
    period: row.period ?? "",
    periodStart: row.period_start ?? "",
    periodEnd: row.period_end ?? "",
    accountNumber: row.account_number ?? "",
    openingBalance: Number(row.opening_balance) || 0,
    closingBalance: Number(row.closing_balance) || 0,
    totalCredits: Number(row.total_credits) || 0,
    totalDebits: Number(row.total_debits) || 0,
    transactionCount: Number(row.transaction_count) || 0,
    pdfStored: Boolean(row.pdf_stored),
    pdfFileSize: Number(row.pdf_file_size) || 0,
    pdfChunks: Number(row.pdf_chunks) || 0,
    lastValidated: row.last_validated,
  };
}

function transactionToRow(txn: BankTransaction): Database["public"]["Tables"]["bank_transactions"]["Insert"] {
  return {
    id: txn.id,
    statement_id: txn.statementId,
    date: (txn.date && String(txn.date).trim()) ? txn.date : new Date().toISOString().slice(0, 10),
    details: txn.details ?? null,
    ref_no: txn.refNo ?? null,
    debit: Number(txn.debit) || 0,
    credit: Number(txn.credit) || 0,
    balance: Number(txn.balance) || 0,
    type: txn.type ?? null,
    counterparty: txn.counterparty ?? null,
  };
}

function rowToTransaction(row: Database["public"]["Tables"]["bank_transactions"]["Row"]): BankTransaction {
  return {
    id: row.id,
    statementId: row.statement_id,
    date: row.date,
    details: row.details ?? "",
    refNo: row.ref_no ?? "",
    debit: Number(row.debit) || 0,
    credit: Number(row.credit) || 0,
    balance: Number(row.balance) || 0,
    type: row.type ?? "OTHER",
    counterparty: row.counterparty ?? "",
  };
}

let supabaseAvailable: boolean | null = null;

export async function isBankStorageAvailable(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  if (supabaseAvailable !== null) return supabaseAvailable;
  try {
    const { error } = await supabase.from("bank_statements").select("id").limit(1);
    supabaseAvailable = !error;
  } catch {
    supabaseAvailable = false;
  }
  return supabaseAvailable;
}

export function resetBankStorageAvailability(): void {
  supabaseAvailable = null;
}

function isTableMissingError(error: { code?: string; message?: string }): boolean {
  const msg = error?.message ?? "";
  return (
    error?.code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.toLowerCase().includes("relation")
  );
}

/** Load all statements from Supabase only. Returns [] if not configured or table missing. */
export async function loadStatements(): Promise<BankStatement[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from("bank_statements")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (error) {
      if (isTableMissingError(error)) return [];
      throw new Error(getErrorMessage(error));
    }
    return (data ?? []).map(rowToStatement);
  } catch {
    return [];
  }
}

/** Get a single statement by id. Returns null if not configured, table missing, or not found. */
export async function getStatement(id: string): Promise<BankStatement | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from("bank_statements").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (isTableMissingError(error)) return null;
      throw new Error(getErrorMessage(error));
    }
    return data ? rowToStatement(data) : null;
  } catch {
    return null;
  }
}

/** Normalize date string to YYYYMMDD for period overlap comparison. Returns "" if unparseable. */
function periodDateToYyyyMmDd(s: string | null | undefined): string {
  if (!s || typeof s !== "string") return "";
  const t = s.trim().replace(/\s+/g, "-");
  const ddmmyy = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    const yy = y.length === 2 ? (parseInt(y, 10) < 50 ? "20" + y : "19" + y) : y;
    return `${yy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`.replace(/-/g, "");
  }
  const yyyymmdd = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (yyyymmdd) {
    const [, y, m, d] = yyyymmdd;
    return `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`;
  }
  const ddmonyy = t.match(/^(\d{1,2})[-/]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-/]?(\d{2,4})$/i);
  if (ddmonyy) {
    const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const [, d, mon, y] = ddmonyy;
    const m = months[mon.slice(0, 3).toLowerCase()] ?? "01";
    const yy = y.length === 2 ? (parseInt(y, 10) < 50 ? "20" + y : "19" + y) : y;
    return `${yy}${m}${d.padStart(2, "0")}`;
  }
  const yyyymondd = t.match(/^(\d{4})[-/](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-/]?(\d{1,2})$/i);
  if (yyyymondd) {
    const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    const [, y, mon, d] = yyyymondd;
    const m = months[mon.slice(0, 3).toLowerCase()] ?? "01";
    return `${y}${m}${d.padStart(2, "0")}`;
  }
  return "";
}

/**
 * Find an existing statement for the same account with overlapping period (same or overlapping date range).
 * Used to prevent duplicate statements from multiple files for the same period.
 */
export async function findStatementByAccountAndPeriod(
  accountKey: string,
  periodStart: string,
  periodEnd: string
): Promise<BankStatement | null> {
  if (!isSupabaseConfigured) return null;
  const newStart = periodDateToYyyyMmDd(periodStart);
  const newEnd = periodDateToYyyyMmDd(periodEnd);
  if (!newStart || !newEnd) return null;
  try {
    const { data: rows, error } = await supabase
      .from("bank_statements")
      .select("*")
      .eq("account_key", accountKey);
    if (error || !rows?.length) return null;
    for (const row of rows) {
      const stmt = rowToStatement(row);
      const s = periodDateToYyyyMmDd(stmt.periodStart);
      const e = periodDateToYyyyMmDd(stmt.periodEnd);
      if (!s || !e) continue;
      const overlaps = newStart <= e && newEnd >= s;
      if (overlaps) return stmt;
    }
    return null;
  } catch {
    return null;
  }
}

/** Check if a transaction exists. Returns false if not configured or table missing. */
export async function hasTransaction(statementId: string, txnId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("statement_id", statementId)
      .eq("id", txnId)
      .maybeSingle();
    if (error) {
      if (isTableMissingError(error)) return false;
      throw new Error(getErrorMessage(error));
    }
    return !!data;
  } catch {
    return false;
  }
}

/** Delete a single transaction. No-op if not configured. */
export async function deleteTransaction(statementId: string, txnId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase
      .from("bank_transactions")
      .delete()
      .eq("statement_id", statementId)
      .eq("id", txnId);
    if (error) throw new Error(getErrorMessage(error));
  } catch {
    /* noop when table missing or not configured */
  }
}

/** Delete all transactions for a statement. No-op if not configured. */
export async function deleteTransactionsByStatement(statementId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from("bank_transactions").delete().eq("statement_id", statementId);
    if (error) throw new Error(getErrorMessage(error));
  } catch {
    /* noop when table missing or not configured */
  }
}

/** Load transactions for a statement. Returns [] if not configured or table missing. */
export async function loadTransactions(statementId: string): Promise<BankTransaction[]> {
  if (!isSupabaseConfigured) return [];
  try {
    // Paginate to avoid Supabase 1000-row default limit
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("statement_id", statementId)
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        if (isTableMissingError(error)) return [];
        throw new Error(getErrorMessage(error));
      }
      allRows.push(...(data ?? []));
      hasMore = (data ?? []).length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
    return allRows.map(rowToTransaction);
  } catch {
    return [];
  }
}

/** Save statement to Supabase only. Throws if not configured or table missing. */
export async function saveStatement(stmt: BankStatement): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase not configured. Connect Supabase in Lovable or add .env.");
  const { data: { user } } = await supabase.auth.getUser();
  const row = { ...statementToRow(stmt), created_by: user?.id ?? null };
  const { error } = await supabase.from("bank_statements").insert(row);
  if (error) throw new Error(getErrorMessage(error));
  await logAudit("Bank statement parsed", "bank_statement", stmt.id);
}

/** Update statement PDF flags (after storing PDF in bucket). */
export async function updateStatementPdf(statementId: string, pdfStored: boolean, pdfFileSize: number): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("bank_statements")
    .update({ pdf_stored: pdfStored, pdf_file_size: pdfFileSize })
    .eq("id", statementId);
  if (error) throw new Error(getErrorMessage(error));
}

/** Update statement transaction count. */
export async function updateStatementTransactionCount(statementId: string, transactionCount: number): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("bank_statements")
    .update({ transaction_count: transactionCount })
    .eq("id", statementId);
  if (error) throw new Error(getErrorMessage(error));
}

/** Update statement last_validated timestamp. */
export async function updateStatementLastValidated(statementId: string, lastValidated: string | null): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from("bank_statements")
    .update({ last_validated: lastValidated })
    .eq("id", statementId);
  if (error) throw new Error(getErrorMessage(error));
}

/** Save transaction to Supabase only. Throws if not configured or table missing. */
export async function saveTransaction(txn: BankTransaction): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase not configured. Connect Supabase in Lovable or add .env.");
  const row = transactionToRow(txn);
  const { error } = await supabase.from("bank_transactions").insert(row);
  if (error) throw new Error(getErrorMessage(error));
}

/** Unique key for duplicate row detection: same stmt + date + ref + amounts + details prefix (parser often repeats full identical row). */
function txnContentKey(row: {
  statement_id: string;
  date: string | null;
  ref_no: string | null;
  debit: number;
  credit: number;
  details: string | null;
}): string {
  const d = (row.date ?? "").trim().slice(0, 10);
  const r = (row.ref_no ?? "").trim().slice(0, 64);
  const debit = Number(row.debit) || 0;
  const credit = Number(row.credit) || 0;
  const det = (row.details ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  return `${row.statement_id}\t${d}\t${r}\t${debit}\t${credit}\t${det}`;
}

/** Insert all transactions in one batch. Dedupes by (statement_id, date, ref_no, debit, credit) so no duplicate rows are inserted. Returns count actually written. */
export async function saveTransactionsBatch(txns: BankTransaction[]): Promise<number> {
  if (!isSupabaseConfigured) throw new Error("Supabase not configured. Connect Supabase in Lovable or add .env.");
  if (txns.length === 0) return 0;

  const rows = txns.map(transactionToRow);
  const byContentKey = new Map<string, typeof rows[0]>();
  for (const row of rows) {
    const key = txnContentKey({
      statement_id: row.statement_id,
      date: row.date,
      ref_no: row.ref_no,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0,
      details: row.details,
    });
    if (!byContentKey.has(key)) byContentKey.set(key, row);
  }
  const dedupedRows = Array.from(byContentKey.values());

  if (dedupedRows.length < rows.length) {
    console.log(
      `[bankStorage] saveTransactionsBatch: deduped ${rows.length} → ${dedupedRows.length} by (statement_id, date, ref_no, debit, credit)`,
    );
  }

  const { error } = await supabase.from("bank_transactions").upsert(dedupedRows, { onConflict: "id" });
  if (error) {
    console.error("[bankStorage] saveTransactionsBatch error:", error);
    throw new Error(getErrorMessage(error));
  }

  console.log(`[bankStorage] saveTransactionsBatch: SUCCESS — ${dedupedRows.length} rows inserted/upserted`);
  return dedupedRows.length;
}

/** Delete statement and its transactions. No-op if not configured. */
export async function deleteStatement(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from("bank_transactions").delete().eq("statement_id", id);
    const { error } = await supabase.from("bank_statements").delete().eq("id", id);
    if (error) throw new Error(getErrorMessage(error));
  } catch {
    /* noop when table missing or not configured */
  }
}

/** Load custom lookup. Returns {} if not configured or table missing. */
export async function loadCustomLookup(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  try {
    const { data, error } = await supabase
      .from("bank_custom_lookup")
      .select("lookup")
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      if (isTableMissingError(error)) return {};
      throw new Error(getErrorMessage(error));
    }
    const raw = data?.lookup;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, string>;
    return {};
  } catch {
    return {};
  }
}

/** Save custom lookup to Supabase only. Throws if not configured. */
export async function saveCustomLookup(lookup: Record<string, string>): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase not configured. Connect Supabase in Lovable or add .env.");
  const { error } = await supabase.from("bank_custom_lookup").upsert(
    {
      id: "default",
      lookup: lookup as unknown as Database["public"]["Tables"]["bank_custom_lookup"]["Row"]["lookup"],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(getErrorMessage(error));
}

/** PDF in Supabase Storage (bucket: bank-pdfs). Key = statementId.pdf */
export async function savePdfToStorage(statementId: string, file: File): Promise<void> {
  const path = `${statementId}.pdf`;
  const { error } = await supabase.storage.from(BANK_PDF_BUCKET).upload(path, file, { upsert: true });
  if (error) throw new Error(getErrorMessage(error));
}

/** Download PDF from Supabase Storage; returns blob or null if missing */
export async function getPdfFromStorage(statementId: string): Promise<Blob | null> {
  const path = `${statementId}.pdf`;
  const { data, error } = await supabase.storage.from(BANK_PDF_BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

/** Remove PDF from Supabase Storage */
export async function deletePdfFromStorage(statementId: string): Promise<void> {
  const path = `${statementId}.pdf`;
  await supabase.storage.from(BANK_PDF_BUCKET).remove([path]);
}

/**
 * PDF storage API used by BankAnalyser: uses Supabase Storage when available.
 * If the bucket is missing, operations no-op or return null (no localStorage).
 */
export const pdfStorage = {
  /** Store PDF: pass the File from upload. Async. */
  async save(statementId: string, file: File): Promise<boolean> {
    try {
      await savePdfToStorage(statementId, file);
      return true;
    } catch {
      return false;
    }
  },
  /** Retrieve PDF as blob URL for viewing. Async. */
  async retrieve(statementId: string): Promise<string | null> {
    try {
      const blob = await getPdfFromStorage(statementId);
      if (!blob) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  },
  /** Delete PDF from storage. */
  async delete(statementId: string): Promise<void> {
    try {
      await deletePdfFromStorage(statementId);
    } catch {
      /* noop */
    }
  },
};
