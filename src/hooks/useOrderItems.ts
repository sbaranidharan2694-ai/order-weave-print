import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type OrderItem = Tables<"order_items">;
export type OrderItemInsert = TablesInsert<"order_items">;

export function useOrderItems(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order_items", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("item_no", { ascending: true });
      if (error) throw error;
      return (data || []) as OrderItem[];
    },
    enabled: !!orderId,
  });
}

export function useAddOrderItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      items,
    }: {
      orderId: string;
      items: { description: string; quantity: number; unit_price: number; amount: number }[];
    }) => {
      const rows: OrderItemInsert[] = items.map((it, idx) => ({
        order_id: orderId,
        item_no: idx + 1,
        description: it.description,
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        amount: Number(it.amount) || 0,
      }));
      const { data, error } = await supabase.from("order_items").insert(rows).select();
      if (error) throw error;
      return data as OrderItem[];
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["order_items", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders", vars.orderId] });
      toast.success(`${vars.items.length} line item(s) added.`);
    },
    onError: (err) => toast.error("Failed to add items: " + (err as Error).message),
  });
}
