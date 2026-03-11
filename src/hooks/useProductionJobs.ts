import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type ProductionJob = Tables<"production_jobs">;
export type ProductionJobInsert = TablesInsert<"production_jobs">;

export type ProductionJobsFilters = {
  status?: string;
  assigned_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  order_no?: string;
};

export type ProductionJobWithOrder = ProductionJob & {
  orders: {
    order_no: string;
    customer_name: string;
    delivery_date: string;
    product_type: string;
    po_number: string | null;
    paper_type?: string | null;
    color_mode?: string | null;
    special_instructions?: string | null;
  } | null;
};

/** Fetch all production jobs with order info, optionally filtered */
export function useProductionJobs(filters?: ProductionJobsFilters) {
  return useQuery({
    queryKey: ["production_jobs", filters],
    queryFn: async () => {
      let q = supabase
        .from("production_jobs")
        .select("*, orders(order_no, customer_name, delivery_date, product_type, po_number, paper_type, color_mode, special_instructions)")
        .order("created_at", { ascending: false });
      if (filters?.status) q = q.eq("status", filters.status);
      if (filters?.assigned_to) q = q.eq("assigned_to", filters.assigned_to);
      if (filters?.due_date_from) q = q.gte("due_date", filters.due_date_from);
      if (filters?.due_date_to) q = q.lte("due_date", filters.due_date_to);
      if (filters?.order_no) {
        const { data: ord } = await supabase.from("orders").select("id").eq("order_no", filters.order_no!).single();
        if (ord) q = q.eq("order_id", ord.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      const list = (data || []) as ProductionJobWithOrder[];
      return list;
    },
  });
}

/** Fetch jobs for a single order */
export function useProductionJobsByOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ["production_jobs", "order", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("production_jobs")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ProductionJob[];
    },
    enabled: !!orderId,
  });
}
/** Create a production job (used after order create). Returns the created job or null. */
export async function createJobForOrder(
  order: {
    id: string;
    order_no: string;
    product_type: string;
    quantity: number;
    delivery_date: string;
    assigned_to?: string | null;
    special_instructions?: string | null;
    size?: string | null;
    paper_type?: string | null;
    color_mode?: string | null;
  }
): Promise<ProductionJob | null> {
  const { data: jobNumber, error: rpcErr } = await supabase.rpc("generate_job_number");
  if (rpcErr || !jobNumber) {
    console.warn("generate_job_number failed", rpcErr);
    return null;
  }
  const description = [order.product_type, order.size, order.paper_type].filter(Boolean).join(" · ") || order.product_type;
  const insert: ProductionJobInsert = {
    order_id: order.id,
    job_number: jobNumber,
    description,
    quantity: order.quantity,
    status: "design_review",
    assigned_to: order.assigned_to ?? null,
    priority: "normal",
    due_date: order.delivery_date,
  };
  const { data, error } = await supabase.from("production_jobs").insert(insert).select().single();
  if (error) {
    console.warn("production_jobs insert failed", error);
    return null;
  }
  return data as ProductionJob;
}

export function useCreateProductionJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: Parameters<typeof createJobForOrder>[0]) => createJobForOrder(order),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["production_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["production_jobs", "order", variables.id] });
    },
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from("production_jobs")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      const job = data as ProductionJob;
      if (status === "ready_dispatch") {
        await maybeUpdateOrderWhenAllJobsReady(job.order_id);
      }
      return job;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["production_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["production_jobs", "order", data.order_id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", data.order_id] });
      toast.success("Job status updated");
    },
    onError: (err) => toast.error("Failed to update status: " + err.message),
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      assigned_to,
      priority,
      due_date,
    }: {
      id: string;
      assigned_to?: string | null;
      priority?: string | null;
      due_date?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (assigned_to !== undefined) updates.assigned_to = assigned_to;
      if (priority !== undefined) updates.priority = priority;
      if (due_date !== undefined) updates.due_date = due_date;
      const { data, error } = await supabase
        .from("production_jobs")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ProductionJob;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["production_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["production_jobs", "order", data.order_id] });
      toast.success("Job updated");
    },
    onError: (err) => toast.error("Failed to update job: " + err.message),
  });
}

/** Find orders that don't have a production job yet (for validation/backfill) */
export async function getOrdersWithoutJobs(): Promise<{ id: string; order_no: string; product_type: string; quantity: number; delivery_date: string; assigned_to: string | null; size: string | null; paper_type: string | null; special_instructions: string | null; color_mode: string | null }[]> {
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, order_no, product_type, quantity, delivery_date, assigned_to, size, paper_type, special_instructions, color_mode");
  if (ordersErr || !orders?.length) return [];
  const { data: jobs, error: jobsErr } = await supabase.from("production_jobs").select("order_id");
  if (jobsErr) return orders as any[];
  const orderIdsWithJobs = new Set((jobs || []).map((j) => j.order_id));
  return (orders || []).filter((o) => !orderIdsWithJobs.has(o.id)) as any[];
}

/** Create production jobs for all orders that don't have one (backfill for current data) */
export async function backfillProductionJobs(): Promise<{ created: number; failed: number }> {
  const ordersWithoutJobs = await getOrdersWithoutJobs();
  let created = 0;
  let failed = 0;
  for (const order of ordersWithoutJobs) {
    const job = await createJobForOrder({
      id: order.id,
      order_no: order.order_no,
      product_type: order.product_type || "Order",
      quantity: order.quantity ?? 1,
      delivery_date: order.delivery_date,
      assigned_to: order.assigned_to,
      special_instructions: order.special_instructions,
      size: order.size,
      paper_type: order.paper_type,
      color_mode: order.color_mode,
    });
    if (job) created++;
    else failed++;
  }
  return { created, failed };
}

export function useOrdersWithoutJobs() {
  return useQuery({
    queryKey: ["orders_without_jobs"],
    queryFn: getOrdersWithoutJobs,
  });
}

export function useBackfillProductionJobs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: backfillProductionJobs,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["production_jobs"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders_without_jobs"] });
      toast.success(`Created ${result.created} job(s) for existing orders.${result.failed ? ` ${result.failed} failed.` : ""}`);
    },
    onError: (err) => toast.error("Backfill failed: " + (err as Error).message),
  });
}

/** Check if all jobs for an order are ready_dispatch and optionally update order status */
export async function maybeUpdateOrderWhenAllJobsReady(orderId: string): Promise<boolean> {
  const { data: jobs, error: fetchErr } = await supabase
    .from("production_jobs")
    .select("id, status")
    .eq("order_id", orderId);
  if (fetchErr || !jobs?.length) return false;
  const allReady = jobs.every((j) => j.status === "ready_dispatch");
  if (!allReady) return false;
  const { error: updateErr } = await supabase
    .from("orders")
    .update({ status: "Ready to Dispatch" })
    .eq("id", orderId);
  if (updateErr) return false;
  return true;
}
