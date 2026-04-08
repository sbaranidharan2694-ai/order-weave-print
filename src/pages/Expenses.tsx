import { useState, useMemo } from "react";
import {
  useExpenses,
  useExpenseStats,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useDailySummary,
  useSaveDailyClosing,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type Expense,
  type EntryType,
} from "@/hooks/useExpenses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  PlusCircle,
  Pencil,
  Trash2,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayStr = () => format(new Date(), "yyyy-MM-dd");

type ModalMode = "expense" | "receipt";

interface EntryFormData {
  expense_date: string;
  category: string;
  description: string;
  amount: string;
  payment_method: string;
  entry_type: EntryType;
  counterparty: string;
  order_ref: string;
}

function buildInitialForm(initial?: Partial<Expense>, mode?: ModalMode): EntryFormData {
  const isReceipt = (initial?.entry_type === "receipt") || mode === "receipt";
  return {
    expense_date: initial?.expense_date || todayStr(),
    category: initial?.category || (isReceipt ? "" : EXPENSE_CATEGORIES[0]),
    description: initial?.description || "",
    amount: initial?.amount ? String(initial.amount) : "",
    payment_method: initial?.payment_method || "Cash",
    entry_type: initial?.entry_type || (isReceipt ? "receipt" : "expense"),
    counterparty: initial?.counterparty || "",
    order_ref: initial?.order_ref || "",
  };
}

