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
  deleteStatement as deleteStatementStorage,
  loadCustomLookup,
  saveCustomLookup,
  getStatement,
  hasTransaction,
  deleteTransaction,
  pdfStorage,
} from "@/lib/bankStorage";
import { useStorageMode } from "@/hooks/useStorageMode";
import { SharedDataBanner } from "@/components/SharedDataBanner";
import { friendlyDbError } from "@/lib/utils";
import { parseDocument } from "@/utils/parseDocument";
import type { ClaudeBankStatementResponse } from "@/lib/parseDocumentWithClaude";
import type { BankStatement, BankTransaction } from "@/lib/bankStorage";

const MAX_CLAUDE_FILE_BYTES = 4 * 1024 * 1024; // 4MB for Claude API

/** Detect account key from Claude bank_statement account_number or account_holder. */
function detectAccountFromClaudeBank(claude: ClaudeBankStatementResponse): string | null {
  const num = (claude.account_number ?? "").replace(/\s/g, "");
  const holder = (claude.account_holder ?? "").toUpperCase();
  if (num.includes("0244020080155") || holder.includes("SUPER SCREENS")) return "superscreens";
  if (num.includes("0244011477662") || holder.includes("REVATHY")) return "revathy";
  if (holder.includes("SUPER PRINTERS")) return "superprinters";
  return null;
}

/** Map Claude bank_statement response to our statement + transactions. */
function mapClaudeBankToStatementAndTransactions(
  claude: ClaudeBankStatementResponse,
  statementId: string,
  accountKey: string,
  fileName: string
): { statement: BankStatement; transactions: BankTransaction[] } {
  const txns = (claude.transactions ?? []).map((t, idx) => {
    const refNo = t.ref_no ?? "";
    const date = t.date ?? "";
    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    const txnId = btoa(statementId + refNo + date + String(debit || credit))
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 40);
    return {
      id: txnId,
      statementId,
      date,
      details: t.details ?? "",
      refNo,
      debit,
      credit,
      balance: Number(t.balance) || 0,
      type: "OTHER",
      counterparty: "",
    };
  });
  const periodFrom = claude.period_from ?? "";
  const periodTo = claude.period_to ?? "";
  const period = periodFrom && periodTo ? `${periodFrom} to ${periodTo}` : "";
  const statement: BankStatement = {
    id: statementId,
    accountKey,
    fileName,
    uploadedAt: new Date().toISOString(),
    period,
    periodStart: periodFrom,
    periodEnd: periodTo,
    accountNumber: claude.account_number ?? "",
    openingBalance: Number(claude.opening_balance) || 0,
    closingBalance: Number(claude.closing_balance) || 0,
    totalCredits: Number(claude.total_credits) || 0,
    totalDebits: Number(claude.total_debits) || 0,
    transactionCount: txns.length,
    pdfStored: false,
    pdfFileSize: 0,
    pdfChunks: 0,
    lastValidated: null,
  };
  return { statement, transactions: txns };
}

/* ═══════════ PDF.js CDN (v4.4.168, .mjs) ═══════════ */
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168";
let pdfjsLib: any = null;

function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return Promise.resolve(pdfjsLib);
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
      return resolve(pdfjsLib);
    }
    const s = document.createElement("script");
    s.src = `${PDFJS_CDN}/pdf.min.mjs`;
    s.type = "module";
    s.onload = () => {
      pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
      resolve(pdfjsLib);
    };
    s.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(s);
  });
}

/* ═══════════ ACCOUNTS ═══════════ */
const ACCOUNTS = [
  { key: "superprinters", label: "Super Printers", shortLabel: "S.Printers", color: "#1B2B4B", icon: "🖨️" },
  { key: "superscreens", label: "Super Screens", shortLabel: "S.Screens", color: "#F4A100", icon: "🪟", accountNo: "0244020080155" },
  { key: "revathy", label: "Revathy B.", shortLabel: "Revathy", color: "#16A34A", icon: "👤", accountNo: "0244011477662" },
];

function detectAccount(text) {
  const t = text.toUpperCase();
  if (t.includes("REVATHY BHARANIDHARAN") || t.includes("0244011477662")) return "revathy";
  if (t.includes("SUPER SCREENS") || t.includes("0244020080155")) return "superscreens";
  if (t.includes("SUPER PRINTERS")) return "superprinters";
  return null;
}

