import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const EXPENSE_CATEGORIES = [
  "Printing Materials",
  "Paper Purchase",
  "Ink / Toner",
  "Rent",
  "Electricity",
  "Staff Salary",
  "Transport",
  "Equipment Maintenance",
  "Office Supplies",
  "Miscellaneous",
];

export const PAYMENT_METHODS = ["Cash", "UPI", "Bank", "Card"];

export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  payment_method: string;
  created_at: string;
  updated_at: string;
}

export function useExpenses(filters?: { from?: string; to?: string; category?: string }) {
  return useQuery({
    queryKey: ["expenses", filters],
    queryFn: async () => {
      let q = supabase.from("expenses").select("*").order("expense_date", { ascending: false });
      if (filters?.from) q = q.gte("expense_date", filters.from);
      if (filters?.to) q = q.lte("expense_date", filters.to);
      if (filters?.category) q = q.eq("category", filters.category);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Expense[];
    },
  });
}

export function useExpenseStats() {
  return useQuery({
    queryKey: ["expense-stats"],
    queryFn: async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const weekStart = monday.toISOString().slice(0, 10);
      const monthStart = todayStr.slice(0, 8) + "01";

      const { data, error } = await supabase.from("expenses").select("expense_date, amount, category");
      if (error) throw error;
      const all = (data || []) as { expense_date: string; amount: number; category: string }[];

      let today = 0, week = 0, month = 0;
      const byCategory: Record<string, number> = {};

      for (const e of all) {
        const amt = Number(e.amount) || 0;
        if (e.expense_date === todayStr) today += amt;
        if (e.expense_date >= weekStart) week += amt;
        if (e.expense_date >= monthStart) month += amt;
        byCategory[e.category] = (byCategory[e.category] || 0) + amt;
      }

      return { today, week, month, byCategory };
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expense: { expense_date: string; category: string; description?: string; amount: number; payment_method: string }) => {
      const { data, error } = await supabase.from("expenses").insert(expense as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-stats"] });
      toast.success("Expense added!");
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
      toast.success("Expense updated!");
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
      toast.success("Expense deleted!");
    },
    onError: (err) => toast.error("Failed: " + (err as Error).message),
  });
}