function EntryForm({
  initial,
  onSave,
  isPending,
  defaultMode,
}: {
  initial?: Partial<Expense>;
  onSave: (data: Omit<EntryFormData, "amount"> & { amount: number }) => void;
  isPending: boolean;
  defaultMode?: ModalMode;
}) {
  const isEditing = !!initial?.id;
  const [mode, setMode] = useState<ModalMode>(
    isEditing
      ? initial?.entry_type === "receipt"
        ? "receipt"
        : "expense"
      : defaultMode || "expense"
  );
  const [form, setForm] = useState<EntryFormData>(() =>
    buildInitialForm(initial, defaultMode)
  );

  const up = (k: keyof EntryFormData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const switchMode = (m: ModalMode) => {
    setMode(m);
    setForm((f) => ({
      ...f,
      entry_type: m === "receipt" ? "receipt" : "expense",
      category: m === "receipt" ? "" : EXPENSE_CATEGORIES[0],
    }));
  };

  const handleSubmit = () => {
    onSave({
      ...form,
      entry_type: mode === "receipt" ? "receipt" : "expense",
      amount: parseFloat(form.amount) || 0,
    });
  };

  return (
    <div className="space-y-4">
      {!isEditing && (
        <div className="flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => switchMode("expense")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "expense"
                ? "bg-destructive text-destructive-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => switchMode("receipt")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === "receipt"
                ? "bg-emerald-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Cash Received
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={form.expense_date}
            onChange={(e) => up("expense_date", e.target.value)}
          />
        </div>
        <div>
          <Label>Amount (₹)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(e) => up("amount", e.target.value)}
            placeholder="0.00"
          />
        </div>

        {mode === "expense" && (
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => up("category", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Payment {mode === "receipt" ? "Mode" : "Method"}</Label>
          <Select value={form.payment_method} onValueChange={(v) => up("payment_method", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mode === "receipt" && (
          <>
            <div>
              <Label>Received From</Label>
              <Input
                value={form.counterparty}
                onChange={(e) => up("counterparty", e.target.value)}
                placeholder="Customer name or Walk-in"
              />
            </div>
            <div>
              <Label>Order Ref (optional)</Label>
              <Input
                value={form.order_ref}
                onChange={(e) => up("order_ref", e.target.value)}
                placeholder="e.g. ORD-00042"
              />
            </div>
          </>
        )}

        {mode === "expense" && (
          <div>
            <Label>Paid To (optional)</Label>
            <Input
              value={form.counterparty}
              onChange={(e) => up("counterparty", e.target.value)}
              placeholder="Vendor name"
            />
          </div>
        )}
      </div>

      <div>
        <Label>{mode === "receipt" ? "Notes" : "Description"}</Label>
        <Textarea
          value={form.description}
          onChange={(e) => up("description", e.target.value)}
          placeholder="Optional notes..."
          className="min-h-[60px]"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isPending || !form.amount || parseFloat(form.amount) <= 0}
        className={`w-full ${mode === "receipt" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
      >
        {isPending
          ? "Saving..."
          : isEditing
          ? "Update Entry"
          : mode === "receipt"
          ? "Add Receipt"
          : "Add Expense"}
      </Button>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  colorClass,
  sub,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  colorClass: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`border border-border ${onClick ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-3">
        <div className={`flex items-center gap-2 text-xs mb-1 ${colorClass}`}>
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className={`text-xl font-bold tabular-nums ${colorClass}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function DailySummarySection({
  onSetOpeningBalance,
}: {
  onSetOpeningBalance: () => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [open, setOpen] = useState(false);
  const [actualCounted, setActualCounted] = useState("");
  const { data: summary, isLoading } = useDailySummary(date);
  const saveDailyClosing = useSaveDailyClosing();
  const [expanded, setExpanded] = useState(false);

  const variance = actualCounted !== "" && summary
    ? parseFloat(actualCounted) - summary.expectedCash
    : null;

  const handleSave = () => {
    if (!summary || actualCounted === "") return;
    saveDailyClosing.mutate({
      date,
      actualCounted: parseFloat(actualCounted),
      expectedCash: summary.expectedCash,
    });
  };

  return (
    <Card className="border border-border">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Daily Summary &amp; Closing
            {summary?.variance !== null && summary?.variance !== undefined && summary.variance !== 0 && (
              <Badge variant="destructive" className="text-xs ml-2">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Variance
              </Badge>
            )}
          </CardTitle>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-40"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : summary ? (
            <div className="space-y-2 text-sm">
              {!summary.hasOpeningBalance && (
                <div className="flex items-center justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <span className="text-amber-700 dark:text-amber-400 text-xs">
                    No opening balance set for this date
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetOpeningBalance();
                    }}
                  >
                    Set Opening Balance
                  </Button>
                </div>
              )}

              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">Opening Cash</p>
                    <p className="font-medium tabular-nums">₹{fmt(summary.openingCash)}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">+ Cash Received</p>
                    <p className="font-medium text-emerald-600 tabular-nums">
                      ₹{fmt(summary.cashReceived)}
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">- Cash Expenses</p>
                    <p className="font-medium text-destructive tabular-nums">
                      ₹{fmt(summary.cashExpenses)}
                    </p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground">- Bank Deposited</p>
                    <p className="font-medium tabular-nums">₹{fmt(summary.bankDeposited)}</p>
                  </div>
                </div>
                <div className="p-3 border-t border-border bg-muted/30">
                  <p className="text-xs text-muted-foreground">= Expected Cash in Hand</p>
                  <p className="text-lg font-bold tabular-nums">₹{fmt(summary.expectedCash)}</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div>
                  <Label className="text-xs">Actual Cash Counted (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={actualCounted}
                    onChange={(e) => setActualCounted(e.target.value)}
                    placeholder="Enter counted amount..."
                    className="h-9"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                {variance !== null && (
                  <div
                    className={`p-2 rounded text-sm font-medium flex items-center gap-2 ${
                      variance === 0
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                        : variance > 0
                        ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {variance !== 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                    Variance: {variance > 0 ? "+" : ""}₹{fmt(Math.abs(variance))}
                    {variance > 0 && " (Excess)"}
                    {variance < 0 && " (Shortage)"}
                    {variance === 0 && " ✓ Balanced"}
                  </div>
                )}

                <Button
                  size="sm"
                  disabled={actualCounted === "" || saveDailyClosing.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSave();
                  }}
                  className="w-full"
                >
                  {saveDailyClosing.isPending ? "Saving..." : "Save Daily Closing"}
                </Button>
              </div>

              {summary.actualCounted !== null && (
                <p className="text-xs text-muted-foreground text-center">
                  Last saved: Actual ₹{fmt(summary.actualCounted)} — Variance ₹{fmt(summary.variance || 0)}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

type ModalState =
  | { open: false }
  | { open: true; mode: ModalMode; edit?: Expense };

export default function Expenses() {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterEntryType, setFilterEntryType] = useState<"all" | "expense" | "receipt">("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [modal, setModal] = useState<ModalState>({ open: false });

  const today = todayStr();
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const chartFrom = filterFrom || monthStart;
  const chartTo = filterTo || today;

  const filters = useMemo(
    () => ({
      from: filterFrom || undefined,
      to: filterTo || undefined,
      category: filterCategory !== "all" ? filterCategory : undefined,
      entryType: filterEntryType,
      paymentMethod: filterPayment !== "all" ? filterPayment : undefined,
    }),
    [filterFrom, filterTo, filterCategory, filterEntryType, filterPayment]
  );

  const { data: entries = [], isLoading } = useExpenses(filters);
  const { data: stats } = useExpenseStats(chartFrom, chartTo);
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const handleSave = (data: any) => {
    if (modal.open && modal.edit) {
      updateExpense.mutate(
        { id: modal.edit.id, ...data },
        { onSuccess: () => setModal({ open: false }) }
      );
    } else {
      createExpense.mutate(data, { onSuccess: () => setModal({ open: false }) });
    }
  };

  const categoryBreakdown = useMemo(() => {
    if (!stats?.byCategory) return [];
    return Object.entries(stats.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [stats]);

  const maxCatAmount = categoryBreakdown.length > 0 ? categoryBreakdown[0][1] : 1;

  const chartLabel = useMemo(() => {
    if (filterFrom && filterTo) return `${filterFrom} → ${filterTo}`;
    if (filterFrom) return `From ${filterFrom}`;
    if (filterTo) return `Until ${filterTo}`;
    return format(startOfMonth(new Date()), "MMM yyyy");
  }, [filterFrom, filterTo]);

  const hasFilters =
    filterFrom || filterTo || filterCategory !== "all" || filterEntryType !== "all" || filterPayment !== "all";

  const clearFilters = () => {
    setFilterFrom("");
    setFilterTo("");
    setFilterCategory("all");
    setFilterEntryType("all");
    setFilterPayment("all");
  };

  const openModal = (mode: ModalMode, edit?: Expense) => {
    setModal({ open: true, mode, edit });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-foreground">Cash Ledger</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-1.5 border-emerald-500 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            onClick={() => openModal("receipt")}
          >
            <ArrowDownCircle className="h-4 w-4" />
            Cash Received
          </Button>
          <Button className="gap-1.5" onClick={() => openModal("expense")}>
            <PlusCircle className="h-4 w-4" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards — Row 1: Today */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Cash Received Today"
          value={`₹${fmt(stats?.todayReceipts || 0)}`}
          icon={ArrowDownCircle}
          colorClass="text-emerald-600"
        />
        <KpiCard
          label="Cash Expenses Today"
          value={`₹${fmt(stats?.todayExpenses || 0)}`}
          icon={ArrowUpCircle}
          colorClass="text-destructive"
        />
        <KpiCard
          label="Net Cash Today"
          value={`₹${fmt(stats?.netCashToday || 0)}`}
          icon={(stats?.netCashToday || 0) >= 0 ? TrendingUp : TrendingDown}
          colorClass={(stats?.netCashToday || 0) >= 0 ? "text-emerald-600" : "text-destructive"}
        />
      </div>

      {/* KPI Cards — Row 2: This Month */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total Received (Month)"
          value={`₹${fmt(stats?.monthReceipts || 0)}`}
          icon={IndianRupee}
          colorClass="text-emerald-600"
        />
        <KpiCard
          label="Total Expenses (Month)"
          value={`₹${fmt(stats?.monthExpenses || 0)}`}
          icon={IndianRupee}
          colorClass="text-destructive"
        />
        {stats?.cashInHand !== null && stats?.cashInHand !== undefined ? (
          <KpiCard
            label="Cash in Hand"
            value={`₹${fmt(stats.cashInHand)}`}
            icon={Wallet}
            colorClass={stats.cashInHand >= 0 ? "text-foreground" : "text-destructive"}
          />
        ) : (
          <Card className="border border-border border-dashed">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Wallet className="h-3.5 w-3.5" /> Cash in Hand
              </div>
              <button
                className="text-sm text-primary underline underline-offset-2"
                onClick={() => openModal("expense")}
              >
                Set Opening Balance
              </button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <Card className="border border-border">
          <CardHeader>
            <CardTitle className="text-sm">
              Category Breakdown — {chartLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {categoryBreakdown.map(([cat, amt]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-36 truncate">{cat}</span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-all"
                    style={{ width: `${Math.max(2, (amt / maxCatAmount) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-24 text-right">
                  ₹{fmt(amt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select
            value={filterEntryType}
            onValueChange={(v) => setFilterEntryType(v as "all" | "expense" | "receipt")}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="receipt">Receipts</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Payment Mode</Label>
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modes</SelectItem>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* Ledger Table */}
      <Card className="border border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <IndianRupee className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No entries found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category / Party</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right text-emerald-600">Inflow</TableHead>
                    <TableHead className="text-right text-destructive">Outflow</TableHead>
                    <TableHead className="text-right w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const entryType = entry.entry_type ?? "expense";
                    const isReceipt = entryType === "receipt";
                    const isExpense = entryType === "expense";
                    const label = entry.counterparty || entry.category || "—";
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {entry.expense_date}
                        </TableCell>
                        <TableCell>
                          {isReceipt ? (
                            <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-100">
                              Receipt
                            </Badge>
                          ) : isExpense ? (
                            <Badge variant="destructive" className="text-xs opacity-80">
                              Expense
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {(entry.entry_type ?? "expense").replace("_", " ")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm max-w-[140px] truncate">{label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                          {entry.description || (isReceipt && entry.order_ref ? `Ref: ${entry.order_ref}` : "—")}
                        </TableCell>
                        <TableCell className="text-sm">{entry.payment_method}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-emerald-600">
                          {isReceipt ? `₹${fmt(Number(entry.amount))}` : ""}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums text-destructive">
                          {isExpense ? `₹${fmt(Number(entry.amount))}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openModal(isReceipt ? "receipt" : "expense", entry)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this entry?")) deleteExpense.mutate(entry.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Summary Section */}
      <DailySummarySection
        onSetOpeningBalance={() => {
          setModal({ open: true, mode: "expense" });
        }}
      />

      {/* Add / Edit Modal */}
      <Dialog
        open={modal.open}
        onOpenChange={(open) => {
          if (!open) setModal({ open: false });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal.open && modal.edit
                ? "Edit Entry"
                : modal.open && modal.mode === "receipt"
                ? "Add Receipt"
                : "Add Expense"}
            </DialogTitle>
          </DialogHeader>
          {modal.open && (
            <EntryForm
              initial={modal.edit}
              defaultMode={modal.mode}
              onSave={handleSave}
              isPending={createExpense.isPending || updateExpense.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
