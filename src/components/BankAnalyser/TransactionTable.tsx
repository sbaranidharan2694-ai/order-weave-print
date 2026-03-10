import { useState, useEffect, useMemo } from "react";
import type { Transaction } from "@/hooks/useAccountTransactions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { extractCounterparty, classifyTransaction } from "@/utils/extractCounterparty";

/** Known parties for auto-categorization */
const KNOWN_PARTIES: Record<string, { name: string; type: string; category: string }> = {
  FUJITEC: { name: "Fujitec India Pvt Ltd", type: "customer", category: "Corporate" },
  WIPRO: { name: "Wipro", type: "customer", category: "Corporate" },
  HFL: { name: "HFL Healthcare", type: "customer", category: "Corporate" },
  "SEA HYDRO": { name: "Sea Hydrosystems India", type: "customer", category: "Corporate" },
  KYOWA: { name: "Kyowa", type: "customer", category: "Corporate" },
  TTK: { name: "TTK", type: "customer", category: "Corporate" },
  CGRD: { name: "CGRD Chemicals", type: "customer", category: "Corporate" },
  PRECISION: { name: "Precision", type: "customer", category: "Corporate" },
  AMPTON: { name: "Ampton", type: "customer", category: "Corporate" },
  GMT: { name: "GMT", type: "customer", category: "Corporate" },
  CONTEMPORARY: { name: "Contemporary", type: "customer", category: "Corporate" },
  GUINDY: { name: "Guindy", type: "customer", category: "Corporate" },
  SHREEMARU: { name: "Shree Maruthi Printers", type: "vendor", category: "Printing Supplier" },
  "KUMAR MESS": { name: "Kumar Mess", type: "vendor", category: "Food & Canteen" },
  HINDUSTAN: { name: "Hindustan", type: "vendor", category: "Supplier" },
  "PRINTERS C": { name: "Printers Club", type: "vendor", category: "Printing Supplier" },
  "RATHNA PRI": { name: "Rathna Printers", type: "vendor", category: "Printing Supplier" },
  "SWEETS CH": { name: "Sweets Chennai", type: "vendor", category: "Food" },
  SELF: { name: "Self / Cash Withdrawal", type: "owner", category: "Cash Withdrawal" },
  GOOGLEINDIAD: { name: "Google India", type: "vendor", category: "Services" },
  GOOGLE: { name: "Google Pay", type: "vendor", category: "Digital Payment" },
  SWIGGY: { name: "Swiggy", type: "vendor", category: "Food" },
  ZOMATO: { name: "Zomato", type: "vendor", category: "Food" },
};

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

/** Party name: from DB counterparty or extracted from details */
function getPartyName(tx: Transaction): string {
  if (tx.counterparty?.trim()) return titleCase(tx.counterparty.trim().slice(0, 25));
  return titleCase(extractCounterparty(tx.details ?? "").slice(0, 25)) || "Unknown";
}

