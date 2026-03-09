import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Upload, Lock, Eye, EyeOff, Trash2, ChevronDown, ChevronUp,
  AlertTriangle, Star, Download, Printer, Search, X, FileText,
  Building2, ArrowUpDown, Users, Calendar, ChevronRight, Info,
  Shield, BarChart3, Home, Monitor, User, RefreshCw, FileCheck,
  SkipForward, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import {
  loadStatements,
  loadTransactions,
  saveStatement,
  saveTransaction,
  saveTransactionsBatch,
  deleteStatement as deleteStatementStorage,
  deleteTransactionsByStatement,
  loadCustomLookup,
  saveCustomLookup,
  getStatement,
  hasTransaction,
  deleteTransaction,
  pdfStorage,
  updateStatementPdf,
  updateStatementTransactionCount,
  updateStatementLastValidated,
} from "@/lib/bankStorage";
import { friendlyDbError } from "@/lib/utils";
import { type BankStatementData } from "@/utils/parseBankStatement";
import { extractTextFromPdf } from "@/utils/extractPdfText";
import { getTabForAccount } from "@/utils/parseBankStatement";
import { parseBankStatementWithAI } from "@/utils/parseBankStatementAI";
import { PasswordModal } from "@/components/BankAnalyser/PasswordModal";
import { SummaryCards } from "@/components/BankAnalyser/SummaryCards";
import { extractParty } from "@/utils/saveBankStatement";
import { TransactionTable } from "@/components/BankAnalyser/TransactionTable";
import { useAccountTransactions } from "@/hooks/useAccountTransactions";
import type { BankStatement, BankTransaction } from "@/lib/bankStorage";

/** Always get a readable string from any thrown/Supabase error (avoids [object Object]). */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err != null && typeof err === "object") {
    const o = err as { message?: string; details?: string };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.details === "string" && o.details) return o.details;
  }
  return typeof err === "string" ? err : JSON.stringify(err);
}

/** Detect account key from parsed bank statement accountNumber or accountHolder. */
function detectAccountFromBankStatementData(data: BankStatementData): string | null {
  const num = (data.accountNumber ?? "").replace(/\s/g, "");
  const holder = (data.accountHolder ?? "").toUpperCase();
  if (num.includes("0244020080155") || holder.includes("SUPER SCREENS")) return "superscreens";
  if (num.includes("0244011477662") || holder.includes("REVATHY")) return "revathy";
  if (num.includes("0244020077280") || holder.includes("SUPER PRINTERS")) return "superprinters";
  return null;
}

function hasSummaryWithoutRows(data: BankStatementData): boolean {
  const txCount = data.transactions?.length ?? 0;
  const credits = Number(data.totalCredits) || 0;
  const debits = Number(data.totalDebits) || 0;
  return txCount === 0 && (credits > 0 || debits > 0);
}

function buildTxnId(
  statementId: string,
  index: number,
  date: string,
  refNo: string,
  debit: number,
  credit: number,
  details: string,
): string {
  const amountPaise = Math.round((debit || credit || 0) * 100);
  const safeDate = (date || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 16);
  const safeRef = (refNo || "").replace(/[^0-9A-Za-z]/g, "").slice(-16);
  const safeDetails = (details || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 24);
  return `${statementId}_${index}_${safeDate}_${safeRef}_${amountPaise}_${safeDetails || "TXN"}`;
}

/** Map BankStatementData (PDF.js parser) to our statement + transactions. */
function mapBankStatementDataToStatementAndTransactions(
  data: BankStatementData,
  statementId: string,
  accountKey: string,
  fileName: string
): { statement: BankStatement; transactions: BankTransaction[] } {
  const txns = (data.transactions ?? []).map((t, i) => {
    const refNo = t.refNo ?? "";
    const date = t.date ?? "";
    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    const counterpartyVal = (t as { counterparty?: string }).counterparty ?? extractParty(t.details ?? "");
    const txnId = buildTxnId(statementId, i, date, refNo, debit, credit, t.details ?? "");
    return {
      id: txnId,
      statementId,
      date,
      details: t.details ?? "",
      refNo,
      debit,
      credit,
      balance: Number(t.balance) || 0,
      type: (t as { type?: string }).type ?? "OTHER",
      counterparty: counterpartyVal,
    };
  });
  const periodFrom = data.periodFrom ?? "";
  const periodTo = data.periodTo ?? "";
  const period = periodFrom && periodTo ? `${periodFrom} to ${periodTo}` : "";
  const statement: BankStatement = {
    id: statementId,
    accountKey,
    fileName,
    uploadedAt: new Date().toISOString(),
    period,
    periodStart: periodFrom,
    periodEnd: periodTo,
    accountNumber: data.accountNumber ?? "",
    openingBalance: Number(data.openingBalance) || 0,
    closingBalance: Number(data.closingBalance) || 0,
    totalCredits: Number(data.totalCredits) || 0,
    totalDebits: Number(data.totalDebits) || 0,
    transactionCount: txns.length,
    pdfStored: false,
    pdfFileSize: 0,
    pdfChunks: 0,
    lastValidated: null,
  };
  return { statement, transactions: txns };
}

/* ═══════════ ACCOUNTS ═══════════ */
const ACCOUNTS = [
  { key: "superprinters", label: "Super Printers", shortLabel: "S.Printers", color: "#1B2B4B", icon: "🖨️", accountNumber: "0244020077280" },
  { key: "superscreens", label: "Super Screens", shortLabel: "S.Screens", color: "#F4A100", icon: "🪟", accountNumber: "0244020080155" },
  { key: "revathy", label: "Revathy B.", shortLabel: "Revathy", color: "#16A34A", icon: "👤", accountNumber: "0244011477662" },
];

function detectAccount(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes("REVATHY BHARANIDHARAN") || t.includes("0244011477662")) return "revathy";
  if (t.includes("SUPER SCREENS") || t.includes("0244020080155")) return "superscreens";
  if (t.includes("SUPER PRINTERS") || t.includes("0244020077280")) return "superprinters";
  return null;
}

/* ═══════════ HELPERS ═══════════ */
const fmt = (n) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Parse transaction date string (DD-MMM-YYYY, DD-MM-YYYY, etc.) to Date or null. */
function parseTransactionDateGlobal(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const s = dateStr.trim();
  const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const numParts = s.split(/[-/\s]+/);
  if (numParts.length >= 3) {
    const a = parseInt(numParts[0], 10);
    const b = numParts[1].length <= 2 ? parseInt(numParts[1], 10) : MONTHS[numParts[1].toLowerCase().slice(0, 3)];
    const c = parseInt(numParts[2], 10);
    if (!isNaN(a) && !isNaN(c)) {
      if (a >= 1 && a <= 31 && typeof b === "number" && b >= 0 && b <= 11 && c >= 2000 && c <= 2100)
        return new Date(c, b, a);
      if (c >= 1 && c <= 31 && !isNaN(b) && b >= 1 && b <= 12 && a >= 2000 && a <= 2100)
        return new Date(a, b - 1, c);
    }
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

function cleanName(raw: string): string {
  let n = raw.replace(/^[\s-]+|[\s-]+$/g, "").replace(/\s+/g, " ").trim();
  n = n.replace(/\s+[A-Z]{4}0[A-Z0-9]{6}$/, "");
  n = n.replace(/(\s+[A-Z0-9]{5,})+\s*$/, "").trim();
  n = n.replace(/\s*-\s*NPCI\s*$/i, "").trim();
  n = n.replace(/\s+\d{6,}\s*$/, "").trim();
  n = titleCase(n);
  return n || "Unknown";
}

function extractCounterparty(details: string, customLookup: Record<string, string> = {}): { name: string; type: string } {
  const d = details.trim();
  // Check custom lookup first
  for (const [pattern, name] of Object.entries(customLookup)) {
    if (d.includes(pattern)) return { name, type: "OTHER" };
  }
  // 1. UPI/DR
  if (/UPI\/DR\//i.test(d)) {
    const parts = d.split("/");
    const name = parts.length > 3 ? cleanName(parts[3]) : cleanName(d.substring(0, 40));
    return { name, type: "UPI_DEBIT" };
  }
  // 2. UPI/CR
  if (/UPI\/CR\//i.test(d)) {
    const parts = d.split("/");
    const name = parts.length > 3 ? cleanName(parts[3]) : cleanName(d.substring(0, 40));
    return { name, type: "UPI_CREDIT" };
  }
  // 3. NEFT Cr
  if (/NEFT\s*Cr/i.test(d)) {
    const cleaned = d.replace(/NEFT\s*Cr[\s-]*/i, "").trim();
    const parts = cleaned.split("-").filter(Boolean);
    // Remove first (ref), remove trailing IFSC
    const filtered = parts.filter(p => !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.trim()));
    const nameParts = filtered.length > 1 ? filtered.slice(1) : filtered;
    const name = cleanName(nameParts.join(" "));
    return { name, type: "NEFT_CREDIT" };
  }
  // 4. NEFT Dr
  if (/NEFT\s*Dr/i.test(d)) {
    const cleaned = d.replace(/NEFT\s*Dr[\s-]*/i, "").trim();
    const parts = cleaned.split("-").filter(Boolean);
    const filtered = parts.filter(p => !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.trim()));
    const nameParts = filtered.length > 1 ? filtered.slice(1) : filtered;
    const name = cleanName(nameParts.join(" "));
    return { name, type: "NEFT_DEBIT" };
  }
  // 5. IMPS
  if (/IMPS/i.test(d)) {
    if (/GOOGLEINDIAD/i.test(d)) return { name: "Google India Digital Services Pvt Ltd", type: "IMPS" };
    const cleaned = d.replace(/IMPS[\s-]*/i, "").trim();
    const parts = cleaned.split("-").filter(Boolean);
    const nameParts = parts.length > 1 ? parts.slice(1) : parts;
    return { name: cleanName(nameParts.join(" ")), type: "IMPS" };
  }
  // 6. CHQ DEP
  if (/CHQ\s*DEP/i.test(d)) {
    const m = d.match(/CHQ\s*DEP\s*-\s*(.*?)(?:\s*-|$)/i);
    const name = m ? cleanName(m[1]) + " (Cheque Deposit)" : cleanName(d.substring(0, 40));
    return { name, type: "CHQ_DEPOSIT" };
  }
  // 7. CHQ PAID-TP-CASH WITHDRAW
  if (/CHQ\s*PAID.*TP.*CASH\s*WITHDRAW/i.test(d)) {
    const m = d.match(/BY\s+(.*?)(?:\s*-|$)/i);
    const name = m ? "Cash Withdrawal — " + cleanName(m[1]) : "Cash Withdrawal";
    return { name, type: "CHQ_WITHDRAWAL" };
  }
  // 8. Chq Paid-Inward Clearing / CHQ PAID (not TP)
  if (/Chq\s*Paid.*Inward\s*Clearing|CHQ\s*PAID/i.test(d) && !/TP/i.test(d)) {
    const m = d.match(/\d{2}-\d{2}-\s*(.*?)(?:\s*-|$)/);
    const name = m ? cleanName(m[1]) : cleanName(d.substring(0, 40));
    return { name, type: "CHQ_OUTWARD" };
  }
  // 9. ATW/ATM
  if (/ATW\s*using|ATM|cash\s*withdrawal/i.test(d)) {
    return { name: "ATM Cash Withdrawal", type: "ATM" };
  }
  // 10. Charges
  if (/Issuer\s*ATM|:Issuer|Chrgs|Service\s*Charge|charge|commission|gst|tax|cess/i.test(d)) {
    return { name: "Bank Charges", type: "CHARGES" };
  }
  // 11. Other
  return { name: cleanName(d.substring(0, 40)), type: "OTHER" };
}

