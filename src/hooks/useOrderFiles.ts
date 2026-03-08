import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OrderFile = {
  id: string;
  order_id: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  storage_url: string; // Now stores the storage path, not public URL
  uploaded_at: string;
  signedUrl?: string; // Generated at read time
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

      // Generate signed URLs for each file (1 hour expiry)
      const filesWithSignedUrls = await Promise.all(
        (data as OrderFile[]).map(async (file) => {
          // Extract storage path from the URL if it's a full URL, or use as-is
          let storagePath = file.storage_url;
          if (storagePath.includes("/order-files/")) {
            storagePath = storagePath.split("/order-files/").pop() || storagePath;
          }
          const { data: signedData } = await supabase.storage
            .from("order-files")
            .createSignedUrl(storagePath, 3600);
          return { ...file, signedUrl: signedData?.signedUrl || "" };
        })
      );

      return filesWithSignedUrls;
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

      // Store only the storage path, not the public URL
      const { error } = await supabase.from("order_files").insert({
        order_id: orderId,
        filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        storage_url: filePath, // Store path only
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
