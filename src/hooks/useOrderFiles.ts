import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OrderFile = {
  id: string;
  order_id: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  storage_url: string;
  uploaded_at: string;
};

export function useOrderFiles(orderId?: string) {
  return useQuery({
    queryKey: ["order_files", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_files")
        .select("*")
        .eq("order_id", orderId!)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as OrderFile[];
    },
    enabled: !!orderId,
  });
}

export function useUploadOrderFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, file }: { orderId: string; file: File }) => {
      const filePath = `${orderId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("order-files")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("order-files")
        .getPublicUrl(filePath);

      const { error } = await supabase.from("order_files").insert({
        order_id: orderId,
        filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        storage_url: publicUrl,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order_files"] });
      toast.success("File uploaded!");
    },
    onError: (err) => toast.error("Upload failed: " + err.message),
  });
}

export function useDeleteOrderFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_files").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order_files"] });
      toast.success("File removed!");
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });
}