function parseAmount(s: string): number {
  if (!s || s.trim() === "-" || s.trim() === "") return 0;
  const cleaned = s.replace(/[₹,\sINR]/gi, "").replace(/Cr|Dr/gi, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseCsbDate(s: string): string {
  const m = s.trim().match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})/i);
  if (m) {
    const months = { JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12" };
    return `${m[1].padStart(2,"0")}-${months[m[2].toUpperCase()]||"01"}-${m[3]}`;
  }
  const m2 = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m2) {
    const yr = m2[3].length === 2 ? "20" + m2[3] : m2[3];
    return `${m2[1].padStart(2,"0")}-${m2[2].padStart(2,"0")}-${yr}`;
  }
  return s.trim();
}

const SKIP_PATTERNS = [
  /^Page\s+\d+/i, /End of statement/i, /^Legends/i, /^Disclaimer/i,
  /Statement generated/i, /^Date\s+Details/i, /CSB 24X7/i, /CSB Bank Ltd/i,
  /1800 266/i, /CIN:/i, /Trusted Heritage/i, /www\.csb/i, /@@/i,
  /TOLL-FREE/i, /Regd\. Office/i, /CSB Bhavan/i, /PHONE BANKING/i,
  /^\+91/i, /^superprntrs/i, /^PALLAVARAM$/i, /^CHENNAI$/i,
  /^NO \d+ /i, /^SUPER SCREENS$/i, /^SUPER PRINTERS$/i,
  /^Customer Information/i, /^Customer ID/i, /^Home Branch/i,
  /^Account Open/i, /^Type of Account/i, /^Product\/Scheme/i,
  /^Account Status/i, /^Phone No/i, /^Email\s/i, /^Mode of Operation/i,
  /^Nomination Status/i, /^IFSC Code/i, /^CKYC/i, /^MICR/i,
  /^Joint Holder/i, /^Nominee Details/i, /^CSBBank/i,
  /^Branch Address/i, /^Statement of Account/i,
  /^Opening Balance/i, /^Transaction Details/i,
  /IFSC - Indian/i, /NEFT - National/i, /RTGS - Real/i,
  /UTR - Unique/i, /CHG - Charges/i, /^O\/W/i, /^I\/W/i,
  /^CLR/i, /^DW/i, /^ABB/i, /^MB -/i, /^NB -/i,
];

function shouldSkipLine(line: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(line));
}

function parseTransactions(lines: string[], statementId: string, customLookup: Record<string, string> = {}): {
  transactions: Array<{ id: string; date: string; details: string; refNo: string; debit: number; credit: number; balance: number; counterparty: string; type: string; statementId: string }>;
  meta: { accountNumber: string; period: string; periodStart: string; periodEnd: string; openingBalance: number; closingBalance: number; totalCredits: number; totalDebits: number };
} {
  const txns: Array<{ id: string; date: string; details: string; refNo: string; debit: number; credit: number; balance: number; counterparty: string; type: string; statementId: string }> = [];
  let accountNumber = "";
  let period = "";
  let periodStart = "";
  let periodEnd = "";
  let openingBalance = 0;
  let closingBalance = 0;
  let totalCredits = 0;
  let totalDebits = 0;

  const fullText = lines.join("\n");

  const accMatch = fullText.match(/Account\s*Number\s*[:\s]*([\d]+)/i);
  if (accMatch) accountNumber = accMatch[1];

  const periodMatch = fullText.match(/period[:\s]*([\d\-A-Za-z]+)\s*to\s*([\d\-A-Za-z]+)/i);
  if (periodMatch) {
    period = `${periodMatch[1].trim()} to ${periodMatch[2].trim()}`;
    periodStart = periodMatch[1].trim();
    periodEnd = periodMatch[2].trim();
  }

  const obMatch = fullText.match(/Opening\s*Balance[\s\S]*?INR\s*([\d,]+\.\d{2})/i);
  if (obMatch) openingBalance = parseAmount(obMatch[1]);
  const cbMatch = fullText.match(/Closing\s*Balance[\s\S]*?INR\s*([\d,]+\.\d{2})/i);
  if (cbMatch) closingBalance = parseAmount(cbMatch[1]);
  const tcMatch = fullText.match(/Total\s*Credits[\s\S]*?INR\s*([\d,]+\.\d{2})/i);
  if (tcMatch) totalCredits = parseAmount(tcMatch[1]);
  const tdMatch = fullText.match(/Total\s*Debits[\s\S]*?INR\s*([\d,]+\.\d{2})/i);
  if (tdMatch) totalDebits = parseAmount(tdMatch[1]);

  const csbDateRe = /^(\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{4})/i;
  const stdDateRe = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (shouldSkipLine(line)) continue;

    let dateStr = "";
    let rest = "";
    const csbMatch2 = line.match(csbDateRe);
    const stdMatch = line.match(stdDateRe);

    if (csbMatch2) {
      dateStr = csbMatch2[1];
      rest = line.substring(csbMatch2[0].length).trim();
    } else if (stdMatch) {
      dateStr = stdMatch[1];
      rest = line.substring(stdMatch[0].length).trim();
    } else {
      // Continuation line
      if (txns.length > 0) {
        const prev = txns[txns.length - 1];
        const cleaned = line.replace(/\s+/g, " ").trim();
        if (cleaned && cleaned.length > 2) {
          prev.details = (prev.details + " " + cleaned).trim();
          const { name, type } = extractCounterparty(prev.details, customLookup);
          prev.counterparty = name;
          prev.type = type;
        }
      }
      continue;
    }

    const date = parseCsbDate(dateStr);
    if (/^Date\b/i.test(dateStr) || rest.includes("Details") || rest.includes("Ref No")) continue;

    let balance = 0;
    let remaining = rest;

    const balRe = /INR\s*([\d,]+\.\d{2})\s*(?:Cr|Dr)?\s*$/i;
    const balMatch2 = remaining.match(balRe);
    if (balMatch2) {
      balance = parseAmount(balMatch2[1]);
      remaining = remaining.substring(0, remaining.length - balMatch2[0].length).trim();
    }

    let credit = 0;
    let debit = 0;
    const amtTokens = [];
    let tempRemain = remaining;

    for (let j = 0; j < 2; j++) {
      const amtMatch = tempRemain.match(/\s+([\d,]+\.\d{2}|-)\s*$/);
      if (amtMatch) {
        amtTokens.unshift(amtMatch[1]);
        tempRemain = tempRemain.substring(0, tempRemain.length - amtMatch[0].length).trim();
      } else break;
    }

    if (amtTokens.length === 2) {
      debit = parseAmount(amtTokens[0]);
      credit = parseAmount(amtTokens[1]);
      remaining = tempRemain;
    } else if (amtTokens.length === 1) {
      const amt = parseAmount(amtTokens[0]);
      if (amt > 0) {
        if (balance > (txns.length > 0 ? txns[txns.length - 1].balance : openingBalance)) {
          credit = amt;
        } else {
          debit = amt;
        }
      }
      remaining = tempRemain;
    }

    // Bug 1 fix: Inward cheque returns must be debit-only
    const upperDetails = (remaining || "").toUpperCase();
    if (/CHQ\s*RETURN|CHEQUE\s*RETURN|CAPS_ACCT_DR|I\/W\s*CHQ\s*RETURN|I\/W\s*Chq\s*return/i.test(remaining)) {
      if (credit > 0 && debit === 0) { debit = credit; credit = 0; }
      else if (credit > 0 && debit > 0) { credit = 0; }
    }

    if (debit === 0 && credit === 0 && balance === 0) continue;

    let refNo = "";
    const refMatch = remaining.match(/\s+(\S{10,})\s*$/);
    if (refMatch) {
      refNo = refMatch[1];
      remaining = remaining.substring(0, remaining.length - refMatch[0].length).trim();
    }

    const details = remaining.replace(/\s+/g, " ").trim();
    if (!details && debit === 0 && credit === 0) continue;

    const { name, type } = extractCounterparty(details || "Unknown", customLookup);

    const txnId = buildTxnId(statementId, txns.length, date, refNo, debit, credit, details || "");

    txns.push({
      id: txnId, date, details: details || "Transaction", refNo,
      debit, credit, balance, counterparty: name, type, statementId,
    });
  }

  if (!totalCredits) totalCredits = txns.reduce((s, t) => s + t.credit, 0);
  if (!totalDebits) totalDebits = txns.reduce((s, t) => s + t.debit, 0);

  return {
    transactions: txns,
    meta: { accountNumber, period, periodStart, periodEnd, openingBalance, closingBalance, totalCredits, totalDebits },
  };
}

/* ═══════════ PDF RETENTION ═══════════ */
async function savePDF(statementId: string, file: File, onProgress?: (msg: string) => void): Promise<boolean> {
  onProgress?.("Saving PDF to database…");
  return pdfStorage.save(statementId, file);
}

async function retrievePDF(statementId: string): Promise<string | null> {
  return pdfStorage.retrieve(statementId);
}

async function deletePDF(statementId: string): Promise<void> {
  await pdfStorage.delete(statementId);
}

/* ═══════════ STORAGE HELPERS ═══════════ */
async function loadAllTransactions(accountKey: string | null) {
  const stmts = await loadStatements();
  const filtered = accountKey ? stmts.filter((s: { accountKey: string }) => s.accountKey === accountKey) : stmts;
  const all: Array<Record<string, unknown>> = [];
  for (const s of filtered) {
    const txns = await loadTransactions(s.id);
    all.push(...txns);
  }
  return all;
}

async function deleteStatement(id: string) {
  await deleteStatementStorage(id);
  await deletePDF(id);
}

/* ═══════════ MIGRATION ═══════════ */
async function migrateOldData() {
  try {
    const old = typeof window !== "undefined" ? window.localStorage.getItem("bankStatements") : null;
    if (!old) return;
    const stmts = JSON.parse(old);
    if (!Array.isArray(stmts) || stmts.length === 0) return;
    for (const s of stmts) {
      const accountKey = detectAccount((s.accountNumber || "") + " " + (s.fileName || "")) || "superprinters";
      const newStmt = {
        id: s.id, accountKey, fileName: s.fileName, uploadedAt: s.uploadedAt,
        period: s.period, periodStart: "", periodEnd: "",
        accountNumber: s.accountNumber, openingBalance: s.openingBalance,
        closingBalance: s.closingBalance, totalCredits: s.totalCredits,
        totalDebits: s.totalDebits, transactionCount: s.transactionCount || (s.transactions?.length || 0),
        pdfStored: false, pdfFileSize: 0, pdfChunks: 0, lastValidated: null,
      };
      await saveStatement(newStmt);
      if (s.transactions) {
        for (const [idx, t] of s.transactions.entries()) {
          const txnId = buildTxnId(s.id, idx, t.date, t.refNo || "", t.debit || 0, t.credit || 0, t.details || "");
          await saveTransaction({ ...t, id: txnId, statementId: s.id });
        }
      }
    }
    if (typeof window !== "undefined") window.localStorage.removeItem("bankStatements");
    toast.success("Migrated " + stmts.length + " old statements to new storage");
  } catch (e) { console.error("Migration error:", e); }
}

