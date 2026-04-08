import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, startOfWeek } from "date-fns";

export const EXPENSE_CATEGORIES = [
  "Ink / Toner",
  "Paper Purchase",
  "Transport",
  "Office Supplies",
  "Rent",
  "Electricity",
  "Staff Salary",
  "Equipment Maintenance",
  "Miscellaneous",
];

export const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Card"];

export type EntryType = "expense" | "receipt" | "bank_deposit" | "opening_balance" | "adjustment";

export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  payment_method: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  entry_type: EntryType;
  affects_cash: boolean;
  counterparty: string | null;
  order_ref: string | null;
  actual_counted: number | null;
  variance: number | null;
}

export interface LedgerFilters {
  from?: string;
  to?: string;
  category?: string;
  entryType?: "all" | "expense" | "receipt";
  paymentMethod?: string;
}

export function useExpenses(filters?: LedgerFilters) {
  return useQuery({
    queryKey: ["expenses", filters],
    queryFn: async () => {
      let q = (supabase.from("expenses") as any)
        .select("*")
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (filters?.from) q = q.gte("expense_date", filters.from);
      if (filters?.to) q = q.lte("expense_date", filters.to);
      if (filters?.category) q = q.eq("category", filters.category);
      if (filters?.entryType && filters.entryType !== "all") {
        if (filters.entryType === "expense") {
          q = q.or("entry_type.eq.expense,entry_type.is.null");
        } else {
          q = q.eq("entry_type", filters.entryType);
        }
      }
      if (filters?.paymentMethod && filters.paymentMethod !== "all") {
        q = q.eq("payment_method", filters.paymentMethod);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Expense[];
    },
  });
}

export function useExpenseStats(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["expense-stats", dateFrom, dateTo],
    queryFn: async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const monthStart = format(startOfMonth(now), "yyyy-MM-dd");

      const fromDate = dateFrom || monthStart;
      const toDate = dateTo || todayStr;

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const broadFrom = format(ninetyDaysAgo, "yyyy-MM-dd");

      const { data, error } = await (supabase.from("expenses") as any)
        .select("expense_date, amount, category, entry_type, payment_method, affects_cash")
        .gte("expense_date", broadFrom);
      if (error) throw error;

      const all = (data || []) as {
        expense_date: string;
        amount: number;
        category: string;
        entry_type: string;
        payment_method: string;
        affects_cash: boolean;
      }[];

      let todayExpenses = 0;
      let todayReceipts = 0;
      let monthExpenses = 0;
      let monthReceipts = 0;
      let openingBalanceToday = 0;
      let bankDepositedToday = 0;
      const byCategory: Record<string, number> = {};

      for (const e of all) {
        const amt = Number(e.amount) || 0;
        const et: string = e.entry_type == null ? "expense" : e.entry_type;
        const isExpense = et === "expense";
        const isReceipt = et === "receipt";
        const isOpening = et === "opening_balance";
        const isBankDeposit = et === "bank_deposit";
        const isToday = e.expense_date === todayStr;
        const isThisMonth = e.expense_date >= monthStart;

        if (isToday && isExpense) todayExpenses += amt;
        if (isToday && isReceipt) todayReceipts += amt;
        if (isToday && isOpening) openingBalanceToday += amt;
        if (isToday && isBankDeposit) bankDepositedToday += amt;
        if (isThisMonth && isExpense) monthExpenses += amt;
        if (isThisMonth && isReceipt) monthReceipts += amt;

        if (isExpense && e.expense_date >= fromDate && e.expense_date <= toDate) {
          byCategory[e.category] = (byCategory[e.category] || 0) + amt;
        }
      }

      const cashInHand = openingBalanceToday > 0
        ? openingBalanceToday + todayReceipts - todayExpenses - bankDepositedToday
        : null;

      return {
        todayExpenses,
        todayReceipts,
        netCashToday: todayReceipts - todayExpenses,
        monthExpenses,
        monthReceipts,
        cashInHand,
        hasOpeningBalance: openingBalanceToday > 0,
        byCategory,
      };
    },
  });
}

