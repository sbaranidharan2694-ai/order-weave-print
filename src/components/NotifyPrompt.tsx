import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Mail, Check } from "lucide-react";
import { WHATSAPP_STATUS_TEMPLATES, fillWhatsAppTemplate } from "@/lib/constants";
import { useLogNotification } from "@/hooks/useNotificationLogs";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";
import type { Order } from "@/hooks/useOrders";

interface NotifyPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  status: string;
}

export function NotifyPrompt({ open, onOpenChange, order, status }: NotifyPromptProps) {
  const { data: settings } = useSettings();
  const logNotification = useLogNotification();
  const shopPhone = settings?.contact_number || settings?.whatsapp_number || "9840199878";

  const template = WHATSAPP_STATUS_TEMPLATES[status] || "";
  const [message, setMessage] = useState(() => fillWhatsAppTemplate(template, { ...order, status }, shopPhone));

  const handleWhatsApp = () => {
    const phone = order.contact_no.replace(/\D/g, "").slice(-10);
    const url = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    logNotification.mutate({
      order_id: order.id,
      channel: "whatsapp",
      status_at_send: status,
      message_preview: message.slice(0, 200),
      recipient_phone: order.contact_no,
    });
    toast.success("WhatsApp opened — mark as sent after confirming");
    onOpenChange(false);
  };

  const handleEmail = () => {
    if (!order.email) {
      toast.error("No email on file — use WhatsApp instead");
      return;
    }
    toast.info("Email notification — configure EmailJS in Settings to enable");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notify Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Status updated to <strong>{status}</strong>. Send notification to {order.customer_name}?
          </p>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            {order.email ? (
              <span className="text-success">📧 Email on file</span>
            ) : (
              <span className="text-warning">⚠️ No email — WhatsApp only</span>
            )}
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[120px] text-sm"
          />
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button onClick={handleWhatsApp} className="gap-1 flex-1">
            <MessageCircle className="h-4 w-4" /> Send WhatsApp
          </Button>
          <Button onClick={handleEmail} variant="outline" className="gap-1 flex-1" disabled={!order.email}>
            <Mail className="h-4 w-4" /> Send Email
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="ghost" className="flex-1">
            Skip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