/* ═══════════ TYPE COLORS ═══════════ */
const typeDot = {
  UPI_DEBIT: "bg-blue-500", UPI_CREDIT: "bg-blue-500",
  NEFT_CREDIT: "bg-emerald-500", NEFT_DEBIT: "bg-emerald-500",
  IMPS: "bg-purple-500",
  CHQ_DEPOSIT: "bg-orange-500", CHQ_OUTWARD: "bg-orange-500", CHQ_WITHDRAWAL: "bg-orange-500",
  ATM: "bg-red-500", CHARGES: "bg-muted-foreground", OTHER: "bg-muted-foreground",
};

const typeLabels = {
  UPI_DEBIT: "UPI ↑", UPI_CREDIT: "UPI ↓", NEFT_CREDIT: "NEFT ↓", NEFT_DEBIT: "NEFT ↑",
  IMPS: "IMPS", CHQ_DEPOSIT: "Chq In", CHQ_OUTWARD: "Chq Out", CHQ_WITHDRAWAL: "Chq Cash",
  ATM: "ATM", CHARGES: "Charges", OTHER: "Other",
};

const PIE_COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#6B7280", "#EC4899", "#14B8A6"];

/* ═══════════ COMPONENT ═══════════ */
export default function BankAnalyser() {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [allTransactions, setAllTransactions] = useState<BankTransaction[]>([]);
  const [customLookup, setCustomLookup] = useState<Record<string, string>>({});
  const [duplicateDialog, setDuplicateDialog] = useState<{
    existingId: string;
    periodLabel: string;
    accountKey: string;
    data: BankStatementData;
    file: File;
  } | null>(null);

  // Refresh data (used on mount and by Overview/account tabs). silent = true avoids full-page loading (e.g. after upload).
  const refreshData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const stmts = await loadStatements();
      setStatements(stmts);
      const txns: BankTransaction[] = [];
      for (const s of stmts) {
        const st = await loadTransactions(s.id);
        txns.push(...st);
      }
      setAllTransactions(txns);
      const lookup = await loadCustomLookup();
      setCustomLookup(lookup);
    } catch (e) {
      toast.error("Failed to load bank data");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // When user switches to Overview tab, refresh so Overview always shows latest data (fixes data not showing after upload)
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    if (value === "overview") {
      refreshData({ silent: true });
    }
  }, [refreshData]);

  const accountTxns = useCallback((key: string) => allTransactions.filter(t => {
    const stmt = statements.find(s => s.id === t.statementId);
    return stmt?.accountKey === key;
  }), [allTransactions, statements]);

  const doSaveStatement = useCallback(async (accountKey: string, data: BankStatementData, file: File) => {
    const finalStmtId = btoa(accountKey + file.name + file.size).replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);
    const { statement: newStmt, transactions: txns } = mapBankStatementDataToStatementAndTransactions(data, finalStmtId, accountKey, file.name);
    if (hasSummaryWithoutRows(data)) {
      throw new Error("Transaction rows could not be parsed from this statement. Please re-upload after parser update.");
    }
    newStmt.transactionCount = txns.length;
    newStmt.accountNumber = data.accountNumber ?? (ACCOUNTS.find(a => a.key === accountKey) as { accountNumber?: string } | undefined)?.accountNumber ?? "";
    await saveStatement(newStmt);
    try {
      await saveTransactionsBatch(txns);
      const savedTxns = await loadTransactions(finalStmtId);
      if (savedTxns.length !== txns.length) {
        console.warn("[BankAnalyser] Transaction count mismatch: saved " + savedTxns.length + ", expected " + txns.length);
        toast.warning("Saved " + savedTxns.length + " of " + txns.length + " transactions. Check Supabase bank_transactions.");
      }
    } catch (err) {
      toast.error(toErrorMessage(err));
      throw err;
    }
    const saved = await pdfStorage.save(finalStmtId, file);
    if (saved) await updateStatementPdf(finalStmtId, true, file.size);
    setActiveTab(accountKey);
    await refreshData({ silent: true });
    toast.success(`Saved to ${ACCOUNTS.find(a => a.key === accountKey)?.label ?? accountKey} — ${txns.length} transactions`);
  }, []);

  const handleOverviewSave = useCallback(async (accountKey: string, data: BankStatementData, file: File) => {
    const finalStmtId = btoa(accountKey + file.name + file.size).replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);
    const existing = await getStatement(finalStmtId);
    if (existing) {
      toast.warning("Already imported — this statement was uploaded earlier. Skipped.");
      return;
    }
    const { statement: newStmt, transactions: txns } = mapBankStatementDataToStatementAndTransactions(data, finalStmtId, accountKey, file.name);
    const allStmts = await loadStatements();
    const periodDup = allStmts.find(s => s.accountKey === accountKey && s.periodStart === newStmt.periodStart && s.periodEnd === newStmt.periodEnd && newStmt.periodStart && newStmt.periodEnd);
    if (periodDup) {
      setDuplicateDialog({
        existingId: periodDup.id,
        periodLabel: `${newStmt.periodStart || ""} to ${newStmt.periodEnd || ""}`,
        accountKey,
        data,
        file,
      });
      return;
    }
    await doSaveStatement(accountKey, data, file);
  }, [doSaveStatement]);

  const handleDuplicateReplace = useCallback(async () => {
    if (!duplicateDialog) return;
    const { existingId, accountKey, data, file } = duplicateDialog;
    setDuplicateDialog(null);
    try {
      await deleteStatement(existingId);
      await doSaveStatement(accountKey, data, file);
    } catch (e: unknown) {
      toast.error(toErrorMessage(e));
    }
  }, [duplicateDialog, doSaveStatement]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 print:space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-secondary" />
          <h1 className="text-2xl font-bold text-foreground">Bank Analyser</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshData()}
          disabled={loading}
          className="gap-1"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="print:hidden">
        <TabsList className="bg-muted w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview" className="gap-1"><Home className="h-3.5 w-3.5" />Overview</TabsTrigger>
          {ACCOUNTS.map(a => (
            <TabsTrigger key={a.key} value={a.key} className="gap-1" title={`${a.label} — CSB Bank ••••${(a as { accountNumber?: string }).accountNumber?.slice(-4) ?? ""}`}>
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} aria-hidden />
              <span>{a.icon}</span>
              <span className="hidden sm:inline">{a.label}</span>
              <span className="sm:hidden">{a.shortLabel}</span>
            </TabsTrigger>
          ))}
          <TabsTrigger value="reports" className="gap-1"><BarChart3 className="h-3.5 w-3.5" />Reports</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview">
          <OverviewTab
            statements={statements}
            allTransactions={allTransactions}
            accountTxns={accountTxns}
            setActiveTab={setActiveTab}
            onSaveParsedStatement={handleOverviewSave}
            refreshData={refreshData}
          />
        </TabsContent>

        {/* ACCOUNT TABS */}
        {ACCOUNTS.map(account => (
          <TabsContent key={account.key} value={account.key}>
            <AccountTab
              account={account}
              onRefresh={async () => refreshData({ silent: true })}
              customLookup={customLookup}
              onUpdateLookup={async (l) => { await saveCustomLookup(l); setCustomLookup(l); }}
            />
          </TabsContent>
        ))}

        {/* REPORTS TAB */}
        <TabsContent value="reports">
          <ReportsTab statements={statements} allTransactions={allTransactions} />
        </TabsContent>
      </Tabs>

      {/* Duplicate statement: Replace / Cancel */}
      <Dialog open={!!duplicateDialog} onOpenChange={(open) => !open && setDuplicateDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Statement already exists</DialogTitle></DialogHeader>
          <DialogDescription>
            A statement for this period ({duplicateDialog?.periodLabel ?? ""}) already exists. Upload anyway and replace?
          </DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDuplicateDialog(null)}>Cancel</Button>
            <Button onClick={handleDuplicateReplace}>Replace</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════ OVERVIEW TAB ═══════════ */
function parseTxnDateToMonthYear(dateStr: string): { month: number; year: number } | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.trim().split("-");
  if (parts.length !== 3) return null;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  const c = parseInt(parts[2], 10);
  if (isNaN(a) || isNaN(b) || isNaN(c)) return null;
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;
  // DD-MM-YYYY (day <= 31, month <= 12, year 4-digit)
  if (a >= 1 && a <= 31 && b >= 1 && b <= 12 && c >= 2000 && c <= 2100)
    return { month: b, year: c };
  // YYYY-MM-DD
  if (c >= 1 && c <= 31 && b >= 1 && b <= 12 && a >= 2000 && a <= 2100)
    return { month: b, year: a };
  return null;
}

type OverviewUploadEntry = {
  id: string;
  file: File;
  name: string;
  status: "pending" | "password_required" | "parsing" | "done" | "error";
  error?: string;
  data?: BankStatementData;
  assignedTab?: string;
};

