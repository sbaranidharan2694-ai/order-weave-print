import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TAG_COLORS: Record<string, string> = {
  "Urgent": "bg-destructive text-destructive-foreground",
  "VIP": "bg-amber-400 text-amber-950",
  "Proof Required": "bg-status-received text-white",
  "Rush": "bg-orange-500 text-white",
  "From PO": "bg-teal-500 text-white",
};

export const AVAILABLE_TAGS = ["Urgent", "VIP", "Proof Required", "Rush", "From PO"];

export function useOrderTags(orderId?: string) {
  return useQuery({
    queryKey: ["order_tags", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_tags")
        .select("*")
        .eq("order_id", orderId!);
      if (error) throw error;
      return data as { id: string; order_id: string; tag_name: string }[];
    },
    enabled: !!orderId,
  });
}

export function useAllOrderTags() {
  return useQuery({
    queryKey: ["order_tags_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_tags")
        .select("*");
      if (error) throw error;
      return data as { id: string; order_id: string; tag_name: string }[];
    },
  });
}

export function useSaveOrderTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, tags }: { orderId: string; tags: string[] }) => {
      await supabase.from("order_tags").delete().eq("order_id", orderId);
      if (tags.length > 0) {
        const { error } = await supabase
          .from("order_tags")
          .insert(tags.map(t => ({ order_id: orderId, tag_name: t })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order_tags"] });
      qc.invalidateQueries({ queryKey: ["order_tags_all"] });
    },
  });
}