function getTransactionType(details: string | null): { label: string; color: string } {
  if (!details) return { label: "Other", color: "bg-muted text-muted-foreground" };
  const d = details.toUpperCase();
  
  if (d.includes("UPI/CR")) return { label: "UPI", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" };
  if (d.includes("UPI/DR")) return { label: "UPI", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" };
  if (d.includes("NEFT-G") || (d.includes("NEFT") && (d.includes("CR") || d.includes("CREDIT")))) return { label: "NEFT", color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" };
  if (d.includes("NEFT")) return { label: "NEFT", color: "bg-purple-500/15 text-purple-700 dark:text-purple-400" };
  if (d.includes("IMPS")) return { label: "IMPS", color: "bg-teal-500/15 text-teal-700 dark:text-teal-400" };
  if (d.includes("CHQ") || d.includes("CLEARING")) return { label: "Cheque", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" };
  if (d.includes("ATW") || d.includes("ATM")) return { label: "ATM", color: "bg-gray-500/15 text-gray-700 dark:text-gray-400" };
  if (d.includes("B/F") || d.includes("BROUGHT FORWARD")) return { label: "B/F", color: "bg-gray-500/15 text-gray-600" };
  
  return { label: "Other", color: "bg-muted text-muted-foreground" };
}

function matchKnownParty(partyName: string): { name: string; type: string; category: string } | null {
  const upper = partyName.toUpperCase();
  for (const [key, value] of Object.entries(KNOWN_PARTIES)) {
    if (upper.includes(key)) return value;
  }
  return null;
}

const fmt = (n: number) =>
  n > 0 ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "";

/** When debit and credit are both set (e.g. from old parse), show only the one that matches the transaction type */
function getDisplayDebitCredit(tx: Transaction): { debit: number; credit: number } {
  const debit = Number(tx.debit) || 0;
  const credit = Number(tx.credit) || 0;
  if (debit === 0 && credit === 0) return { debit: 0, credit: 0 };
  if (debit > 0 && credit > 0) {
    const category = classifyTransaction(tx.details ?? "");
    const isCreditType = /credit|receipt|cr\b|upi\/cr|neft\s*cr|imps/i.test(category) || /NEFT-G|UPI\/CR|NEFT\s+CR|CREDIT|CR\s*--/i.test(tx.details ?? "");
    const isDebitType = /debit|payment|dr\b|upi\/dr|chq\s+paid|atw|atm/i.test(category) || /UPI\/DR|NEFT\s+DR|DEBIT|DR\s*--/i.test(tx.details ?? "");
    if (isCreditType && !isDebitType) return { debit: 0, credit: Math.max(debit, credit) };
    if (isDebitType && !isCreditType) return { debit: Math.max(debit, credit), credit: 0 };
  }
  return { debit, credit };
}

const ROWS_PER_PAGE = 25;

interface TransactionTableProps {
  transactions: Transaction[];
  defaultView?: "byDate" | "byParty" | "byCategory";
  isDateFiltered?: boolean;
  totalUnfiltered?: number;
}

export function TransactionTable({
  transactions,
  defaultView = "byDate",
  isDateFiltered = false,
  totalUnfiltered,
}: TransactionTableProps) {
  const [viewMode, setViewMode] = useState<"byDate" | "byParty" | "byCategory">(defaultView);
  const [expandedParties, setExpandedParties] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (transactions.length > 0 && viewMode === "byParty") {
      setExpandedParties(
        new Set(transactions.slice(0, 5).map((t) => getPartyName(t)))
      );
    }
  }, [transactions.length, viewMode]);

  useEffect(() => {
    if (transactions.length > 0 && viewMode === "byCategory") {
      setExpandedCategories(
        new Set(transactions.slice(0, 5).map((t) => classifyTransaction(t.details ?? "")))
      );
    }
  }, [transactions.length, viewMode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, viewMode]);

  // Sort by date (chronological: oldest first) so "By Date" and all views show consistent order
  const sortedByDate = useMemo(
    () => [...transactions].sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    [transactions]
  );

  const filtered = useMemo(() => {
    if (search.trim() === "") return sortedByDate;
    const s = search.toLowerCase();
    return sortedByDate.filter(
        (t) =>
        (t.details ?? "").toLowerCase().includes(s) ||
        getPartyName(t).toLowerCase().includes(s) ||
        (t.date ?? "").toLowerCase().includes(s) ||
        classifyTransaction(t.details ?? "").toLowerCase().includes(s)
    );
  }, [sortedByDate, search]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, currentPage]);

  const totalDebit = filtered.reduce((s, t) => s + getDisplayDebitCredit(t).debit, 0);
  const totalCredit = filtered.reduce((s, t) => s + getDisplayDebitCredit(t).credit, 0);

  const byParty = filtered.reduce(
    (g, tx) => {
      const p = getPartyName(tx);
      (g[p] = g[p] || []).push(tx);
      return g;
    },
    {} as Record<string, Transaction[]>
  );

  const byCategory = filtered.reduce(
    (g, tx) => {
      const cat = classifyTransaction(tx.details ?? "");
      (g[cat] = g[cat] || []).push(tx);
      return g;
    },
    {} as Record<string, Transaction[]>
  );

  const sortedParties = Object.entries(byParty).sort(
    ([, a], [, b]) =>
      b.reduce((s, t) => s + (t.credit || 0) + (t.debit || 0), 0) -
      a.reduce((s, t) => s + (t.credit || 0) + (t.debit || 0), 0)
  );

  const sortedCategories = Object.entries(byCategory).sort(
    ([, a], [, b]) =>
      b.reduce((s, t) => s + (t.credit || 0) + (t.debit || 0), 0) -
      a.reduce((s, t) => s + (t.credit || 0) + (t.debit || 0), 0)
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["byDate", "byParty", "byCategory"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-4 py-1.5 text-sm rounded-md font-medium transition-all",
                viewMode === mode
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode === "byDate" ? "By Date" : mode === "byParty" ? "By Party" : "By Category"}
            </button>
          ))}
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search party, details, date…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 max-w-xs h-9 text-sm"
          />
        </div>
        
        <span className="text-xs text-muted-foreground">
          {isDateFiltered && totalUnfiltered != null
            ? `Showing ${filtered.length} of ${totalUnfiltered} (filtered)`
            : `${filtered.length} transactions`}
        </span>
      </div>

      {/* By Date View */}
      {viewMode === "byDate" && (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col className="w-[100px]" />
                <col className="w-[280px]" />
                <col className="w-[140px]" />
                <col className="w-[80px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead className="bg-muted/50 border-b">
                <tr className="text-muted-foreground">
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-left">Date</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-left">Details</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-left">Party</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-left">Type</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right">Debit</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right">Credit</th>
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedData.map((tx, i) => {
                  const party = getPartyName(tx);
                  const txType = getTransactionType(tx.details);
                  const category = classifyTransaction(tx.details ?? "");
                  const knownParty = matchKnownParty(party);
                  const isEven = i % 2 === 0;
                  const { debit: displayDebit, credit: displayCredit } = getDisplayDebitCredit(tx);
                  return (
                    <tr 
                      key={tx.id || i} 
                      className={cn(
                        "hover:bg-muted/40 transition-colors",
                        isEven ? "bg-background" : "bg-muted/20"
                      )}
                    >
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {tx.date}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span 
                          className="block truncate" 
                          title={tx.details ?? ""}
                        >
                          {tx.details?.slice(0, 45) ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium" title={party}>
                            {knownParty ? knownParty.name.slice(0, 18) : party.slice(0, 18)}
                          </span>
                          {knownParty && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                              {knownParty.type === "customer" ? "C" : knownParty.type === "vendor" ? "V" : "O"}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={cn("text-[10px] px-2 py-0.5 font-medium", txType.color)}>
                          {category}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-right font-medium text-red-600 dark:text-red-400 tabular-nums">
                        {fmt(displayDebit)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-right font-medium text-green-600 dark:text-green-400 tabular-nums">
                        {fmt(displayCredit)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-right font-medium tabular-nums">
                        ₹{(tx.balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/50 border-t-2">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-xs font-bold text-muted-foreground">
                    TOTAL — {filtered.length} transactions
                  </td>
                  <td className="px-3 py-3 text-xs text-right font-bold text-red-600 dark:text-red-400 tabular-nums">
                    ₹{totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-3 text-xs text-right font-bold text-green-600 dark:text-green-400 tabular-nums">
                    ₹{totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous</span>
                </Button>
                <span className="text-sm px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next</span>
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* By Party View */}
      {viewMode === "byParty" && (
        <div className="space-y-2">
          {sortedParties.map(([party, partyTxns]) => {
            const pCredits = partyTxns.reduce((s, t) => s + getDisplayDebitCredit(t).credit, 0);
            const pDebits = partyTxns.reduce((s, t) => s + getDisplayDebitCredit(t).debit, 0);
            const isOpen = expandedParties.has(party);
            const knownParty = matchKnownParty(party);

            return (
              <div key={party} className="border rounded-xl overflow-hidden bg-card">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  onClick={() =>
                    setExpandedParties((prev) => {
                      const next = new Set(prev);
                      if (isOpen) next.delete(party);
                      else next.add(party);
                      return next;
                    })
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {knownParty ? knownParty.name : party}
                    </span>
                    {knownParty && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {knownParty.category}
                      </Badge>
                    )}
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {partyTxns.length} txn{partyTxns.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {pCredits > 0 && (
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums">
                        +{fmt(pCredits)}
                      </span>
                    )}
                    {pDebits > 0 && (
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                        -{fmt(pDebits)}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {partyTxns.map((tx, i) => {
                        const txType = getTransactionType(tx.details);
                        const category = classifyTransaction(tx.details ?? "");
                        const { debit: d, credit: c } = getDisplayDebitCredit(tx);
                        return (
                          <tr 
                            key={tx.id || i} 
                            className={cn(
                              "hover:bg-muted/30 transition-colors",
                              i % 2 === 0 ? "bg-background" : "bg-muted/10"
                            )}
                          >
                            <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap w-24 font-mono">
                              {tx.date}
                            </td>
                            <td className="px-4 py-2 text-xs max-w-sm truncate" title={tx.details ?? ""}>
                              {tx.details?.slice(0, 50) ?? "—"}
                            </td>
                            <td className="px-4 py-2 w-20">
                              <Badge className={cn("text-[10px] px-2 py-0.5", txType.color)}>
                                {category}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-xs text-right font-medium text-red-600 dark:text-red-400 w-28 tabular-nums">
                              {fmt(d)}
                            </td>
                            <td className="px-4 py-2 text-xs text-right font-medium text-green-600 dark:text-green-400 w-28 tabular-nums">
                              {fmt(c)}
                            </td>
                            <td className="px-4 py-2 text-xs text-right w-28 tabular-nums">
                              ₹{(tx.balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* By Category View */}
      {viewMode === "byCategory" && (
        <div className="space-y-2">
          {sortedCategories.map(([category, categoryTxns]) => {
            const cCredits = categoryTxns.reduce((s, t) => s + getDisplayDebitCredit(t).credit, 0);
            const cDebits = categoryTxns.reduce((s, t) => s + getDisplayDebitCredit(t).debit, 0);
            const isOpen = expandedCategories.has(category);
            const txType = getTransactionType(categoryTxns[0]?.details);

            return (
              <div key={category} className="border rounded-xl overflow-hidden bg-card">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  onClick={() =>
                    setExpandedCategories((prev) => {
                      const next = new Set(prev);
                      if (isOpen) next.delete(category);
                      else next.add(category);
                      return next;
                    })
                  }
                >
                  <div className="flex items-center gap-3">
                    <Badge className={cn("text-[10px] px-2 py-0.5", txType?.color)}>
                      {category}
                    </Badge>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {categoryTxns.length} txn{categoryTxns.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {cCredits > 0 && (
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400 tabular-nums">
                        +{fmt(cCredits)}
                      </span>
                    )}
                    {cDebits > 0 && (
                      <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                        -{fmt(cDebits)}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {categoryTxns.map((tx, i) => {
                        const typeStyle = getTransactionType(tx.details);
                        const { debit: d, credit: c } = getDisplayDebitCredit(tx);
                        return (
                          <tr
                            key={tx.id || i}
                            className={cn(
                              "hover:bg-muted/30 transition-colors",
                              i % 2 === 0 ? "bg-background" : "bg-muted/10"
                            )}
                          >
                            <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap w-24 font-mono">
                              {tx.date}
                            </td>
                            <td className="px-4 py-2 text-xs max-w-sm truncate" title={tx.details ?? ""}>
                              {tx.details?.slice(0, 50) ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-xs truncate" title={getPartyName(tx)}>
                              {getPartyName(tx).slice(0, 20)}
                            </td>
                            <td className="px-4 py-2 text-xs text-right font-medium text-red-600 dark:text-red-400 w-28 tabular-nums">
                              {fmt(d)}
                            </td>
                            <td className="px-4 py-2 text-xs text-right font-medium text-green-600 dark:text-green-400 w-28 tabular-nums">
                              {fmt(c)}
                            </td>
                            <td className="px-4 py-2 text-xs text-right w-28 tabular-nums">
                              ₹{(tx.balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
