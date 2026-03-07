import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Fulfillment = {
  id: string;
  order_id: string;
  fulfillment_date: string;
  qty_delivered: number;
  delivery_note: string | null;
  delivered_by: string | null;
  created_at: string;
};

export function useFulfillments(orderId: string | undefined) {
  return useQuery({
    queryKey: ["fulfillments", orderId],
    queryFn: async () => {
      if (!orderId) throw new Error("Order id is required");
      const { data, error } = await (supabase as any)
        .from("order_fulfillments")
        .select("*")
        .eq("order_id", orderId)
        .order("fulfillment_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Fulfillment[];
    },
    enabled: !!orderId,
  });
}

export function useAddFulfillment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      order_id: string;
      fulfillment_date: string;
      qty_delivered: number;
      delivery_note?: string;
      delivered_by?: string;
    }) => {
      const { error } = await supabase
        .from("order_fulfillments" as any)
        .insert(input as any);
      if (error) throw error;

      // Recalculate
      await recalcFulfillment(input.order_id);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fulfillments", vars.order_id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders", vars.order_id] });
      toast.success("Delivery recorded!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}

export function useDeleteFulfillment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId }: { id: string; orderId: string }) => {
      const { error } = await supabase
        .from("order_fulfillments" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      await recalcFulfillment(orderId);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fulfillments", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders", vars.orderId] });
      toast.success("Fulfillment record deleted");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}

async function recalcFulfillment(orderId: string) {
  // Get all fulfillments
  const { data: fulfillments } = await supabase
    .from("order_fulfillments" as any)
    .select("qty_delivered")
    .eq("order_id", orderId);

  const totalFulfilled = (fulfillments || []).reduce((s: number, f: any) => s + (f.qty_delivered || 0), 0);

  // Get order qty_ordered
  const { data: order } = await supabase
    .from("orders")
    .select("qty_ordered, quantity")
    .eq("id", orderId)
    .single();

  const qtyOrdered = (order as any)?.qty_ordered || (order as any)?.quantity || 0;
  const qtyPending = Math.max(0, qtyOrdered - totalFulfilled);

  await supabase
    .from("orders")
    .update({
      qty_fulfilled: totalFulfilled,
      qty_pending: qtyPending,
    } as any)
    .eq("id", orderId);

  // Auto-set status
  if (qtyPending === 0 && totalFulfilled > 0) {
    // Don't auto-change, let toast handle it
  } else if (totalFulfilled > 0 && qtyPending > 0) {
    await supabase
      .from("orders")
      .update({ status: "Partially Fulfilled" as any })
      .eq("id", orderId);
  }
}