export function useDailySummary(date: string) {
  return useQuery({
    queryKey: ["daily-summary", date],
    queryFn: async () => {
      const { data, error } = await (supabase.from("expenses") as any)
        .select("amount, entry_type, payment_method, affects_cash, actual_counted, variance")
        .eq("expense_date", date);
      if (error) throw error;

      const rows = (data || []) as {
        amount: number;
        entry_type: string;
        payment_method: string;
        affects_cash: boolean;
        actual_counted: number | null;
        variance: number | null;
      }[];

      let openingCash = 0;
      let cashReceived = 0;
      let cashExpenses = 0;
      let bankDeposited = 0;
      let savedActualCounted: number | null = null;
      let savedVariance: number | null = null;

      for (const r of rows) {
        const amt = Number(r.amount) || 0;
        const rt: string = r.entry_type == null ? "expense" : r.entry_type;
        if (rt === "opening_balance") openingCash += amt;
        if (rt === "receipt" && r.payment_method === "Cash") cashReceived += amt;
        if (rt === "expense" && r.payment_method === "Cash") cashExpenses += amt;
        if (rt === "bank_deposit") bankDeposited += amt;
        if (r.entry_type === "adjustment" && r.actual_counted !== null) {
          savedActualCounted = r.actual_counted;
          savedVariance = r.variance;
        }
      }

      const expectedCash = openingCash + cashReceived - cashExpenses - bankDeposited;

      return {
        openingCash,
        cashReceived,
        cashExpenses,
        bankDeposited,
        expectedCash,
        actualCounted: savedActualCounted,
        variance: savedVariance,
        hasOpeningBalance: openingCash > 0,
      };
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expense: {
      expense_date: string;
      category: string;
      description?: string;
      amount: number;
      payment_method: string;
      entry_type?: EntryType;
      affects_cash?: boolean;
      counterparty?: string;
      order_ref?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const entryType = expense.entry_type || "expense";
      const affectsCash = expense.affects_cash !== undefined
        ? expense.affects_cash
        : expense.payment_method === "Cash";
      const { data, error } = await (supabase.from("expenses") as any).insert({
        ...expense,
        entry_type: entryType,
        affects_cash: affectsCash,
        created_by: user?.id ?? null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-stats"] });
      qc.invalidateQueries({ queryKey: ["daily-summary"] });
      const type = vars.entry_type || "expense";
      if (type === "receipt") toast.success("Receipt added!");
      else if (type === "opening_balance") toast.success("Opening balance set!");
      else toast.success("Expense added!");
    },
    onError: (err) => toast.error("Failed: " + (err as Error).message),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Expense> & { id: string }) => {
      const { error } = await (supabase.from("expenses") as any).update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-stats"] });
      qc.invalidateQueries({ queryKey: ["daily-summary"] });
      toast.success("Entry updated!");
    },
    onError: (err) => toast.error("Failed: " + (err as Error).message),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("expenses") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-stats"] });
      qc.invalidateQueries({ queryKey: ["daily-summary"] });
      toast.success("Entry deleted!");
    },
    onError: (err) => toast.error("Failed: " + (err as Error).message),
  });
}

export function useSaveDailyClosing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      date,
      actualCounted,
      expectedCash,
    }: {
      date: string;
      actualCounted: number;
      expectedCash: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const variance = actualCounted - expectedCash;

      const { data: existing } = await (supabase.from("expenses") as any)
        .select("id")
        .eq("expense_date", date)
        .eq("entry_type", "adjustment")
        .maybeSingle();

      if (existing?.id) {
        const { error } = await (supabase.from("expenses") as any)
          .update({ actual_counted: actualCounted, variance, amount: 0 })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("expenses") as any).insert({
          expense_date: date,
          entry_type: "adjustment",
          category: "Adjustment",
          payment_method: "Cash",
          amount: 0,
          affects_cash: false,
          actual_counted: actualCounted,
          variance,
          description: "Daily closing reconciliation",
          created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-summary"] });
      toast.success("Daily closing saved!");
    },
    onError: (err) => toast.error("Failed: " + (err as Error).message),
  });
}
