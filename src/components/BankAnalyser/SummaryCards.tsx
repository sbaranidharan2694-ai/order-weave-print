import type { AccountSummary } from "@/hooks/useAccountTransactions";
import { ArrowUpRight, ArrowDownRight, Activity, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export function SummaryCards({ summary }: { summary: AccountSummary }) {
  const fmt = (n: number) =>
    "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const netFlowPositive = summary.netFlow >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Credits</p>
          <ArrowUpRight className="h-4 w-4 text-green-600" />
        </div>
        <p className="text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">
          {fmt(summary.totalCredits)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {summary.statementCount} statement{summary.statementCount !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Debits</p>
          <ArrowDownRight className="h-4 w-4 text-red-600" />
        </div>
        <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">
          {fmt(summary.totalDebits)}
        </p>
      </div>

      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Net Flow</p>
          <Activity className={cn("h-4 w-4", netFlowPositive ? "text-blue-600" : "text-red-600")} />
        </div>
        <p className={cn(
          "text-xl font-bold tabular-nums",
          netFlowPositive ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"
        )}>
          {netFlowPositive ? "+" : ""}{fmt(summary.netFlow)}
        </p>
      </div>

      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Transactions</p>
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <p className="text-xl font-bold text-primary tabular-nums">
          {summary.transactionCount.toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}
