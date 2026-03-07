import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductType = {
  id: string;
  name: string;
  default_size: string | null;
  default_color_mode: string | null;
  default_paper_type: string | null;
  whatsapp_template_body: string | null;
  hsn_code: string | null;
  created_at: string;
};

export function useProductTypes() {
  return useQuery({
    queryKey: ["product_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ProductType[];
    },
  });
}
