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
  const { data: fulfillments } = await supabase
    .from("order_fulfillments" as any)
    .select("qty_delivered")
    .eq("order_id", orderId);

  const totalFulfilled = (fulfillments || []).reduce((s: number, f: any) => s + (Number(f.qty_delivered) || 0), 0);

  // Use `quantity` as the canonical ordered value — never qty_ordered
  const { data: order } = await supabase
    .from("orders")
    .select("quantity")
    .eq("id", orderId)
    .single();

  const qtyOrdered = Number(order?.quantity) || 0;

  // Clamp: fulfilled can never exceed ordered, pending can never go negative
  const clampedFulfilled = Math.min(totalFulfilled, qtyOrdered);
  const qtyPending = Math.max(0, qtyOrdered - clampedFulfilled);

  console.log(`[fulfillment] order=${orderId} ordered=${qtyOrdered} fulfilled=${clampedFulfilled} pending=${qtyPending}`);

  if (totalFulfilled > qtyOrdered) {
    console.warn(`[fulfillment] WARNING: total delivered (${totalFulfilled}) exceeds ordered (${qtyOrdered})`);
  }

  await supabase
    .from("orders")
    .update({
      qty_ordered: qtyOrdered,
      qty_fulfilled: clampedFulfilled,
      qty_pending: qtyPending,
    } as any)
    .eq("id", orderId);

  // Auto-set Partially Fulfilled status
  if (clampedFulfilled > 0 && qtyPending > 0) {
    await supabase
      .from("orders")
      .update({ status: "Partially Fulfilled" as any })
      .eq("id", orderId);
  }
}