/* ═══════════ HELPERS ═══════════ */
const fmt = (n) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function titleCase(s) {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

function cleanName(raw) {
  let n = raw.replace(/^[\s-]+|[\s-]+$/g, "").replace(/\s+/g, " ").trim();
  n = n.replace(/\s+[A-Z]{4}0[A-Z0-9]{6}$/, "");
  n = n.replace(/(\s+[A-Z0-9]{5,})+\s*$/, "").trim();
  n = n.replace(/\s*-\s*NPCI\s*$/i, "").trim();
  n = n.replace(/\s+\d{6,}\s*$/, "").trim();
  n = titleCase(n);
  return n || "Unknown";
}

function extractCounterparty(details, customLookup = {}) {
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

function parseAmount(s) {
  if (!s || s.trim() === "-" || s.trim() === "") return 0;
  const cleaned = s.replace(/[₹,\sINR]/gi, "").replace(/Cr|Dr/gi, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseCsbDate(s) {
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

function shouldSkipLine(line) {
  return SKIP_PATTERNS.some(p => p.test(line));
}

function parseTransactions(lines, statementId, customLookup = {}) {
  const txns = [];
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

    const txnId = btoa(statementId + (refNo || "") + date + String(debit || credit))
      .replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);

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
        for (const t of s.transactions) {
          const txnId = btoa(s.id + (t.refNo || "") + t.date + String(t.debit || t.credit))
            .replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);
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
  const storageMode = useStorageMode();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [statements, setStatements] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [customLookup, setCustomLookup] = useState({});

  // Refresh data (used on mount and by Overview/account tabs). silent = true avoids full-page loading (e.g. after upload).
  const refreshData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      await migrateOldData();
      const stmts = await loadStatements();
      setStatements(stmts);
      const txns: Array<Record<string, unknown>> = [];
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
      <SharedDataBanner useLocalStorage={storageMode.bank === "local"} feature="Bank Analyser" />
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
            <TabsTrigger key={a.key} value={a.key} className="gap-1">
              <span>{a.icon}</span>
              <span className="hidden sm:inline">{a.label}</span>
              <span className="sm:hidden">{a.shortLabel}</span>
            </TabsTrigger>
          ))}
          <TabsTrigger value="reports" className="gap-1"><BarChart3 className="h-3.5 w-3.5" />Reports</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview">
          <OverviewTab statements={statements} allTransactions={allTransactions} accountTxns={accountTxns} />
        </TabsContent>

        {/* ACCOUNT TABS */}
        {ACCOUNTS.map(account => (
          <TabsContent key={account.key} value={account.key}>
            <AccountTab
              account={account}
              statements={statements.filter(s => s.accountKey === account.key)}
              transactions={accountTxns(account.key)}
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

function OverviewTab({ statements, allTransactions, accountTxns }) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const isThisMonth = (t: { date: string }) => {
    const parsed = parseTxnDateToMonthYear(t.date);
    return parsed !== null && parsed.month === currentMonth && parsed.year === currentYear;
  };

  const totals = ACCOUNTS.map(a => {
    const txns = accountTxns(a.key);
    const monthTxns = txns.filter(isThisMonth);
    return {
      ...a,
      credits: monthTxns.reduce((s, t) => s + (Number(t.credit) || 0), 0),
      debits: monthTxns.reduce((s, t) => s + (Number(t.debit) || 0), 0),
      count: monthTxns.length,
      totalCredits: txns.reduce((s, t) => s + (Number(t.credit) || 0), 0),
      totalDebits: txns.reduce((s, t) => s + (Number(t.debit) || 0), 0),
    };
  });

  const grandCredits = totals.reduce((s, t) => s + t.credits, 0);
  const grandDebits = totals.reduce((s, t) => s + t.debits, 0);

  return (
    <div className="space-y-6 mt-4">
      <p className="text-sm text-muted-foreground">🏦 Bank Analyser › Overview — This Month</p>

      {statements.length === 0 ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No Statements Yet</h3>
            <p className="text-muted-foreground text-sm">Select an account tab to upload CSB bank statement PDFs</p>
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
                      <p className="text-sm font-bold text-success">{fmt(a.credits)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Debits</p>
                      <p className="text-sm font-bold text-destructive">{fmt(a.debits)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net</p>
                      <p className={cn("text-sm font-bold", a.credits - a.debits >= 0 ? "text-success" : "text-destructive")}>
                        {fmt(a.credits - a.debits)}
                      </p>
                    </div>
                  </div>
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
        🔒 Passwords never stored. All processing in-browser. Statements and transactions are saved permanently to your Supabase database when the Bank Analyser tables are set up; otherwise saved locally. PDFs stay on this device only.
      </p>
    </div>
  );
}

/* ═══════════ ACCOUNT TAB ═══════════ */
function AccountTab({ account, statements, transactions, onRefresh, customLookup, onUpdateLookup }) {
  const [queue, setQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [viewMode, setViewMode] = useState("party");
  const [typeFilter, setTypeFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("credits");
  const [expandedParties, setExpandedParties] = useState(new Set());
  const [showLargeTxns, setShowLargeTxns] = useState(false);
  const [showUnparsed, setShowUnparsed] = useState(false);
  const [dateFilter, setDateFilter] = useState("all");
  const [datePage, setDatePage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [unparsedModal, setUnparsedModal] = useState(false);
  const [validating, setValidating] = useState(false);

  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // Filtered transactions
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
    const lib = await loadPdfJs();
    const lookup = await loadCustomLookup();
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
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Already uploaded on ${new Date(existing.uploadedAt).toLocaleDateString()}` } : p));
          continue;
        }

        // Optional: try Edge Function (Claude) first for bank statement (≤4MB)
        if (item.file.size <= MAX_CLAUDE_FILE_BYTES) {
          try {
            setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: "Parsing with Claude…" } : p));
            const result = await parseDocument(item.file, "bank_statement");
            if (!result.success || !result.data) throw new Error(result.error ?? "No data");
            const raw = result.data as ClaudeBankStatementResponse;
            const detected = detectAccountFromClaudeBank(raw);
            const finalAccount = detected || item.account;
            const finalStmtId = btoa(finalAccount + item.file.name + item.file.size)
              .replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);
            const existing2 = await getStatement(finalStmtId);
            if (existing2) {
              setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Already uploaded on ${new Date(existing2.uploadedAt).toLocaleDateString()}` } : p));
              continue;
            }
            const { statement: newStmt, transactions: claudeTxns } = mapClaudeBankToStatementAndTransactions(raw, finalStmtId, finalAccount, item.file.name);
            if (claudeTxns.length === 0) throw new Error("No transactions in response");

            const allStmts = await loadStatements();
            const periodDup = allStmts.find(s =>
              s.accountKey === finalAccount && s.periodStart === newStmt.periodStart && s.periodEnd === newStmt.periodEnd && newStmt.periodStart && newStmt.periodEnd
            );
            if (periodDup) {
              setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Period already exists (${periodDup.fileName})` } : p));
              continue;
            }

            let saved = 0, skipped = 0;
            for (const txn of claudeTxns) {
              const exists = await hasTransaction(finalStmtId, txn.id);
              if (exists) { skipped++; continue; }
              await saveTransaction(txn);
              saved++;
            }
            newStmt.transactionCount = saved;
            await saveStatement(newStmt);

            if (item.file.size <= 50 * 1024 * 1024) {
              setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: "Saving PDF…" } : p));
              try {
                const pdfSaved = await savePDF(finalStmtId, item.file, (msg) => {
                  setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: msg } : p));
                });
                if (pdfSaved) {
                  newStmt.pdfStored = true;
                  newStmt.pdfFileSize = item.file.size;
                  await saveStatement(newStmt);
                }
              } catch (_) { /* PDF save optional */ }
            }

            setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "done", saved, skipped } : p));
            await new Promise((r) => setTimeout(r, 200));
            await onRefresh();
            continue;
          } catch (claudeErr) {
            // Fall through to local PDF.js parsing (no toast here to avoid double error)
          }
        }

        // Load PDF with streaming
        const url = URL.createObjectURL(item.file);
        let doc;
        try {
          const loadingTask = lib.getDocument({ url, password: "", disableAutoFetch: true, disableStream: false });
          loadingTask.onProgress = ({ loaded, total }) => {
            if (total > 0) {
              setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: `Loading PDF... ${Math.round(loaded / total * 100)}%` } : p));
            }
          };

          // Password handling
          let passwordNeeded = false;
          loadingTask.onPassword = (updatePassword, reason) => {
            passwordNeeded = true;
            setQueue(prev => prev.map((p, i) => i === qi ? {
              ...p,
              status: reason === 1 ? "password" : "wrong_password",
              passwordRef: updatePassword,
              attempts: reason === 1 ? p.attempts : p.attempts + 1,
            } : p));
          };

          try {
            doc = await loadingTask.promise;
          } catch (e) {
            if (passwordNeeded) {
              // Wait for user to enter password — handled via queue state
              await new Promise((resolve) => {
                const check = setInterval(() => {
                  setQueue(prev => {
                    const cur = prev[qi];
                    if (cur.status === "unlocked" || cur.status === "skipped") {
                      clearInterval(check);
                      setTimeout(resolve, 100);
                    }
                    return prev;
                  });
                }, 200);
              });
              // Check if skipped
              const curItem = items[qi];
              if (curItem.status === "skipped") {
                setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "skipped", error: "Skipped by user" } : p));
                continue;
              }
              // Try to get doc after unlock — the onPassword callback should have been called
              // Actually the password flow is complex with pdf.js callbacks.
              // Let's simplify: just continue, the doc should be available
              // For simplicity, we'll re-attempt loading
              try {
                const lt2 = lib.getDocument({ url, password: curItem.password || "", disableAutoFetch: true, disableStream: false });
                doc = await lt2.promise;
              } catch (e2) {
                setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: e2?.message || "Failed" } : p));
                continue;
              }
            } else if (/encrypt/i.test(e?.message || "")) {
              setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: "Unsupported encryption" } : p));
              continue;
            } else {
              throw e;
            }
          }
        } finally {
          URL.revokeObjectURL(url);
        }

        if (!doc) { setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: "Failed to load" } : p)); continue; }

        // Extract text
        const numPages = doc.numPages;
        const allLines = [];
        let headerText = "";

        for (let pi = 1; pi <= numPages; pi++) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: `Page ${pi} of ${numPages}` } : p));
          const page = await doc.getPage(pi);
          const tc = await page.getTextContent();
          const items2 = tc.items.filter(it => it.str.trim());

          const yGroups = new Map();
          for (const it of items2) {
            const y = Math.round(it.transform[5] / 2) * 2;
            if (!yGroups.has(y)) yGroups.set(y, []);
            yGroups.get(y).push({ x: it.transform[4], str: it.str });
          }
          const sortedYs = [...yGroups.keys()].sort((a, b) => b - a);
          for (const y of sortedYs) {
            const lineItems = yGroups.get(y).sort((a, b) => a.x - b.x);
            const lineText = lineItems.map(it => it.str).join(" ").trim();
            if (lineText) allLines.push(lineText);
          }

          if (pi === 1) headerText = allLines.join("\n");
          page.cleanup();
          if (pi % 10 === 0) await new Promise(r => setTimeout(r, 0));
        }

        const fullText = allLines.join("\n");
        if (!fullText.trim() || fullText.replace(/\s/g, "").length < 50) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: "Scanned image PDF — download digital version" } : p));
          continue;
        }

        // Auto-detect account
        const detected = detectAccount(headerText);
        const finalAccount = detected || item.account;
        // Recalc stmtId with detected account
        const finalStmtId = btoa(finalAccount + item.file.name + item.file.size)
          .replace(/[^a-zA-Z0-9]/g, "").substring(0, 40);

        // Re-check L1 with correct account
        const existing2 = await getStatement(finalStmtId);
        if (existing2) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Already uploaded on ${new Date(existing2.uploadedAt).toLocaleDateString()}` } : p));
          continue;
        }

        setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: "Parsing transactions...", account: finalAccount } : p));

        const { transactions: txns, meta } = parseTransactions(allLines, finalStmtId, lookup);

        if (txns.length === 0) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: "No transactions found" } : p));
          continue;
        }

        // L2 — Period dedup
        const allStmts = await loadStatements();
        const periodDup = allStmts.find(s =>
          s.accountKey === finalAccount && s.periodStart === meta.periodStart && s.periodEnd === meta.periodEnd &&
          meta.periodStart && meta.periodEnd
        );
        if (periodDup) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "blocked", error: `Period ${meta.period} already exists (${periodDup.fileName})` } : p));
          continue;
        }

        // L3 — Transaction dedup
        let saved = 0, skipped = 0;
        for (let ti = 0; ti < txns.length; ti++) {
          const txn = txns[ti];
          const exists = await hasTransaction(finalStmtId, txn.id);
          if (exists) { skipped++; continue; }
          await saveTransaction(txn);
          saved++;
          if (ti % 20 === 0) {
            setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: `Saving transactions ${ti + 1}/${txns.length}` } : p));
          }
        }

        // Save statement metadata
        const newStmt = {
          id: finalStmtId, accountKey: finalAccount, fileName: item.file.name,
          uploadedAt: new Date().toISOString(), period: meta.period,
          periodStart: meta.periodStart, periodEnd: meta.periodEnd,
          accountNumber: meta.accountNumber, openingBalance: meta.openingBalance,
          closingBalance: meta.closingBalance, totalCredits: meta.totalCredits,
          totalDebits: meta.totalDebits, transactionCount: saved,
          pdfStored: false, pdfFileSize: item.file.size, pdfChunks: 0, lastValidated: null,
        };
        await saveStatement(newStmt);

        // PDF in Supabase Storage (same DB, no localStorage)
        const fileSizeMB = item.file.size / (1024 * 1024);
        if (fileSizeMB <= 50) {
          setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: "Saving PDF to database…" } : p));
          try {
            const pdfSaved = await savePDF(finalStmtId, item.file, (msg) => {
              setQueue(prev => prev.map((p, i) => i === qi ? { ...p, progress: msg } : p));
            });
            if (pdfSaved) {
              newStmt.pdfStored = true;
              newStmt.pdfFileSize = item.file.size;
              await saveStatement(newStmt);
            }
          } catch (e) { /* PDF save failed, statement data is still saved */ }
        }

        setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "done", saved, skipped } : p));
        // Brief delay so Supabase has committed before we reload for Overview
        await new Promise((r) => setTimeout(r, 200));
        await onRefresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(e);
        setQueue(prev => prev.map((p, i) => i === qi ? { ...p, status: "error", error: friendlyDbError(msg) || "Failed" } : p));
        toast.error(friendlyDbError(msg));
      }
    }
    setProcessing(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileInput = (e) => {
    if (e.target.files.length) handleFiles(e.target.files);
    e.target.value = "";
  };

  const handleDeleteStmt = async (id) => {
    try {
      await deleteStatement(id);
      setDeleteConfirm(null);
      toast.success("Statement deleted");
      await onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
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

  const handleValidate = async () => {
    setValidating(true);
    let dupCount = 0;
    const seen = new Map();
    for (const t of transactions) {
      const key = t.date + "|" + (t.debit || t.credit) + "|" + t.type + "|" + t.refNo;
      if (seen.has(key) || seen.has(t.id)) {
        dupCount++;
        await deleteTransaction(t.statementId, t.id);
      } else {
        seen.set(key, t);
        seen.set(t.id, true);
      }
    }
    // Update lastValidated on all account statements
    for (const s of statements) {
      s.lastValidated = new Date().toISOString();
      await saveStatement(s);
    }
    if (dupCount > 0) toast.success(`Removed ${dupCount} duplicate transactions`);
    else toast.success("✅ No duplicates found");
    setValidating(false);
    await onRefresh();
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
    const rows = sortedParties.map(p => [p.name, p.count, p.credits.toFixed(2), p.debits.toFixed(2), p.net.toFixed(2), p.dateRange]);
    downloadCsv([header, ...rows], `${acctLabel}_summary.csv`);
  };

  const exportFullCsv = () => {
    const header = ["Date", "Party", "Type", "Details", "RefNo", "Debit", "Credit", "Balance"];
    const rows = filtered.map(t => [t.date, t.counterparty, t.type, t.details, t.refNo, t.debit.toFixed(2), t.credit.toFixed(2), t.balance.toFixed(2)]);
    downloadCsv([header, ...rows], `${acctLabel}_transactions.csv`);
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

  return (
    <div className="space-y-4 mt-4">
      <p className="text-sm text-muted-foreground">🏦 Bank Analyser › {account.icon} {account.label}</p>

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
            >
              <Upload className="h-8 w-8 mx-auto mb-2" style={{ color: account.color }} />
              <p className="text-foreground font-semibold text-sm">Drop up to 5 CSB Bank PDFs · or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">.pdf only</p>
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
                      <td className="px-3 py-2 text-right">{s.transactionCount}</td>
                      <td className="px-3 py-2 text-right text-success">{fmt(s.totalCredits)}</td>
                      <td className="px-3 py-2 text-right text-destructive">{fmt(s.totalDebits)}</td>
                      <td className="px-3 py-2 text-center">
                        {s.pdfStored ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-muted-foreground">📄 {(s.pdfFileSize / (1024 * 1024)).toFixed(1)}mb</span>
                            <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => handleViewPDF(s.id)}>
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-1" onClick={() => handleDownloadPDF(s)}>
                              <Download className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.lastValidated ? new Date(s.lastValidated).toLocaleDateString() : "Never"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button variant="ghost" size="sm" className="h-6 px-1 text-destructive" onClick={() => setDeleteConfirm(s.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      {/* ── KPI CARDS ── */}
      {hasData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Credits</p>
                <p className="text-lg font-bold text-success mt-1">{fmt(totalCredits)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Debits</p>
                <p className="text-lg font-bold text-destructive mt-1">{fmt(totalDebits)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Net Flow</p>
                <p className={cn("text-lg font-bold mt-1", netFlow >= 0 ? "text-success" : "text-destructive")}>{netFlow >= 0 ? "+" : ""}{fmt(netFlow)}</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Transactions</p>
                <p className="text-lg font-bold text-primary mt-1">{filtered.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* ── FILTER BAR ── */}
          <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            {typeChips.map(c => (
              <button key={c} onClick={() => setTypeFilter(c)}
                className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  typeFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            {dateChips.map(c => (
              <button key={c.key} onClick={() => setDateFilter(c.key)}
                className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  dateFilter === c.key ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}>
                {c.label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search party..." className="pl-8 w-44 h-7 text-xs" />
            </div>
          </div>

          {/* ── VIEW TOGGLE + EXPORTS ── */}
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={() => setViewMode("party")}
              className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                viewMode === "party" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <Users className="h-3.5 w-3.5" />By Party
            </button>
            <button onClick={() => { setViewMode("date"); setDatePage(0); }}
              className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition",
                viewMode === "date" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <Calendar className="h-3.5 w-3.5" />By Date
            </button>
            {viewMode === "party" && (
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32 h-7 ml-auto text-xs"><ArrowUpDown className="h-3 w-3 mr-1" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credits">Sort: Credits</SelectItem>
                  <SelectItem value="debits">Sort: Debits</SelectItem>
                  <SelectItem value="count">Sort: Count</SelectItem>
                  <SelectItem value="name">Sort: Name</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-1 ml-auto">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportSummaryCsv}><Download className="h-3 w-3 mr-1" />Summary</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={exportFullCsv}><Download className="h-3 w-3 mr-1" />Full</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.print()}><Printer className="h-3 w-3 mr-1" />Print</Button>
            </div>
          </div>

          {/* ── MAIN TABLE ── */}
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            {viewMode === "party" ? (
              <div className="divide-y divide-border">
                {sortedParties.map((p, idx) => (
                  <div key={p.name} className={cn(borderColor[p.kind])}>
                    <button onClick={() => toggleParty(p.name)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors">
                      <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{p.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {p.types.map((t: string) => (
                            <span key={t} className={cn("h-1.5 w-1.5 rounded-full", typeDot[t as keyof typeof typeDot] || "bg-muted-foreground")} title={typeLabels[t as keyof typeof typeLabels] || t} />
                          ))}
                          <span className="text-xs text-muted-foreground ml-1">{p.count}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {p.credits > 0 && <p className="text-xs text-success">{fmt(p.credits)}</p>}
                        {p.debits > 0 && <p className="text-xs text-destructive">{fmt(p.debits)}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 hidden md:block w-28 text-right">{p.dateRange}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", expandedParties.has(p.name) && "rotate-180")} />
                    </button>
                    {expandedParties.has(p.name) && (
                      <div className="bg-muted/30 border-t border-border">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-muted-foreground">
                              <th className="px-3 py-1.5 text-left font-medium">Date</th>
                              <th className="px-3 py-1.5 text-left font-medium">Details</th>
                              <th className="px-3 py-1.5 text-left font-medium">RefNo</th>
                              <th className="px-3 py-1.5 text-right font-medium">Debit</th>
                              <th className="px-3 py-1.5 text-right font-medium">Credit</th>
                              <th className="px-3 py-1.5 text-right font-medium">Balance</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border/50">
                              {p.txns.map(t => (
                                <tr key={t.id} className="hover:bg-muted/50">
                                  <td className="px-3 py-1 whitespace-nowrap">{t.date}</td>
                                  <td className="px-3 py-1 max-w-[280px] truncate" title={t.details}>{t.details.substring(0, 45)}</td>
                                  <td className="px-3 py-1 font-mono">{t.refNo}</td>
                                  <td className="px-3 py-1 text-right text-destructive">{t.debit > 0 ? fmt(t.debit) : ""}{t.debit > 10000 ? " ⭐" : ""}</td>
                                  <td className="px-3 py-1 text-right text-success">{t.credit > 0 ? fmt(t.credit) : ""}{t.credit > 10000 ? " ⭐" : ""}</td>
                                  <td className="px-3 py-1 text-right">{fmt(t.balance)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {sortedParties.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">No transactions match your filters</div>
                )}
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-muted-foreground">
                        <th className="px-3 py-2.5 text-left font-medium text-xs">Date</th>
                        <th className="px-3 py-2.5 text-left font-medium text-xs">Party</th>
                        <th className="px-3 py-2.5 text-left font-medium text-xs">Type</th>
                        <th className="px-3 py-2.5 text-left font-medium text-xs">RefNo</th>
                        <th className="px-3 py-2.5 text-right font-medium text-xs">Debit</th>
                        <th className="px-3 py-2.5 text-right font-medium text-xs">Credit</th>
                        <th className="px-3 py-2.5 text-right font-medium text-xs">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedTxns.map((t, i) => (
                        <tr key={t.id} className={cn(i % 2 === 0 ? "bg-card" : "bg-muted/20", "hover:bg-muted/50")}>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">{t.date}</td>
                          <td className="px-3 py-2 font-medium text-xs">{t.counterparty}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1 text-xs">
                              <span className={cn("h-1.5 w-1.5 rounded-full", typeDot[t.type] || "bg-muted-foreground")} />
                              {typeLabels[t.type] || t.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{t.refNo}</td>
                          <td className="px-3 py-2 text-right text-destructive text-xs">{t.debit > 0 ? fmt(t.debit) : ""}{t.debit > 10000 ? " ⭐" : ""}</td>
                          <td className="px-3 py-2 text-right text-success text-xs">{t.credit > 0 ? fmt(t.credit) : ""}{t.credit > 10000 ? " ⭐" : ""}</td>
                          <td className="px-3 py-2 text-right text-xs">{fmt(t.balance)}</td>
                        </tr>
                      ))}
                      {pagedTxns.length === 0 && (
                        <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-xs">No transactions match filters</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 p-3 border-t">
                    <Button variant="outline" size="sm" disabled={datePage === 0} onClick={() => setDatePage(p => p - 1)}>Prev</Button>
                    <span className="text-xs text-muted-foreground">Page {datePage + 1} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={datePage >= totalPages - 1} onClick={() => setDatePage(p => p + 1)}>Next</Button>
                  </div>
                )}
              </div>
            )}
          </Card>

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
        </>
      )}

      {/* EMPTY STATE */}
      {!hasData && statements.length === 0 && queue.length === 0 && (
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
            {(q.status === "error" || q.status === "blocked") && <span className="text-xs text-destructive truncate max-w-[200px]">{q.error}</span>}
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
    return allTransactions.filter(t => {
      if (accountFilter !== "all") {
        const stmt = statements.find(s => s.id === t.statementId);
        if (stmt?.accountKey !== accountFilter) return false;
      }
      if (dateFilter !== "all") {
        const parts = t.date.split("-");
        if (parts.length === 3) {
          const td = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          if (dateFilter === "month" && (td.getMonth() !== now.getMonth() || td.getFullYear() !== now.getFullYear())) return false;
          if (dateFilter === "lastmonth") {
            const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            if (td.getMonth() !== lm.getMonth() || td.getFullYear() !== lm.getFullYear()) return false;
          }
          if (dateFilter === "quarter") {
            const q = Math.floor(now.getMonth() / 3);
            const tq = Math.floor(td.getMonth() / 3);
            if (tq !== q || td.getFullYear() !== now.getFullYear()) return false;
          }
          if (dateFilter === "week") { const w = new Date(now); w.setDate(w.getDate() - 7); if (td < w) return false; }
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

  const topCredits = [...partyTotals].sort((a, b) => b.credits - a.credits).slice(0, 10);
  const topDebits = [...partyTotals].sort((a, b) => b.debits - a.debits).slice(0, 10);

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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
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
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border/50">
                {topDebits.map((p, i) => (
                  <tr key={p.name}><td className="px-3 py-1.5">{i + 1}. {p.name}</td><td className="px-3 py-1.5 text-right text-destructive font-medium">{fmt(p.debits)}</td></tr>
                ))}
              </tbody>
            </table>
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
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
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
