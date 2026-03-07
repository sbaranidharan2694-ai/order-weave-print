import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PurchaseOrder = {
  id: string;
  po_number: string;
  po_date: string | null;
  vendor_name: string | null;
  contact_no: string | null;
  contact_person: string | null;
  gstin: string | null;
  delivery_address: string | null;
  delivery_date: string | null;
  payment_terms: string | null;
  currency: string;
  total_amount: number;
  tax_amount: number;
  po_file_url: string | null;
  parsed_data: any;
  status: string;
  created_at: string;
};

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PurchaseOrder[];
    },
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (po: Omit<PurchaseOrder, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .insert(po as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
    },
    onError: (err) => toast.error("Failed to create PO: " + err.message),
  });
}

export function useCreatePOLineItems() {
  return useMutation({
    mutationFn: async (items: any[]) => {
      const { data, error } = await supabase
        .from("purchase_order_line_items")
        .insert(items)
        .select();
      if (error) throw error;
      return data;
    },
    onError: (err) => toast.error("Failed to create line items: " + err.message),
  });
}
