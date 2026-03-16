import { useState, useMemo } from "react";
import { useExpenses, useExpenseStats, useCreateExpense, useUpdateExpense, useDeleteExpense, EXPENSE_CATEGORIES, PAYMENT_METHODS, type Expense } from "@/hooks/useExpenses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Pencil, Trash2, IndianRupee, CalendarDays, TrendingUp, Filter } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ExpenseForm({ initial, onSave, isPending }: { initial?: Partial<Expense>; onSave: (data: any) => void; isPending: boolean }) {
  const [form, setForm] = useState({
    expense_date: initial?.expense_date || format(new Date(), "yyyy-MM-dd"),
    category: initial?.category || EXPENSE_CATEGORIES[0],
    description: initial?.description || "",
    amount: initial?.amount ? String(initial.amount) : "",
    payment_method: initial?.payment_method || "Cash",
  });
  const up = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.expense_date} onChange={(e) => up("expense_date", e.target.value)} />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => up("category", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Amount (₹)</Label>
          <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => up("amount", e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <Label>Payment Method</Label>
          <Select value={form.payment_method} onValueChange={(v) => up("payment_method", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => up("description", e.target.value)} placeholder="Optional notes..." className="min-h-[60px]" />
      </div>
      <Button
        onClick={() => onSave({ ...form, amount: parseFloat(form.amount) || 0 })}
        disabled={isPending || !form.amount || parseFloat(form.amount) <= 0}
        className="w-full"
      >
        {isPending ? "Saving..." : initial?.id ? "Update Expense" : "Add Expense"}
      </Button>
    </div>
  );
}

export default function Expenses() {
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const filters = useMemo(() => ({
    from: filterFrom || undefined,
    to: filterTo || undefined,
    category: filterCategory !== "all" ? filterCategory : undefined,
  }), [filterFrom, filterTo, filterCategory]);

  const { data: expenses = [], isLoading } = useExpenses(filters);
  const { data: stats } = useExpenseStats();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const handleAdd = (data: any) => {
    createExpense.mutate(data, { onSuccess: () => setAddOpen(false) });
  };

  const handleUpdate = (data: any) => {
    if (!editExpense) return;
    updateExpense.mutate({ id: editExpense.id, ...data }, { onSuccess: () => setEditExpense(null) });
  };

  const categoryBreakdown = useMemo(() => {
    if (!stats?.byCategory) return [];
    return Object.entries(stats.byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
  }, [stats]);

  const maxCatAmount = categoryBreakdown.length > 0 ? categoryBreakdown[0][1] : 1;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <PlusCircle className="h-4 w-4" /> Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
            <ExpenseForm onSave={handleAdd} isPending={createExpense.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <CalendarDays className="h-3.5 w-3.5" /> Today
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">₹{fmt(stats?.today || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> This Week
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">₹{fmt(stats?.week || 0)}</p>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <IndianRupee className="h-3.5 w-3.5" /> This Month
            </div>
            <p className="text-xl font-bold text-foreground tabular-nums">₹{fmt(stats?.month || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <Card className="border border-border">
          <CardHeader><CardTitle className="text-sm">Category Breakdown (All Time)</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {categoryBreakdown.map(([cat, amt]) => (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 truncate">{cat}</span>
                <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-all"
                    style={{ width: `${Math.max(2, (amt / maxCatAmount) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums w-24 text-right">₹{fmt(amt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="h-9 w-36" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="h-9 w-36" />
        </div>
        <div>
          <Label className="text-xs">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(filterFrom || filterTo || filterCategory !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterCategory("all"); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* Expenses Table */}
      <Card className="border border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <IndianRupee className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No expenses found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell className="text-sm">{exp.expense_date}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{exp.category}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{exp.description || "—"}</TableCell>
                    <TableCell className="text-sm">{exp.payment_method}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">₹{fmt(Number(exp.amount))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditExpense(exp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Delete this expense?")) deleteExpense.mutate(exp.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editExpense} onOpenChange={(open) => { if (!open) setEditExpense(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          {editExpense && <ExpenseForm initial={editExpense} onSave={handleUpdate} isPending={updateExpense.isPending} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
