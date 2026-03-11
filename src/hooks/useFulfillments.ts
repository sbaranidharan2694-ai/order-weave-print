import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Fulfillment = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  fulfillment_date: string;
  qty_delivered: number;
  delivery_note: string | null;
  delivered_by: string | null;
  created_at: string;
  invoice_number: string | null;
  invoice_date: string | null;
  dc_number: string | null;
  updated_at: string | null;
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
      order_item_id?: string | null;
      fulfillment_date: string;
      qty_delivered: number;
      delivery_note?: string;
      delivered_by?: string;
      invoice_number?: string | null;
      invoice_date?: string | null;
      dc_number?: string | null;
    }) => {
      const { error } = await supabase
        .from("order_fulfillments" as any)
        .insert(input as any);
      if (error) throw error;

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

export function useUpdateFulfillment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      order_id: string;
      fulfillment_date: string;
      qty_delivered: number;
      invoice_number: string | null;
      invoice_date: string | null;
      dc_number: string | null;
      delivery_note?: string | null;
    }) => {
      const { error } = await supabase
        .from("order_fulfillments" as any)
        .update({
          fulfillment_date: input.fulfillment_date,
          qty_delivered: input.qty_delivered,
          invoice_number: input.invoice_number,
          invoice_date: input.invoice_date || null,
          dc_number: input.dc_number,
          delivery_note: input.delivery_note ?? null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", input.id);
      if (error) throw error;
      await recalcFulfillment(input.order_id);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["fulfillments", vars.order_id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders", vars.order_id] });
      toast.success("Delivery updated.");
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
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("id, quantity")
    .eq("order_id", orderId);

  const { data: fulfillments } = await supabase
    .from("order_fulfillments" as any)
    .select("qty_delivered, order_item_id")
    .eq("order_id", orderId);

  let qtyOrdered: number;
  let totalFulfilled: number;

  if (orderItems && orderItems.length > 0) {
    qtyOrdered = orderItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const deliveredByItem = new Map<string, number>();
    for (const f of fulfillments || []) {
      const key = (f as any).order_item_id ?? "__legacy__";
      deliveredByItem.set(key, (deliveredByItem.get(key) || 0) + (Number((f as any).qty_delivered) || 0));
    }
    totalFulfilled = 0;
    for (const item of orderItems) {
      const delivered = Math.min(deliveredByItem.get(item.id) || 0, Number(item.quantity) || 0);
      totalFulfilled += delivered;
    }
    const legacy = deliveredByItem.get("__legacy__") || 0;
    if (legacy > 0) totalFulfilled = Math.min(totalFulfilled + legacy, qtyOrdered);
  } else {
    totalFulfilled = (fulfillments || []).reduce((s: number, f: any) => s + (Number(f.qty_delivered) || 0), 0);
    const { data: order } = await supabase.from("orders").select("quantity").eq("id", orderId).single();
    qtyOrdered = Number(order?.quantity) || 0;
  }

  const clampedFulfilled = Math.min(totalFulfilled, qtyOrdered);
  const qtyPending = Math.max(0, qtyOrdered - clampedFulfilled);

  await supabase
    .from("orders")
    .update({
      qty_ordered: qtyOrdered,
      qty_fulfilled: clampedFulfilled,
      qty_pending: qtyPending,
    } as any)
    .eq("id", orderId);

  if (clampedFulfilled > 0 && qtyPending > 0) {
    await supabase.from("orders").update({ status: "Partially Fulfilled" as any }).eq("id", orderId);
  }
}