function OverviewTab({
  statements,
  allTransactions,
  accountTxns,
  setActiveTab,
  onSaveParsedStatement,
  refreshData,
}: {
  statements: Array<Record<string, unknown>>;
  allTransactions: Array<Record<string, unknown>>;
  accountTxns: (key: string) => Array<Record<string, unknown>>;
  setActiveTab: (tab: string) => void;
  onSaveParsedStatement: (accountKey: string, data: BankStatementData, file: File) => Promise<void>;
  refreshData: (opts?: { silent?: boolean }) => Promise<void>;
}) {
  const [uploads, setUploads] = useState<OverviewUploadEntry[]>([]);
  const [passwordModal, setPasswordModal] = useState<{ entry: OverviewUploadEntry; attempt: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback(async (entry: OverviewUploadEntry, password?: string) => {
    setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "parsing" as const } : u));
    try {
      const { data: parsed } = await parseBankStatementWithAI(entry.file, password);
      const assignedTab = getTabForAccount(parsed.accountNumber ?? "") || detectAccountFromBankStatementData(parsed);
      if (!assignedTab) {
        throw new Error(`Unknown account: ${parsed.accountNumber ?? "—"}. Add to ACCOUNT_TAB_MAP if needed.`);
      }
      if (hasSummaryWithoutRows(parsed)) {
        throw new Error("Could not parse transaction rows from this PDF yet. I’ve updated the parser—please re-upload once.");
      }
      setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "done", data: parsed, assignedTab } : u));
      toast.success(`${parsed.accountHolder} — ${parsed.transactions.length} txns | ₹${parsed.closingBalance.toLocaleString("en-IN")} closing`);
      await onSaveParsedStatement(assignedTab, parsed, entry.file);
    } catch (err: unknown) {
      console.error("Bank Analyser Overview parse/save error:", err);
      const msg = toErrorMessage(err);
      if (msg === "PASSWORD_REQUIRED") {
        setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "password_required" as const } : u));
        setPasswordModal({ entry, attempt: 1 });
        return;
      }
      setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "error" as const, error: msg } : u));
      toast.error(msg);
    }
  }, [onSaveParsedStatement]);

  const handlePasswordSubmit = useCallback(async (password: string) => {
    if (!passwordModal) return;
    const { entry, attempt } = passwordModal;
    setPasswordModal(null);
    setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "parsing" as const } : u));
    try {
      const { data: parsed } = await parseBankStatementWithAI(entry.file, password);
      const assignedTab = getTabForAccount(parsed.accountNumber ?? "") || detectAccountFromBankStatementData(parsed);
      if (!assignedTab) throw new Error(`Unknown account: ${parsed.accountNumber ?? "—"}`);
      if (hasSummaryWithoutRows(parsed)) {
        throw new Error("Could not parse transaction rows from this PDF yet. I’ve updated the parser—please re-upload once.");
      }
      setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "done", data: parsed, assignedTab } : u));
      toast.success(`${parsed.transactions.length} transactions saved`);
      await onSaveParsedStatement(assignedTab, parsed, entry.file);
    } catch (err: unknown) {
      console.error("Bank Analyser Overview password submit error:", err);
      const msg = toErrorMessage(err);
      if (msg === "PASSWORD_REQUIRED" || /password/i.test(msg)) {
        setPasswordModal({ entry, attempt: attempt + 1 });
        setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "password_required" as const, error: "Wrong password" } : u));
        toast.error("Wrong password — try again");
      } else {
        setUploads(prev => prev.map(u => u.id === entry.id ? { ...u, status: "error" as const, error: msg } : u));
        toast.error(msg);
      }
    }
  }, [passwordModal, onSaveParsedStatement]);

  const handleFileDrop = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!fileArray.length) {
      toast.error("Please upload PDF files only");
      return;
    }
    const newEntries: OverviewUploadEntry[] = fileArray.map(f => ({
      id: `${Date.now()}_${f.name}_${f.size}`,
      file: f,
      name: f.name,
      status: "pending" as const,
    }));
    setUploads(prev => [...prev, ...newEntries]);
    newEntries.forEach(entry => parseFile(entry));
  }, [parseFile]);

  const totals = ACCOUNTS.map(a => {
    const stmtsForAccount = (statements as Array<{ accountKey?: string; totalCredits?: number; totalDebits?: number; transactionCount?: number }>).filter(
      s => s.accountKey === a.key
    );
    const totalCredits = stmtsForAccount.reduce((s, st) => s + (Number(st.totalCredits) || 0), 0);
    const totalDebits = stmtsForAccount.reduce((s, st) => s + (Number(st.totalDebits) || 0), 0);
    const txnCount = stmtsForAccount.reduce((s, st) => s + (Number(st.transactionCount) || 0), 0);
    return {
      ...a,
      totalCredits,
      totalDebits,
      txnCount,
    };
  });

  const grandCredits = totals.reduce((s, t) => s + t.totalCredits, 0);
  const grandDebits = totals.reduce((s, t) => s + t.totalDebits, 0);

  return (
    <div className="space-y-6 mt-4">
      <p className="text-sm text-muted-foreground">🏦 Bank Analyser › Overview — All statements</p>

      {/* Password modal */}
      <PasswordModal
        open={!!passwordModal}
        fileName={passwordModal?.entry.name ?? ""}
        onSubmit={handlePasswordSubmit}
        onCancel={() => {
          setPasswordModal(null);
          if (passwordModal) {
            setUploads(prev => prev.map(u => u.id === passwordModal.entry.id ? { ...u, status: "error" as const, error: "Cancelled" } : u));
          }
        }}
        error={passwordModal && passwordModal.attempt > 1 ? "Wrong password" : undefined}
      />

      {/* Drop zone — upload in Overview, auto-routes to account tab */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); handleFileDrop(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30 hover:bg-muted/50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={e => { const f = e.target.files; if (f?.length) handleFileDrop(f); e.target.value = ""; }}
        />
        <div className="text-3xl mb-2">📂</div>
        <p className="text-sm font-medium text-foreground">
          {isDragging ? "Drop PDFs here" : "Click or drag & drop bank statement PDFs"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Password-protected CSB Bank PDFs supported · Auto-routes to correct account tab
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Super Printers · ••••7280 · Super Screens · ••••0155 · Revathy B. · ••••7662 · Upload from 20/02/2026 onwards
        </p>
      </div>

      {/* Upload results */}
      {uploads.length > 0 && (
        <div className="space-y-3">
          {uploads.map(u => (
            <Card key={u.id} className="rounded-xl">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">
                      {u.status === "done" ? "✅" : u.status === "error" ? "❌" : u.status === "parsing" ? "⏳" : u.status === "password_required" ? "🔒" : "📄"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      {u.data && (
                        <p className="text-xs text-muted-foreground">
                          {u.data.accountHolder} · {u.data.accountNumber} → <span className="font-medium text-primary">{u.assignedTab ?? ""}</span>
                        </p>
                      )}
                      {u.error != null && (
                        <p className="text-xs text-destructive">
                          {typeof u.error === "string" ? u.error : toErrorMessage(u.error)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {u.status === "parsing" && <span className="text-xs text-muted-foreground animate-pulse">Parsing…</span>}
                    {u.status === "password_required" && (
                      <Button size="sm" variant="outline" onClick={() => setPasswordModal({ entry: u, attempt: 1 })}>
                        Enter password
                      </Button>
                    )}
                    {u.status === "done" && u.data && (
                      <div className="text-right">
                        <p className="text-xs font-bold text-green-600">₹{u.data.closingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                        <p className="text-xs text-muted-foreground">{u.data.transactions.length} txns</p>
                      </div>
                    )}
                  </div>
                </div>
                {u.status === "done" && u.data && (
                  <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t">
                    {[
                      { label: "Opening", value: u.data.openingBalance },
                      { label: "Credits", value: u.data.totalCredits, cls: "text-green-600" },
                      { label: "Debits", value: u.data.totalDebits, cls: "text-red-600" },
                      { label: "Closing", value: u.data.closingBalance, cls: "text-blue-600" },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className="text-center">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={cn("text-xs font-bold", cls)}>₹{value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {statements.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No Statements Yet</h3>
            <p className="text-muted-foreground text-sm">Upload PDFs above or select an account tab to upload CSB bank statement PDFs</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {totals.map(a => (
              <Card key={a.key} className="rounded-2xl shadow-sm" style={{ borderTop: `3px solid ${a.color}` }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{a.icon}</span>
                    <p className="font-semibold text-sm text-foreground">{a.label}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Credits</p>
                      <p className="text-sm font-bold text-success">{fmt(a.totalCredits)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Debits</p>
                      <p className="text-sm font-bold text-destructive">{fmt(a.totalDebits)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net</p>
                      <p className={cn("text-sm font-bold", a.totalCredits - a.totalDebits >= 0 ? "text-success" : "text-destructive")}>
                        {fmt(a.totalCredits - a.totalDebits)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    {(a.txnCount ?? 0) === 0 ? "No statements uploaded yet" : `${a.txnCount ?? 0} transactions`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Combined Credits</p>
                  <p className="text-xl font-bold text-success">{fmt(grandCredits)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Combined Debits</p>
                  <p className="text-xl font-bold text-destructive">{fmt(grandDebits)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Net Flow</p>
                  <p className={cn("text-xl font-bold", grandCredits - grandDebits >= 0 ? "text-success" : "text-destructive")}>
                    {fmt(grandCredits - grandDebits)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Statements</p>
                  <p className="text-xl font-bold text-primary">{statements.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-muted-foreground text-center">
        🔒 Passwords never stored. All processing in-browser. Statements, transactions, and PDFs are stored in the cloud — accessible from any device.
      </p>
    </div>
  );
}

/* ═══════════ ACCOUNT TAB ═══════════ */
function AccountTab({ account, onRefresh, customLookup, onUpdateLookup }) {
  const { statements: hookStatements, transactions: hookTransactions, summary, loading: hookLoading, error: hookError, refetch } = useAccountTransactions(
    (account as { accountNumber?: string }).accountNumber ?? account.key
  );

  const statements = useMemo(
    () =>
      hookStatements.map((s) => ({
        id: s.id,
        fileName: s.file_name ?? "Statement",
        uploadedAt: s.created_at ?? "",
        periodStart: s.period_start ?? "",
        periodEnd: s.period_end ?? "",
        period: s.period ?? (s.period_start && s.period_end ? `${s.period_start} – ${s.period_end}` : ""),
        transactionCount: s.transaction_count ?? 0,
        totalCredits: s.total_credits ?? 0,
        totalDebits: s.total_debits ?? 0,
        openingBalance: s.opening_balance ?? 0,
        closingBalance: s.closing_balance ?? 0,
        pdfStored: s.pdf_stored ?? false,
        pdfFileSize: s.pdf_file_size ?? 0,
        lastValidated: s.last_validated ?? null,
      })),
    [hookStatements]
  );

  const [queue, setQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [parsedPreview, setParsedPreview] = useState<{ statementId: string; data: BankStatementData } | null>(null);
  const [isParsingPreview, setIsParsingPreview] = useState(false);
  const [repairingStatementId, setRepairingStatementId] = useState<string | null>(null);
  const [reuploadTargetStatementId, setReuploadTargetStatementId] = useState<string | null>(null);

  const statementTxnCounts = useMemo(() => {
    const m = new Map<string, number>();
    hookTransactions.forEach((t) => {
      const prev = m.get(t.statement_id) ?? 0;
      m.set(t.statement_id, prev + 1);
    });
    return m;
  }, [hookTransactions]);

  const missingTxStatements = useMemo(
    () => statements.filter((s) => (s.transactionCount ?? 0) > 0 && (statementTxnCounts.get(s.id) ?? 0) === 0),
    [statements, statementTxnCounts],
  );

  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const handleReuploadStatement = useCallback(
    async (statementId: string, file: File) => {
      const target = statements.find((s) => s.id === statementId);
      if (!target) {
        toast.error("Statement not found");
        return;
      }

      setRepairingStatementId(statementId);
      toast.loading(`Re-uploading ${target.fileName}…`, { id: `repair-${statementId}` });

      try {
        const { data: parsed } = await parseBankStatementWithAI(file);
        if (!parsed) {
          throw new Error("Failed to parse PDF");
        }

        const accountKey = account.key;
        const { transactions: txns } = mapBankStatementDataToStatementAndTransactions(parsed, statementId, accountKey, target.fileName);

        if (txns.length === 0) {
          throw new Error("No transactions found in uploaded PDF");
        }

        // Statement already exists; only refill transactions.
        await deleteTransactionsByStatement(statementId);
        await saveTransactionsBatch(txns);
        await updateStatementTransactionCount(statementId, txns.length);

        toast.success(`Recovered ${txns.length} transactions for ${target.fileName}`, { id: `repair-${statementId}` });
        await refetch();
        await onRefresh();
      } catch (err) {
        toast.error(toErrorMessage(err), { id: `repair-${statementId}` });
      } finally {
        setRepairingStatementId(null);
      }
    },
    [statements, account.key, refetch, onRefresh],
  );

  const openReuploadPicker = useCallback((statementId: string) => {
    setReuploadTargetStatementId(statementId);
    fileInputRef.current?.click();
  }, []);

  const transactions = useMemo(
    () =>
      hookTransactions.map((t) => ({
        id: t.id,
        statementId: t.statement_id,
        date: t.date,
        details: t.details ?? "",
        refNo: t.ref_no ?? "",
        debit: t.debit ?? 0,
        credit: t.credit ?? 0,
        balance: t.balance ?? 0,
        type: t.type ?? "OTHER",
        counterparty: t.counterparty ?? "",
      })),
    [hookTransactions]
  );

  const [typeFilter, setTypeFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("credits");
  const [expandedParties, setExpandedParties] = useState(new Set());
  const [showLargeTxns, setShowLargeTxns] = useState(false);
  const [showUnparsed, setShowUnparsed] = useState(false);
  const [dateFilter, setDateFilter] = useState("all");
  const [datePage, setDatePage] = useState(0);
  const [unparsedModal, setUnparsedModal] = useState<any>(false);
  const [validating, setValidating] = useState(false);
  const [dateRangeFrom, setDateRangeFrom] = useState("");
  const [dateRangeTo, setDateRangeTo] = useState("");
  const [exportCsvLoading, setExportCsvLoading] = useState(false);

  const filtered = useMemo(() => {
    const now = new Date();
    return transactions.filter(t => {
      if (typeFilter === "Credits" && t.credit === 0) return false;
      if (typeFilter === "Debits" && t.debit === 0) return false;
      if (typeFilter === "UPI In" && t.type !== "UPI_CREDIT") return false;
      if (typeFilter === "UPI Out" && t.type !== "UPI_DEBIT") return false;
      if (typeFilter === "NEFT" && !t.type.startsWith("NEFT")) return false;
      if (typeFilter === "IMPS" && t.type !== "IMPS") return false;
      if (typeFilter === "Cheque In" && t.type !== "CHQ_DEPOSIT") return false;
      if (typeFilter === "Cheque Out" && !["CHQ_OUTWARD", "CHQ_WITHDRAWAL"].includes(t.type)) return false;
      if (typeFilter === "ATM" && t.type !== "ATM") return false;
      if (typeFilter === "Charges" && t.type !== "CHARGES") return false;
      if (searchQuery && !t.counterparty.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !t.details.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      // Date filter
      if (dateFilter !== "all") {
        const parts = t.date.split("-");
        if (parts.length === 3) {
          const td = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          if (dateFilter === "week") { const w = new Date(now); w.setDate(w.getDate() - 7); if (td < w) return false; }
          if (dateFilter === "month") { if (td.getMonth() !== now.getMonth() || td.getFullYear() !== now.getFullYear()) return false; }
          if (dateFilter === "lastmonth") { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); if (td.getMonth() !== lm.getMonth() || td.getFullYear() !== lm.getFullYear()) return false; }
        }
      }
      return true;
    });
  }, [transactions, typeFilter, searchQuery, dateFilter]);

  const summaryTotalCredits = transactions.reduce((s, t) => s + (Number(t.credit) || 0), 0);
  const summaryTotalDebits = transactions.reduce((s, t) => s + (Number(t.debit) || 0), 0);
  const summaryNetFlow = summaryTotalCredits - summaryTotalDebits;
  const totalCredits = filtered.reduce((s, t) => s + t.credit, 0);
  const totalDebits = filtered.reduce((s, t) => s + t.debit, 0);
  const netFlow = totalCredits - totalDebits;

  // Group by party
  const { sortedParties, pinnedParties: pinned } = useMemo(() => {
    const partyMap = new Map();
    filtered.forEach(t => {
      if (!partyMap.has(t.counterparty)) partyMap.set(t.counterparty, []);
      partyMap.get(t.counterparty).push(t);
    });
    const parties = Array.from(partyMap.entries()).map(([name, txns]) => {
      const credits = txns.reduce((s, t) => s + t.credit, 0);
      const debits = txns.reduce((s, t) => s + t.debit, 0);
      const types = [...new Set(txns.map(t => t.type))];
      const dates = txns.map(t => t.date).sort();
      return { name, txns, count: txns.length, credits, debits, net: credits - debits, types,
        dateRange: dates.length > 1 ? `${dates[0]} – ${dates[dates.length - 1]}` : dates[0] || "",
        kind: credits > 0 && debits > 0 ? "mixed" : credits > 0 ? "credit" : "debit" };
    });
    const pinnedTypes = ["ATM Cash Withdrawal", "Bank Charges"];
    const regular = parties.filter(p => !pinnedTypes.includes(p.name));
    const pinned2 = parties.filter(p => pinnedTypes.includes(p.name));
    regular.sort((a, b) => {
      if (sortBy === "credits") return b.credits - a.credits;
      if (sortBy === "debits") return b.debits - a.debits;
      if (sortBy === "count") return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
    return { sortedParties: [...regular, ...pinned2], pinnedParties: pinned2 };
  }, [filtered, sortBy]);

  const largeTxns = filtered.filter(t => t.debit > 10000 || t.credit > 10000);
  const unparsedTxns = filtered.filter(t => t.type === "OTHER");
  const hasData = filtered.length > 0;

  const borderColor = { credit: "border-l-4 border-l-success", debit: "border-l-4 border-l-destructive", mixed: "border-l-4 border-l-warning" };

  const typeChips = ["All", "Credits", "Debits", "UPI In", "UPI Out", "NEFT", "IMPS", "Cheque In", "Cheque Out", "ATM", "Charges"];
  const dateChips = [
    { key: "week", label: "This Week" }, { key: "month", label: "This Month" },
    { key: "lastmonth", label: "Last Month" }, { key: "all", label: "All Time" },
  ];

  /* ─── MULTI-FILE UPLOAD ─── */
  const handleFiles = useCallback(async (files: FileList) => {
    const pdfFiles = Array.from(files).filter((f: File) => f.name.toLowerCase().endsWith(".pdf")).slice(0, 5);
    if (files.length > 5) toast.warning("Only first 5 files will be processed");
    if (pdfFiles.length === 0) { toast.error("Only PDF files are supported"); return; }
    const items = pdfFiles.map(f => ({
      file: f, status: "pending", account: account.key,
      progress: "", error: "", saved: 0, skipped: 0,
      password: "", showPwd: false, attempts: 0, passwordRef: null,
    }));
    setQueue(items);
    setProcessing(true);
    await processQueue(items);
  }, [account.key, statements, customLookup]);

  const processQueue = async (items) => {
    for (let qi = 0; qi < items.length; qi++) {
      const item = items[qi];
      setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "processing", progress: "Loading PDF..." } : p));

      try {
        // L1 — PDF file dedup
        const accountKey = item.account;
        const stmtId = btoa(accountKey + item.file.name + item.file.size)
          .replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);
        const existing = await getStatement(stmtId);
        if (existing) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Already imported (uploaded ${new Date(existing.uploadedAt).toLocaleDateString()}). Skipped.` } : p));
          continue;
        }

        // Parse PDF with built-in parser
        setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: "Parsing PDF…" } : p));
        let data: BankStatementData;
        try {
          const aiResult = await parseBankStatementWithAI(item.file);
          data = aiResult.data;
        } catch (parseErr) {
          const errStr = toErrorMessage(parseErr);
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: errStr } : p));
          toast.error(errStr);
          continue;
        }
        const detected = detectAccountFromBankStatementData(data);
        const finalAccount = detected || item.account;
        const finalStmtId = btoa(finalAccount + item.file.name + item.file.size)
          .replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);
        const existing2 = await getStatement(finalStmtId);
        if (existing2) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Already imported (uploaded ${new Date(existing2.uploadedAt).toLocaleDateString()}). Skipped.` } : p));
          continue;
        }
        const { statement: newStmt, transactions: txns } = mapBankStatementDataToStatementAndTransactions(data, finalStmtId, finalAccount, item.file.name);
        if (txns.length === 0) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: "No transactions found" } : p));
          toast.error("No transactions found in PDF");
          continue;
        }

        const allStmts = await loadStatements();
        const periodDup = allStmts.find(s =>
          s.accountKey === finalAccount && s.periodStart === newStmt.periodStart && s.periodEnd === newStmt.periodEnd && newStmt.periodStart && newStmt.periodEnd
        );
        if (periodDup) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Already imported: ${periodDup.periodStart || ""} – ${periodDup.periodEnd || ""}. Skipped.` } : p));
          continue;
        }

        // Insert parent statement FIRST so FK constraint on bank_transactions is satisfied
        newStmt.transactionCount = txns.length;
        newStmt.accountNumber = data.accountNumber ?? "";
        await saveStatement(newStmt);

        setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: `Saving ${txns.length} transactions…` } : p));
        try {
          await saveTransactionsBatch(txns);
        } catch (err) {
          const msg = toErrorMessage(err);
          toast.error(msg);
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: msg } : p));
          continue;
        }
        const saved = txns.length;
        const skipped = 0;

        if (item.file.size <= 50 * 1024 * 1024) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: "Saving PDF…" } : p));
          try {
            const pdfSaved = await savePDF(finalStmtId, item.file, (msg) => {
              setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: msg } : p));
            });
            if (pdfSaved) {
              await updateStatementPdf(finalStmtId, true, item.file.size);
            }
          } catch (_) { /* PDF save optional */ }
        }

        setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "done", saved, skipped } : p));
        await new Promise((r) => setTimeout(r, 200));
        await refetch();
        await onRefresh();
      } catch (e: unknown) {
        console.error("Bank Analyser processQueue error:", e);
        const msg = toErrorMessage(e);
        const friendly = friendlyDbError(msg) || "Failed";
        setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: friendly } : p));
        toast.error(friendly);
      }
    }
    setProcessing(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (!files?.length) {
      e.target.value = "";
      return;
    }

    if (reuploadTargetStatementId) {
      void handleReuploadStatement(reuploadTargetStatementId, files[0]);
      setReuploadTargetStatementId(null);
      e.target.value = "";
      return;
    }

    handleFiles(files);
    e.target.value = "";
  };

  const handleDeleteStmt = async (id) => {
    try {
      await deleteStatement(id);
      setDeleteConfirm(null);
      toast.success("Statement deleted");
      await refetch();
      await onRefresh();
    } catch (e: unknown) {
      const msg = toErrorMessage(e);
      toast.error(friendlyDbError(msg));
    }
  };

  const handleViewPDF = async (stmtId) => {
    const b64 = await retrievePDF(stmtId);
    if (!b64) { toast.error("PDF not found"); return; }
    const w = window.open();
    w.document.write(`<iframe src="${b64}" style="width:100%;height:100%;border:none;position:fixed;inset:0" />`);
  };

  const handleDownloadPDF = async (stmt) => {
    const b64 = await retrievePDF(stmt.id);
    if (!b64) { toast.error("PDF not found"); return; }
    const a = document.createElement("a");
    a.href = b64;
    a.download = stmt.fileName;
    a.click();
  };

  const handleParsePdf = async (statementId: string) => {
    setIsParsingPreview(true);
    setParsedPreview(null);
    try {
      const url = await pdfStorage.retrieve(statementId);
      if (!url) {
        toast.error("PDF not found in storage");
        return;
      }
      toast.loading("Parsing PDF…", { id: "parse-pdf" });
      const { data, pageCount } = await parseBankStatementWithAI(url);
      setParsedPreview({ statementId, data });
      toast.success(
        `Parsed: ${data.transactions.length} transactions | Closing ₹${data.closingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        { id: "parse-pdf" }
      );
    } catch (err: unknown) {
      console.error("Bank Analyser Parse PDF error:", err);
      const msg = toErrorMessage(err);
      toast.error(msg || "Parse failed", { id: "parse-pdf" });
    } finally {
      setIsParsingPreview(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    const iso = new Date().toISOString();
    let allPassed = true;
    const results: string[] = [];
    try {
      for (const s of statements) {
        const stmtTxns = transactions.filter(t => t.statementId === s.id);
        const sumCredits = stmtTxns.reduce((a, t) => a + (Number(t.credit) || 0), 0);
        const sumDebits = stmtTxns.reduce((a, t) => a + (Number(t.debit) || 0), 0);
        const opening = Number(s.openingBalance) || 0;
        const expectedClosing = opening + sumCredits - sumDebits;
        const actualClosing = Number(s.closingBalance) || 0;
        const diff = Math.abs(expectedClosing - actualClosing);
        const passed = diff < 0.01;
        if (passed) {
          await updateStatementLastValidated(s.id, iso);
          results.push(`✅ ${s.periodStart || s.fileName}: Opening ₹${opening.toLocaleString("en-IN", { minimumFractionDigits: 2 })} → Closing ₹${actualClosing.toLocaleString("en-IN", { minimumFractionDigits: 2 })}. ${stmtTxns.length} transactions reconciled.`);
        } else {
          allPassed = false;
          results.push(`❌ ${s.periodStart || s.fileName}: Expected closing ₹${expectedClosing.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, actual ₹${actualClosing.toLocaleString("en-IN", { minimumFractionDigits: 2 })}. Difference: ₹${diff.toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`);
        }
      }
      if (allPassed && results.length > 0) {
        toast.success(results[0].replace("✅ ", "Validation passed: "));
      } else if (!allPassed) {
        toast.error(results.find(r => r.startsWith("❌"))?.replace("❌ ", "Validation failed: ") ?? "Validation failed");
      }
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setValidating(false);
      await refetch();
      await onRefresh();
    }
  };

  const toggleParty = (name: string) => {
    setExpandedParties(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  /* CSV */
  const downloadCsv = (rows, filename) => {
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url2 = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url2; a.download = filename; a.click();
    URL.revokeObjectURL(url2);
  };

  const acctLabel = account.label.replace(/\s+/g, "");

  const exportSummaryCsv = () => {
    const header = ["Party", "Count", "Credits", "Debits", "Net", "Date Range"];
    const partyMap = new Map<string, { count: number; credits: number; debits: number; net: number; dateRange: string }>();
    transactionsToShow.forEach(t => {
      const name = t.counterparty || "Unknown";
      if (!partyMap.has(name)) partyMap.set(name, { count: 0, credits: 0, debits: 0, net: 0, dateRange: "" });
      const row = partyMap.get(name)!;
      row.count++;
      row.credits += t.credit ?? 0;
      row.debits += t.debit ?? 0;
      row.net = row.credits - row.debits;
      if (!row.dateRange) row.dateRange = t.date; else row.dateRange = [row.dateRange.split(" – ")[0], t.date].sort().join(" – ");
    });
    const rows = Array.from(partyMap.entries()).map(([name, r]) => [name, r.count, r.credits.toFixed(2), r.debits.toFixed(2), r.net.toFixed(2), r.dateRange]);
    downloadCsv([header, ...rows], `${acctLabel}_summary.csv`);
  };

  const transactionsToShow = useMemo(() => {
    if (!dateRangeFrom && !dateRangeTo) return hookTransactions;
    const from = dateRangeFrom ? new Date(dateRangeFrom).getTime() : 0;
    const to = dateRangeTo ? new Date(dateRangeTo).setHours(23, 59, 59, 999) : Number.MAX_SAFE_INTEGER;
    return hookTransactions.filter(t => {
      const d = parseTransactionDateGlobal(t.date);
      if (!d) return true;
      const tms = d.getTime();
      return tms >= from && tms <= to;
    });
  }, [hookTransactions, dateRangeFrom, dateRangeTo]);

  const exportFullCsv = async () => {
    setExportCsvLoading(true);
    try {
      const header = ["Date", "Details", "Party", "Type", "RefNo", "Debit", "Credit", "Balance"];
      const rows = hookTransactions.map(t => [t.date, t.details ?? "", t.counterparty ?? "", t.type ?? "", t.ref_no ?? "", (t.debit ?? 0).toFixed(2), (t.credit ?? 0).toFixed(2), (t.balance ?? 0).toFixed(2)]);
      downloadCsv([header, ...rows], `${acctLabel}_transactions.csv`);
    } finally {
      setExportCsvLoading(false);
    }
  };

  const handleSaveCustomName = async (rawText, customName) => {
    const updated = { ...customLookup, [rawText]: customName };
    await onUpdateLookup(updated);
    toast.success("Custom name saved — will apply on future uploads");
    setUnparsedModal(false);
  };

  // Paginated date view
  const datePageSize = 50;
  const pagedTxns = filtered.slice(datePage * datePageSize, (datePage + 1) * datePageSize);
  const totalPages = Math.ceil(filtered.length / datePageSize);

  if (hookLoading && hookStatements.length === 0) {
    return (
      <div className="space-y-4 mt-4">
        <p className="text-sm text-muted-foreground">🏦 Bank Analyser › {account.icon} {account.label}</p>
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading transactions…</div>
      </div>
    );
  }

  if (hookError) {
    return (
      <div className="space-y-4 mt-4">
        <p className="text-sm text-muted-foreground">🏦 Bank Analyser › {account.icon} {account.label}</p>
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center text-destructive">
          Error: {hookError}
        </div>
      </div>
    );
  }

  const maskedAccount = (account as { accountNumber?: string }).accountNumber
    ? "••••" + (account as { accountNumber: string }).accountNumber.slice(-4)
    : "";

  return (
    <div className="space-y-4 mt-4">
      <div>
        <p className="text-sm text-muted-foreground">🏦 Bank Analyser › {account.icon} {account.label}</p>
        {maskedAccount && (
          <p className="text-xs text-muted-foreground mt-0.5">CSB Bank  ·  Acc No: {maskedAccount}</p>
        )}
      </div>

      {/* ── UPLOAD ZONE ── */}
      <Card className="rounded-2xl shadow-sm print:hidden">
        <CardContent className="p-4">
          {queue.length === 0 ? (
            <div
              ref={dropRef}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-muted/30 transition-all"
              style={{ borderColor: account.color + "80" }}
              title={`Upload CSB Bank statements for ${account.label}`}
            >
              <Upload className="h-8 w-8 mx-auto mb-2" style={{ color: account.color }} />
              <p className="text-foreground font-semibold text-sm">Drop up to 5 CSB Bank PDFs · or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">.pdf only</p>
              {(account as { accountNumber?: string }).accountNumber && (
                <p className="text-xs text-muted-foreground mt-1">CSB Bank · Acc: ••••{(account as { accountNumber: string }).accountNumber.slice(-4)} · Upload from 20/02/2026 onwards</p>
              )}
              <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFileInput} />
            </div>
          ) : (
            <QueuePanel
              queue={queue}
              setQueue={setQueue}
              account={account}
              onDone={() => { setQueue([]); }}
              processing={processing}
            />
          )}
        </CardContent>
      </Card>

      {/* ── STATEMENT HISTORY ── */}
      {statements.length > 0 && (
        <Card className="rounded-2xl shadow-sm print:hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Statements</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleValidate} disabled={validating}>
                  <FileCheck className="h-3.5 w-3.5 mr-1" />
                  {validating ? "Validating..." : "Validate Data"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1" />Upload
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">File</th>
                    <th className="px-3 py-2 text-left font-medium">Uploaded</th>
                    <th className="px-3 py-2 text-left font-medium">From</th>
                    <th className="px-3 py-2 text-left font-medium">To</th>
                    <th className="px-3 py-2 text-right font-medium">Txns</th>
                    <th className="px-3 py-2 text-right font-medium">Credits</th>
                    <th className="px-3 py-2 text-right font-medium">Debits</th>
                    <th className="px-3 py-2 text-center font-medium">PDF</th>
                    <th className="px-3 py-2 text-left font-medium">Validated</th>
                    <th className="px-3 py-2 text-center font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {statements.map(s => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono truncate max-w-[150px]">{s.fileName}</td>
                      <td className="px-3 py-2">{new Date(s.uploadedAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{s.periodStart || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{s.periodEnd || "—"}</td>
                      <td className="px-3 py-2 text-right">{s.transactionCount}</td>
                      <td className="px-3 py-2 text-right text-success">{fmt(s.totalCredits)}</td>
                      <td className="px-3 py-2 text-right text-destructive">{fmt(s.totalDebits)}</td>
                      <td className="px-3 py-2 text-center">
                        {s.pdfStored ? (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <span className="text-muted-foreground text-xs">🔓</span>
                            <span className="text-muted-foreground">📄 {(s.pdfFileSize / (1024 * 1024)).toFixed(1)}mb</span>
                            <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => handleViewPDF(s.id)} title="View PDF">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => handleDownloadPDF(s)} title="Download">
                              <Download className="h-3 w-3" />
                            </Button>
                            {(s.transactionCount ?? 0) > 0 ? (
                              <span className="text-xs text-green-600 inline-flex items-center gap-1" title="Parsed">
                                <span>✅</span> Parsed ({s.transactionCount} txns)
                              </span>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                disabled={isParsingPreview}
                                onClick={() => handleParsePdf(s.id)}
                                title="Parse PDF"
                              >
                                {isParsingPreview ? "Parsing…" : "Parse PDF"}
                              </Button>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.lastValidated ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-green-600" title="Validation passed">✅</span>
                            {new Date(s.lastValidated).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {(s.transactionCount ?? 0) > 0 && (statementTxnCounts.get(s.id) ?? 0) === 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => openReuploadPicker(s.id)}
                              disabled={repairingStatementId === s.id}
                              title="Re-upload this statement PDF to recover missing transactions"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              {repairingStatementId === s.id ? "Re-uploading…" : "Re-upload PDF"}
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-destructive" onClick={() => setDeleteConfirm(s.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parsed PDF preview (from Parse PDF button) */}
      {parsedPreview && (
        <Card className="rounded-2xl shadow-sm print:hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Parsed statement</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setParsedPreview(null)}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">Opening Balance</p>
                <p className="text-lg font-bold">₹{parsedPreview.data.openingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">Total Credits</p>
                <p className="text-lg font-bold text-green-600">₹{parsedPreview.data.totalCredits.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">Total Debits</p>
                <p className="text-lg font-bold text-red-600">₹{parsedPreview.data.totalDebits.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">Closing Balance</p>
                <p className="text-lg font-bold text-blue-600">₹{parsedPreview.data.closingBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg text-sm grid grid-cols-2 md:grid-cols-3 gap-2">
              <div><span className="text-muted-foreground">Holder:</span> {parsedPreview.data.accountHolder}</div>
              <div><span className="text-muted-foreground">Account:</span> {parsedPreview.data.accountNumber}</div>
              <div><span className="text-muted-foreground">Period:</span> {parsedPreview.data.periodFrom} – {parsedPreview.data.periodTo}</div>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="p-2 border-b bg-muted/50 text-sm font-medium">Transactions ({parsedPreview.data.transactions.length})</div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-muted-foreground">
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Details</th>
                      <th className="text-left p-2 font-medium">Category</th>
                      <th className="text-right p-2 font-medium">Debit</th>
                      <th className="text-right p-2 font-medium">Credit</th>
                      <th className="text-right p-2 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {parsedPreview.data.transactions.map((tx, idx) => (
                      <tr key={idx} className="hover:bg-muted/30">
                        <td className="p-2 whitespace-nowrap">{tx.date}</td>
                        <td className="p-2 max-w-[200px] truncate" title={tx.details}>{tx.details}</td>
                        <td className="p-2"><span className="bg-muted px-1.5 py-0.5 rounded text-xs">{tx.counterparty}</span></td>
                        <td className="p-2 text-right text-red-600">{tx.debit > 0 ? `₹${tx.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td>
                        <td className="p-2 text-right text-green-600">{tx.credit > 0 ? `₹${tx.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td>
                        <td className="p-2 text-right">₹{tx.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Statement?</DialogTitle></DialogHeader>
          <DialogDescription>This will permanently delete the statement and all its transactions.</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDeleteStmt(deleteConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Summary + Transactions (from useAccountTransactions: .in(statement_id) + .limit(2000)) ── */}
      <SummaryCards summary={summary} />
      {hookTransactions.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Date range:</span>
              <Input
                type="date"
                className="h-8 w-36 text-xs"
                value={dateRangeFrom}
                onChange={e => setDateRangeFrom(e.target.value)}
                placeholder="From"
                title="From date"
              />
              <Input
                type="date"
                className="h-8 w-36 text-xs"
                value={dateRangeTo}
                onChange={e => setDateRangeTo(e.target.value)}
                placeholder="To"
                title="To date"
              />
              {(dateRangeFrom || dateRangeTo) && (
                <>
                  <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-xs font-medium">Filtered</span>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateRangeFrom(""); setDateRangeTo(""); }}>
                    Clear
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportFullCsv} disabled={exportCsvLoading}>
                {exportCsvLoading ? "Exporting…" : `Export CSV (${hookTransactions.length} transactions)`}
              </Button>
              {sortedParties?.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportSummaryCsv} disabled={exportCsvLoading}>
                  Export CSV (summary)
                </Button>
              )}
            </div>
          </div>
          <TransactionTable
            transactions={transactionsToShow}
            defaultView="byDate"
            isDateFiltered={!!(dateRangeFrom || dateRangeTo)}
            totalUnfiltered={hookTransactions.length}
          />
        </>
      )}
      {hookTransactions.length === 0 && missingTxStatements.length > 0 && (
        <div className="text-center py-8 rounded-xl border border-dashed border-warning/50 bg-warning/5 space-y-3">
          <AlertTriangle className="h-6 w-6 mx-auto text-warning" />
          <p className="text-sm text-muted-foreground">
            Transactions are missing for existing statements. Re-upload the exact PDF for each file below to refill transaction rows.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {missingTxStatements.map((s) => (
              <Button
                key={s.id}
                variant="outline"
                size="sm"
                onClick={() => openReuploadPicker(s.id)}
                disabled={repairingStatementId === s.id}
              >
                <Upload className={cn("h-3.5 w-3.5 mr-1.5", repairingStatementId === s.id && "animate-pulse")} />
                {repairingStatementId === s.id ? "Re-uploading…" : `Re-upload ${s.fileName}`}
              </Button>
            ))}
          </div>
        </div>
      )}
      {hookTransactions.length === 0 && missingTxStatements.length === 0 && (
        <div className="text-center text-muted-foreground py-12 rounded-xl border border-dashed">
          No transactions yet. Upload a PDF above.
        </div>
      )}

      {/* ── SMART PANELS ── */}
          <div className="space-y-2 print:hidden">
            {unparsedTxns.length > 0 && (
              <Collapsible open={showUnparsed} onOpenChange={setShowUnparsed}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-8 text-xs">
                    <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-warning" />⚠️ {unparsedTxns.length} uncategorised</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showUnparsed && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="rounded-xl mt-1.5">
                    <CardContent className="p-3 max-h-48 overflow-y-auto">
                      {unparsedTxns.slice(0, 20).map(t => (
                        <div key={t.id} className="py-1 border-b border-border/50 last:border-0 text-xs flex items-center gap-2">
                          <span className="text-muted-foreground shrink-0">{t.date}</span>
                          <span className="font-mono truncate flex-1">{t.details.substring(0, 50)}</span>
                          {t.debit > 0 && <span className="text-destructive shrink-0">{fmt(t.debit)}</span>}
                          {t.credit > 0 && <span className="text-success shrink-0">{fmt(t.credit)}</span>}
                          <Button variant="ghost" size="sm" className="h-5 px-1 text-xs" onClick={() => setUnparsedModal(t)}>Name</Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {largeTxns.length > 0 && (
              <Collapsible open={showLargeTxns} onOpenChange={setShowLargeTxns}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-8 text-xs">
                    <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-secondary" />⭐ {largeTxns.length} large (&gt;₹10k)</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showLargeTxns && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="rounded-xl mt-1.5">
                    <CardContent className="p-3 max-h-48 overflow-y-auto divide-y divide-border/50">
                      {largeTxns.map(t => (
                        <div key={t.id} className="flex items-center justify-between py-1.5 text-xs">
                          <div>
                            <span className="text-muted-foreground">{t.date}</span>
                            <p className="font-medium">{t.counterparty}</p>
                          </div>
                          <div className="text-right">
                            {t.credit > 0 && <p className="text-success font-semibold">{fmt(t.credit)}</p>}
                            {t.debit > 0 && <p className="text-destructive font-semibold">{fmt(t.debit)}</p>}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Compare panel for 2+ statements */}
            {statements.length >= 2 && <ComparePanel statements={statements} />}
          </div>

      {/* EMPTY STATE */}
      {hookTransactions.length === 0 && statements.length === 0 && queue.length === 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-base font-semibold text-foreground mb-1">No Statements for {account.label}</h3>
            <p className="text-muted-foreground text-xs mb-3">Upload a CSB bank statement PDF to get started</p>
            <Button size="sm" onClick={() => fileInputRef.current?.click()} style={{ backgroundColor: account.color }}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />Upload Statement
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Unparsed naming modal */}
      <UnparsedModal txn={unparsedModal} onClose={() => setUnparsedModal(false)} onSave={handleSaveCustomName} />
    </div>
  );
}

/* ═══════════ QUEUE PANEL ═══════════ */
function QueuePanel({ queue, setQueue, account, onDone, processing }) {
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [shaking, setShaking] = useState(false);

  const activeIdx = queue.findIndex(q => q.status === "password" || q.status === "wrong_password");
  const allDone = queue.every(q => ["done", "error", "blocked", "skipped"].includes(q.status));

  const handleUnlock = () => {
    if (!pwd.trim() || activeIdx < 0) return;
    const item = queue[activeIdx];
    if (item.attempts >= 5) return;
    // For simplicity, store password on item and mark as unlocked
    setQueue(prev => prev.map((p, i) => i === activeIdx ? { ...p, password: pwd, status: "unlocked" } : p));
    setPwd("");
  };

  const handleSkip = () => {
    if (activeIdx < 0) return;
    setQueue(prev => prev.map((p, i) => i === activeIdx ? { ...p, status: "skipped", error: "Skipped" } : p));
  };

  const statusBadge = (s) => {
    const map = {
      pending: { label: "⏳ Pending", cls: "bg-muted text-muted-foreground" },
      processing: { label: "⚙️ Processing", cls: "bg-blue-100 text-blue-700" },
      password: { label: "🔒 Password", cls: "bg-amber-100 text-amber-700" },
      wrong_password: { label: "🔒 Wrong", cls: "bg-red-100 text-red-700" },
      unlocked: { label: "🔓 Unlocked", cls: "bg-green-100 text-green-700" },
      done: { label: "✅ Done", cls: "bg-green-100 text-green-700" },
      error: { label: "❌ Error", cls: "bg-red-100 text-red-700" },
      blocked: { label: "❌ Blocked", cls: "bg-red-100 text-red-700" },
      skipped: { label: "⏭️ Skipped", cls: "bg-muted text-muted-foreground" },
    };
    const m = map[s] || map.pending;
    return <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", m.cls)}>{m.label}</span>;
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {queue.map((q, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono truncate flex-1">{q.file.name}</span>
            {statusBadge(q.status)}
            {q.status === "processing" && <span className="text-xs text-muted-foreground">{q.progress}</span>}
            {q.status === "done" && <span className="text-xs text-success">✅ {q.saved} saved {q.skipped > 0 ? `${q.skipped} skipped` : ""}</span>}
            {(q.status === "error" || q.status === "blocked") && (
              <span className="text-xs text-destructive truncate max-w-[200px]">
                {typeof q.error === "string" ? q.error : (q.error != null ? toErrorMessage(q.error) : "Unknown error")}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Password input for active file */}
      {activeIdx >= 0 && (
        <div className={cn("bg-card border rounded-xl p-4", shaking && "animate-shake")}>
          <div className="text-center mb-3">
            <Lock className="h-6 w-6 text-secondary mx-auto mb-1" />
            <p className="font-semibold text-sm text-foreground">🔐 Password Required</p>
            <p className="text-xs text-muted-foreground">{queue[activeIdx].file.name}</p>
          </div>
          {queue[activeIdx].status === "wrong_password" && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-2 mb-2 text-center">
              <p className="text-xs text-destructive font-medium">❌ Wrong password (attempt {queue[activeIdx].attempts}/5)</p>
            </div>
          )}
          <div className="relative mb-2">
            <Input type={showPwd ? "text" : "password"} value={pwd} onChange={e => setPwd(e.target.value)}
              placeholder="Enter PDF password" autoFocus autoComplete="off"
              disabled={queue[activeIdx].attempts >= 5}
              className={cn("text-sm", queue[activeIdx].status === "wrong_password" && "border-destructive")}
              onKeyDown={e => e.key === "Enter" && handleUnlock()} />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Collapsible>
            <CollapsibleTrigger className="text-xs text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
              <Info className="h-3 w-3" /> Hint
            </CollapsibleTrigger>
            <CollapsibleContent className="text-xs text-muted-foreground bg-muted rounded-lg p-2 mb-2">
              CSB: Account No / DDMMYYYY DOB / Customer ID
            </CollapsibleContent>
          </Collapsible>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUnlock} disabled={!pwd.trim() || queue[activeIdx].attempts >= 5}
              className="flex-1 bg-primary hover:bg-primary/90 text-xs">🔓 Unlock</Button>
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs">
              <SkipForward className="h-3.5 w-3.5 mr-1" />Skip
            </Button>
          </div>
        </div>
      )}

      {/* Summary when all done */}
      {allDone && (
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <p className="text-sm font-medium text-foreground mb-1">
            {queue.filter(q => q.status === "done").reduce((s, q) => s + q.saved, 0)} transactions saved.
            {queue.filter(q => q.status === "done").reduce((s, q) => s + q.skipped, 0) > 0 &&
              ` ${queue.filter(q => q.status === "done").reduce((s, q) => s + q.skipped, 0)} duplicates blocked.`}
          </p>
          <Button variant="outline" size="sm" onClick={onDone} className="text-xs mt-1">
            <X className="h-3 w-3 mr-1" />Close & View Results
          </Button>
        </div>
      )}
    </div>
  );
}

/* ═══════════ COMPARE PANEL ═══════════ */
function ComparePanel({ statements }) {
  const [open, setOpen] = useState(false);
  if (statements.length < 2) return null;
  const s1 = statements[0];
  const s2 = statements[1];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between h-8 text-xs">
          <span className="flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Compare Statements</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="rounded-xl mt-1.5">
          <CardContent className="p-3">
            <table className="w-full text-xs">
              <thead><tr className="text-muted-foreground">
                <th className="text-left py-1">Metric</th>
                <th className="text-right py-1">{s1.period || s1.fileName}</th>
                <th className="text-right py-1">{s2.period || s2.fileName}</th>
                <th className="text-right py-1">Δ</th>
              </tr></thead>
              <tbody className="divide-y divide-border/50">
                <tr><td className="py-1">Credits</td><td className="text-right text-success">{fmt(s1.totalCredits)}</td><td className="text-right text-success">{fmt(s2.totalCredits)}</td><td className="text-right">{fmt(s1.totalCredits - s2.totalCredits)}</td></tr>
                <tr><td className="py-1">Debits</td><td className="text-right text-destructive">{fmt(s1.totalDebits)}</td><td className="text-right text-destructive">{fmt(s2.totalDebits)}</td><td className="text-right">{fmt(s1.totalDebits - s2.totalDebits)}</td></tr>
                <tr><td className="py-1">Transactions</td><td className="text-right">{s1.transactionCount}</td><td className="text-right">{s2.transactionCount}</td><td className="text-right">{s1.transactionCount - s2.transactionCount}</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ═══════════ UNPARSED MODAL ═══════════ */
function UnparsedModal({ txn, onClose, onSave }) {
  const [name, setName] = useState("");
  if (!txn) return null;
  return (
    <Dialog open={!!txn} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Name this party</DialogTitle></DialogHeader>
        <DialogDescription className="text-xs">
          Raw: <span className="font-mono">{txn.details?.substring(0, 80)}</span>
        </DialogDescription>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Enter party name" autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (name.trim()) onSave(txn.details?.substring(0, 30), name.trim()); setName(""); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════ REPORTS TAB ═══════════ */
function ReportsTab({ statements, allTransactions }) {
  const [accountFilter, setAccountFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const filtered = useMemo(() => {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const q = Math.floor(now.getMonth() / 3);
    const firstOfQuarter = new Date(now.getFullYear(), q * 3, 1);
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0, 0);

    return allTransactions.filter(t => {
      if (accountFilter !== "all") {
        const stmt = statements.find(s => s.id === t.statementId);
        if (stmt?.accountKey !== accountFilter) return false;
      }
      if (dateFilter !== "all") {
        const td = parseTransactionDateGlobal(t.date);
        if (!td) return true;
        const tDateOnly = new Date(td.getFullYear(), td.getMonth(), td.getDate());
        if (dateFilter === "week") {
          if (tDateOnly < mondayOfWeek || tDateOnly > todayEnd) return false;
        } else if (dateFilter === "month") {
          if (tDateOnly < firstOfMonth || tDateOnly > todayEnd) return false;
        } else if (dateFilter === "lastmonth") {
          if (tDateOnly < firstOfLastMonth || tDateOnly > lastOfLastMonth) return false;
        } else if (dateFilter === "quarter") {
          if (tDateOnly < firstOfQuarter || tDateOnly > todayEnd) return false;
        }
      }
      return true;
    });
  }, [allTransactions, statements, accountFilter, dateFilter]);

  const totalCredits = filtered.reduce((s, t) => s + t.credit, 0);
  const totalDebits = filtered.reduce((s, t) => s + t.debit, 0);

  // Per account
  const perAccount = ACCOUNTS.map(a => {
    const txns = filtered.filter(t => {
      const stmt = statements.find(s => s.id === t.statementId);
      return stmt?.accountKey === a.key;
    });
    return { ...a, credits: txns.reduce((s, t) => s + t.credit, 0), debits: txns.reduce((s, t) => s + t.debit, 0), count: txns.length };
  });

  // Monthly trend (last 6 months)
  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; credits: number; debits: number }> = {};
    filtered.forEach((t: any) => {
      const parts = t.date.split("-");
      if (parts.length !== 3) return;
      const key = `${parts[1]}/${parts[2]}`;
      if (!months[key]) months[key] = { month: key, credits: 0, debits: 0 };
      months[key].credits += t.credit;
      months[key].debits += t.debit;
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [filtered]);

  // Top parties
  const partyTotals = useMemo(() => {
    const map: Record<string, { name: string; credits: number; debits: number }> = {};
    filtered.forEach((t: any) => {
      if (!map[t.counterparty]) map[t.counterparty] = { name: t.counterparty, credits: 0, debits: 0 };
      map[t.counterparty].credits += t.credit;
      map[t.counterparty].debits += t.debit;
    });
    return Object.values(map);
  }, [filtered]);

  const topCredits = [...partyTotals].filter(p => p.credits > 0).sort((a, b) => b.credits - a.credits).slice(0, 10);
  const topDebits = [...partyTotals].filter(p => p.debits > 0).sort((a, b) => b.debits - a.debits).slice(0, 10);

  // Type breakdown
  const typeBreakdown = useMemo(() => {
    const map: Record<string, { name: string; count: number; amount: number }> = {};
    filtered.forEach((t: any) => {
      const label = typeLabels[t.type as keyof typeof typeLabels] || t.type;
      if (!map[label]) map[label] = { name: label, count: 0, amount: 0 };
      map[label].count++;
      map[label].amount += t.debit + t.credit;
    });
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const dateChips = [
    { key: "week", label: "This Week" }, { key: "month", label: "This Month" },
    { key: "lastmonth", label: "Last Month" }, { key: "quarter", label: "This Quarter" },
    { key: "all", label: "All Time" },
  ];

  if (statements.length === 0) {
    return (
      <div className="mt-4">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-10 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-base font-semibold text-foreground mb-1">No Data Yet</h3>
            <p className="text-muted-foreground text-xs">Upload statements in account tabs to see reports</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-muted-foreground">🏦 Bank Analyser › 📊 Reports</p>

      {/* Filters + Export */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-40 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {ACCOUNTS.map(a => <SelectItem key={a.key} value={a.key}>{a.icon} {a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {dateChips.map(c => (
          <button key={c.key} onClick={() => setDateFilter(c.key)}
            className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              dateFilter === c.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}>
            {c.label}
          </button>
        ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => {
            const header = ["Account", "Credits", "Debits", "Net", "Txns"];
            const rows = perAccount.map(a => [a.label, a.credits.toFixed(2), a.debits.toFixed(2), (a.credits - a.debits).toFixed(2), a.count]);
            rows.push(["Total", totalCredits.toFixed(2), totalDebits.toFixed(2), (totalCredits - totalDebits).toFixed(2), filtered.length]);
            const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "bank_reports_summary.csv";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Export CSV (Summary)
        </Button>
      </div>

      {/* R1 Summary */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50"><tr className="text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Credits</th>
                <th className="px-3 py-2 text-right font-medium">Debits</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
                <th className="px-3 py-2 text-right font-medium">Txns</th>
              </tr></thead>
              <tbody className="divide-y divide-border/50">
                {perAccount.map(a => (
                  <tr key={a.key}>
                    <td className="px-3 py-2">{a.icon} {a.label}</td>
                    <td className="px-3 py-2 text-right text-success">{fmt(a.credits)}</td>
                    <td className="px-3 py-2 text-right text-destructive">{fmt(a.debits)}</td>
                    <td className="px-3 py-2 text-right">{fmt(a.credits - a.debits)}</td>
                    <td className="px-3 py-2 text-right">{a.count}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-muted/30">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right text-success">{fmt(totalCredits)}</td>
                  <td className="px-3 py-2 text-right text-destructive">{fmt(totalDebits)}</td>
                  <td className="px-3 py-2 text-right">{fmt(totalCredits - totalDebits)}</td>
                  <td className="px-3 py-2 text-right">{filtered.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* R2 Monthly Trend */}
      {monthlyData.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={v => "₹" + (v / 1000).toFixed(0) + "k"} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="credits" fill="#16A34A" name="Credits" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="debits" fill="#DC2626" name="Debits" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* R3 Top Parties */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Credits</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border/50">
                {topCredits.map((p, i) => (
                  <tr key={p.name}><td className="px-3 py-1.5">{i + 1}. {p.name}</td><td className="px-3 py-1.5 text-right text-success font-medium">{fmt(p.credits)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Debits</CardTitle></CardHeader>
          <CardContent className="p-0">
            {topDebits.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">No debit transactions found.</p>
            ) : (
              <table className="w-full text-xs">
                <tbody className="divide-y divide-border/50">
                  {topDebits.map((p, i) => (
                    <tr key={p.name}><td className="px-3 py-1.5">{i + 1}. {p.name}</td><td className="px-3 py-1.5 text-right text-destructive font-medium">{fmt(p.debits)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* R4 Type Breakdown */}
      {typeBreakdown.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Type Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeBreakdown} dataKey="amount" nameKey="name" cx="50%" cy="50%"
                    outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {typeBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { name: string; count: number; amount: number };
                      return (
                        <div className="bg-card border rounded-lg shadow-lg p-3 text-xs">
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-muted-foreground">₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                          <p className="text-muted-foreground">{p.count} transaction{p.count !== 1 ? "s" : ""}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    formatter={(value, entry) => {
                      const p = typeBreakdown.find(x => x.name === value);
                      const total = typeBreakdown.reduce((s, x) => s + x.amount, 0);
                      const pct = p && total > 0 ? ((p.amount / total) * 100).toFixed(0) : "0";
                      return `${value} — ₹${p?.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 }) ?? "0"} (${pct}%)`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {typeBreakdown.map((p, i) => {
                const total = typeBreakdown.reduce((s, x) => s + x.amount, 0);
                const pct = total > 0 ? ((p.amount / total) * 100).toFixed(0) : "0";
                return (
                  <span key={p.name}>
                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {p.name}: ₹{p.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} ({pct}%) — {p.count} txn{p.count !== 1 ? "s" : ""}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* R5 Account Comparison */}
      {perAccount.filter(a => a.count > 0).length >= 2 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Account Comparison</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perAccount.filter(a => a.count > 0)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={v => "₹" + (v / 1000).toFixed(0) + "k"} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Legend />
                  <Bar dataKey="credits" fill="#16A34A" name="Credits" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="debits" fill="#DC2626" name="Debits" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
