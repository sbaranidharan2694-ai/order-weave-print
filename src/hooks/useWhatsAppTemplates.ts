import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type WhatsAppTemplate = {
  id: string;
  name: string;
  body: string;
  created_at: string;
};

export function useWhatsAppTemplates() {
  return useQuery({
    queryKey: ["whatsapp_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as WhatsAppTemplate[];
    },
  });
}

export function useCreateWhatsAppTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { name: string; body: string }) => {
      const { error } = await supabase.from("whatsapp_templates").insert(t as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp_templates"] });
      toast.success("Template created!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}

export function useUpdateWhatsAppTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name: string; body: string }) => {
      const { error } = await supabase.from("whatsapp_templates").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp_templates"] });
      toast.success("Template updated!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}

export function useDeleteWhatsAppTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp_templates"] });
      toast.success("Template deleted!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}
