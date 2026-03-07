import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationLog = {
  id: string;
  order_id: string;
  channel: string;
  status_at_send: string | null;
  message_preview: string | null;
  sent_at: string;
  delivery_status: string;
  recipient_phone: string | null;
  recipient_email: string | null;
};

export function useNotificationLogs(orderId: string | undefined) {
  return useQuery({
    queryKey: ["notification_logs", orderId],
    queryFn: async () => {
      if (!orderId) throw new Error("Order id is required");
      const { data, error } = await supabase
        .from("notification_logs")
        .select("*")
        .eq("order_id", orderId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data as NotificationLog[];
    },
    enabled: !!orderId,
  });
}

export function useLogNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (log: {
      order_id: string;
      channel: string;
      status_at_send: string;
      message_preview: string;
      recipient_phone?: string;
      recipient_email?: string;
    }) => {
      const { data, error } = await supabase
        .from("notification_logs")
        .insert(log as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["notification_logs", vars.order_id] });
    },
  });
}
