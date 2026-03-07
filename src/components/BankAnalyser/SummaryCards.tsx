import type { AccountSummary } from "@/hooks/useAccountTransactions";

export function SummaryCards({ summary }: { summary: AccountSummary }) {
  const fmt = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-card border rounded-xl p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Credits</p>
        <p className="text-xl font-bold text-green-600">{fmt(summary.totalCredits)}</p>
        <p className="text-xs text-muted-foreground mt-1">{summary.statementCount} statement(s)</p>
      </div>
      <div className="bg-card border rounded-xl p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Debits</p>
        <p className="text-xl font-bold text-red-600">{fmt(summary.totalDebits)}</p>
      </div>
      <div className="bg-card border rounded-xl p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Net Flow</p>
        <p className={`text-xl font-bold ${summary.netFlow >= 0 ? "text-blue-600" : "text-red-600"}`}>
          {summary.netFlow >= 0 ? "+" : ""}{fmt(Math.abs(summary.netFlow))}
        </p>
      </div>
      <div className="bg-card border rounded-xl p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Transactions</p>
        <p className="text-xl font-bold text-primary">{summary.transactionCount}</p>
      </div>
    </div>
  );
}
