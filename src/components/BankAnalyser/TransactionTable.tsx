import { useState, useEffect } from "react";
import type { Transaction } from "@/hooks/useAccountTransactions";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function extractParty(details: string | null): string {
  if (!details) return "Unknown";
  const upi = details.match(/UPI\/(?:DR|CR)\/\d+\/([^/]+)/i);
  if (upi) return upi[1].trim();
  const neft = details.match(/NEFT\s+Cr--[A-Z0-9]+-([^-]+)/i);
  if (neft) return neft[1].trim();
  const imps = details.match(/IMPS--\d+-([A-Z\s]+)/i);
  if (imps) return imps[1].trim();
  if (/ATW\s+using/i.test(details)) return "ATM Withdrawal";
  if (/Chq\s+Paid/i.test(details)) return "Cheque Payment";
  if (/Swiggy/i.test(details)) return "Swiggy";
  if (/GOOGLE/i.test(details)) return "Google Pay";
  return details.substring(0, 25).trim() || "Unknown";
}

const fmt = (n: number) =>
  n > 0 ? "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "";

interface TransactionTableProps {
  transactions: Transaction[];
  defaultView?: "byDate" | "byParty";
}

export function TransactionTable({
  transactions,
  defaultView = "byDate",
}: TransactionTableProps) {
  const [viewMode, setViewMode] = useState<"byDate" | "byParty">(defaultView);
  const [expandedParties, setExpandedParties] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (transactions.length > 0 && viewMode === "byParty") {
      setExpandedParties(
        new Set(transactions.map((t) => extractParty(t.details ?? "")))
      );
    }
  }, [transactions.length, viewMode]);

  const filtered =
    search.trim() === ""
      ? transactions
      : transactions.filter(
          (t) =>
            (t.details ?? "").toLowerCase().includes(search.toLowerCase()) ||
            extractParty(t.details ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (t.date ?? "").toLowerCase().includes(search.toLowerCase())
        );

  const totalDebit = filtered.reduce((s, t) => s + (t.debit || 0), 0);
  const totalCredit = filtered.reduce((s, t) => s + (t.credit || 0), 0);

  const byParty = filtered.reduce(
    (g, tx) => {
      const p = extractParty(tx.details ?? "");
      (g[p] = g[p] || []).push(tx);
      return g;
    },
    {} as Record<string, Transaction[]>
  );

  const sortedParties = Object.entries(byParty).sort(
    ([, a], [, b]) =>
      b.reduce((s, t) => s + (t.credit || 0) + (t.debit || 0), 0) -
      a.reduce((s, t) => s + (t.credit || 0) + (t.debit || 0), 0)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["byDate", "byParty"] as const).map((mode) => (
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
              {mode === "byDate" ? "By Date" : "By Party"}
            </button>
          ))}
        </div>
        <Input
          type="text"
          placeholder="Search party, details, date…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {transactions.length} transactions
        </span>
      </div>

      {viewMode === "byDate" && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-muted-foreground">
                {["Date", "Details", "Party", "Type", "RefNo", "Debit", "Credit", "Balance"].map(
                  (h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-3 text-xs font-semibold uppercase tracking-wide",
                        ["Debit", "Credit", "Balance"].includes(h) ? "text-right" : "text-left"
                      )}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((tx, i) => (
                <tr key={tx.id || i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {tx.date}
                  </td>
                  <td className="px-4 py-2.5 text-xs max-w-xs">
                    <span className="truncate block" title={tx.details ?? ""}>
                      {tx.details ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {tx.counterparty ?? extractParty(tx.details ?? "")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full font-medium",
                        (tx.credit ?? 0) > 0
                          ? "bg-green-500/10 text-green-700 dark:text-green-400"
                          : "bg-red-500/10 text-red-700 dark:text-red-400"
                      )}
                    >
                      {tx.type ?? "Other"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                    {tx.ref_no ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-right font-medium text-destructive">
                    {fmt(tx.debit ?? 0)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-right font-medium text-green-600 dark:text-green-400">
                    {fmt(tx.credit ?? 0)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-right">
                    ₹{(tx.balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/50 border-t-2">
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-3 text-xs font-bold text-muted-foreground"
                >
                  TOTAL — {filtered.length} transactions
                </td>
                <td className="px-4 py-3 text-xs text-right font-bold text-destructive">
                  ₹{totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-xs text-right font-bold text-green-600 dark:text-green-400">
                  ₹{totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {viewMode === "byParty" && (
        <div className="space-y-2">
          {sortedParties.map(([party, partyTxns]) => {
            const pCredits = partyTxns.reduce((s, t) => s + (t.credit || 0), 0);
            const pDebits = partyTxns.reduce((s, t) => s + (t.debit || 0), 0);
            const isOpen = expandedParties.has(party);

            return (
              <div key={party} className="border rounded-xl overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  onClick={() =>
                    setExpandedParties((prev) => {
                      const next = new Set(prev);
                      isOpen ? next.delete(party) : next.add(party);
                      return next;
                    })
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{party}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      {partyTxns.length} txn{partyTxns.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {pCredits > 0 && (
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                        +{fmt(pCredits)}
                      </span>
                    )}
                    {pDebits > 0 && (
                      <span className="text-sm font-semibold text-destructive">
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
                      {partyTxns.map((tx, i) => (
                        <tr key={tx.id || i} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap w-28">
                            {tx.date}
                          </td>
                          <td className="px-4 py-2 text-xs max-w-sm truncate">
                            {tx.details ?? "—"}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={cn(
                                "text-xs px-2 py-0.5 rounded-full",
                                (tx.credit ?? 0) > 0
                                  ? "bg-green-500/10 text-green-700"
                                  : "bg-red-500/10 text-red-700"
                              )}
                            >
                              {tx.type ?? "Other"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs font-mono text-muted-foreground w-36">
                            {tx.ref_no ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-xs text-right font-medium text-destructive w-28">
                            {fmt(tx.debit ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-xs text-right font-medium text-green-600 w-28">
                            {fmt(tx.credit ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-xs text-right w-28">
                            ₹{(tx.balance ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
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
