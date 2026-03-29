import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, X } from "lucide-react";
import { fillOrderCreatedTemplate } from "@/lib/constants";
import { useLogNotification } from "@/hooks/useNotificationLogs";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";
import type { Order } from "@/hooks/useOrders";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  lineItems?: { description: string; quantity: number; amount: number }[];
}

export function OrderCreatedWhatsApp({ open, onOpenChange, order, lineItems }: Props) {
  const { data: settings } = useSettings();
  const logNotification = useLogNotification();
  const shopPhone = settings?.contact_number || settings?.whatsapp_number || "9840199878";

  const [message, setMessage] = useState(() =>
    fillOrderCreatedTemplate(order, shopPhone, lineItems)
  );

  const handleSend = () => {
    const phone = (order.contact_no || "").replace(/\D/g, "").slice(-10);
    if (!phone) {
      toast.error("No phone number on this order — add one to send WhatsApp.");
      return;
    }
    const url = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    logNotification.mutate({
      order_id: order.id,
      channel: "whatsapp",
      status_at_send: "Order Received",
      message_preview: message.slice(0, 200),
      recipient_phone: order.contact_no || "",
    });
    toast.success("WhatsApp opened — confirm delivery to customer.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-500" />
            Send Order Confirmation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Order <strong>{order.order_no}</strong> created! Send confirmation to{" "}
            <strong>{order.customer_name}</strong>?
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[200px] text-sm font-mono"
          />
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button onClick={handleSend} className="gap-2 flex-1 bg-green-600 hover:bg-green-700">
            <MessageCircle className="h-4 w-4" /> Send WhatsApp
          </Button>
          <Button onClick={() => onOpenChange(false)} variant="outline" className="gap-2 flex-1">
            <X className="h-4 w-4" /> Skip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
