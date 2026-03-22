import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { logAudit } from "@/utils/auditLog";
import { createJobForOrder, createJobForOrderItem } from "@/hooks/useProductionJobs";

export type Order = Tables<"orders">;
export type OrderInsert = TablesInsert<"orders">;

export function useOrders() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelId = `orders-realtime-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelId)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Order[];
    },
  });
}

export function useOrdersToday() {
  return useQuery({
    queryKey: ["orders-today"],
    queryFn: async () => {
      const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const todayIST = istNow.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("orders")
        .select("id")
        .gte("created_at", todayIST + "T00:00:00+05:30")
        .lte("created_at", todayIST + "T23:59:59+05:30");
      if (error) throw error;
      return data?.length || 0;
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["orders", id],
    queryFn: async () => {
      if (!id) throw new Error("Order id is required");
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Order;
    },
    enabled: !!id,
  });
}

// Strip balance_due from any payload since it's a generated column
function stripBalanceDue(obj: Record<string, any>) {
  const { balance_due, ...rest } = obj;
  return rest;
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: Omit<OrderInsert, "order_no"> & { lineItems?: { item_no: number; description: string; quantity: number; unit_price: number; amount: number }[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: orderNo, error: noErr } = await supabase.rpc("generate_order_no");
      if (noErr) throw noErr;

      const { lineItems, ...orderFields } = order as any;
      const qty = lineItems
        ? lineItems.reduce((s: number, li: any) => s + (li.quantity || 0), 0)
        : (orderFields.quantity || 1);
      const amt = lineItems
        ? lineItems.reduce((s: number, li: any) => s + (li.amount || 0), 0)
        : (orderFields.amount || 0);

      const insertData = stripBalanceDue({
        ...orderFields,
        order_no: orderNo,
        quantity: qty,
        amount: amt,
        qty_ordered: qty,
        qty_fulfilled: 0,
        qty_pending: qty,
        created_by: user?.id ?? null,
      });

      const { data, error } = await supabase
        .from("orders")
        .insert(insertData as any)
        .select()
        .single();
      if (error) throw error;
      await logAudit("Order created", "order", data.id);

      // Upsert customer
      const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("contact_no", order.contact_no)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("customers")
          .update({
            total_orders: (existing.total_orders || 0) + 1,
            total_spend: (existing.total_spend || 0) + amt,
          })
          .eq("id", existing.id);
      } else if (order.contact_no) {
        const { data: byName } = await supabase
          .from("customers")
          .select("*")
          .eq("name", order.customer_name)
          .maybeSingle();

        if (byName) {
          await supabase
            .from("customers")
            .update({
              total_orders: (byName.total_orders || 0) + 1,
              total_spend: (byName.total_spend || 0) + amt,
            })
            .eq("id", byName.id);
        } else {
          await supabase.from("customers").insert({
            name: order.customer_name,
            contact_no: order.contact_no,
            email: order.email || null,
            total_orders: 1,
            total_spend: amt,
          });
        }
      }

      // Log initial status
      await supabase.from("status_logs").insert({
        order_id: data.id,
        new_status: "Order Received",
        changed_by: "System",
        notes: "Order created",
      });

      // Insert line items and create production jobs
      if (lineItems && lineItems.length > 0) {
        const rows = lineItems.map((li: any) => ({
          order_id: data.id,
          item_no: li.item_no,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          amount: li.amount,
        }));
        const { data: insertedItems, error: itemErr } = await supabase
          .from("order_items")
          .insert(rows as any)
          .select("id, description, quantity");
        if (!itemErr && insertedItems) {
          for (const item of insertedItems as any[]) {
            await createJobForOrderItem(
              item,
              { id: data.id, delivery_date: data.delivery_date, assigned_to: data.assigned_to }
            );
          }
        }
      } else {
        // Legacy single-item fallback
        const desc = [data.product_type, data.size, data.paper_type].filter(Boolean).join(" · ") || data.product_type;
        const { data: orderItems, error: itemErr } = await supabase
          .from("order_items")
          .insert({
            order_id: data.id,
            item_no: 1,
            description: desc,
            quantity: qty,
            unit_price: qty > 0 ? amt / qty : 0,
            amount: amt,
          } as any)
          .select("id, description, quantity");
        if (!itemErr && orderItems?.[0]) {
          await createJobForOrderItem(
            (orderItems as any)[0],
            { id: data.id, delivery_date: data.delivery_date, assigned_to: data.assigned_to }
          );
        } else {
          await createJobForOrder({
            id: data.id,
            order_no: data.order_no,
            product_type: data.product_type,
            quantity: data.quantity,
            delivery_date: data.delivery_date,
            assigned_to: data.assigned_to,
            special_instructions: data.special_instructions,
            size: data.size,
            paper_type: data.paper_type,
            color_mode: data.color_mode,
          });
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-today"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Order created successfully!");
    },
    onError: (err) => toast.error("Failed to create order: " + err.message),
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oldStatus, newStatus, changedBy, notes }: {
      id: string; oldStatus: string; newStatus: string; changedBy?: string; notes?: string;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus as any })
        .eq("id", id);
      if (error) throw error;

      await supabase.from("status_logs").insert({
        order_id: id,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: changedBy || "System",
        notes: notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
      toast.success("Status updated!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Order> & { id: string }) => {
      const cleaned = stripBalanceDue(updates);
      const { error } = await supabase
        .from("orders")
        .update(cleaned as any)
        .eq("id", id);
      if (error) throw error;
      await logAudit("Order updated", "order", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order updated!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-today"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["production_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["order_items"] });
      toast.success("Order deleted!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}

export function useStatusLogs(orderId: string | undefined) {
  return useQuery({
    queryKey: ["status_logs", orderId],
    queryFn: async () => {
      if (!orderId) throw new Error("Order id is required");
      const { data, error } = await supabase
        .from("status_logs")
        .select("*")
        .eq("order_id", orderId)
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });
}
