import { useState, useMemo } from "react";
import { useOrders, useUpdateOrderStatus, type Order } from "@/hooks/useOrders";
import { useLogNotification } from "@/hooks/useNotificationLogs";
import { useSettings } from "@/hooks/useSettings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ORDER_STATUSES, STATUS_EMOJIS, WHATSAPP_STATUS_TEMPLATES, fillWhatsAppTemplate } from "@/lib/constants";
import { Search, MessageCircle, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickStatusModal({ open, onOpenChange }: Props) {
  const { data: orders = [] } = useOrders();
  const { data: settings } = useSettings();
  const updateStatus = useUpdateOrderStatus();
  const logNotification = useLogNotification();
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [step, setStep] = useState<"search" | "status" | "notify">("search");

  const filtered = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return orders
      .filter(o => o.status !== "Delivered" && o.status !== "Cancelled")
      .filter(o =>
        o.order_no.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.contact_no.includes(q)
      )
      .slice(0, 8);
  }, [orders, search]);

  const shopPhone = settings?.contact_number || settings?.whatsapp_number || "9840199878";

  const handleSelectOrder = (order: Order) => {
    setSelectedOrder(order);
    setStep("status");
  };

  const handleStatusSelect = async (status: string) => {
    if (!selectedOrder) return;
    setNewStatus(status);
    await updateStatus.mutateAsync({
      id: selectedOrder.id,
      oldStatus: selectedOrder.status,
      newStatus: status,
    });
    setStep("notify");
  };

  const handleNotify = (channel: "whatsapp" | "email" | "both" | "skip") => {
    if (!selectedOrder || !newStatus) return;

    if (channel === "whatsapp" || channel === "both") {
      const template = WHATSAPP_STATUS_TEMPLATES[newStatus] || "";
      const msg = fillWhatsAppTemplate(template, { ...selectedOrder, status: newStatus } as any, shopPhone);
      const safeMsg = unescape(encodeURIComponent(msg));
      const url = `https://wa.me/91${selectedOrder.contact_no.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(safeMsg)}`;
      window.open(url, "_blank");
      logNotification.mutate({
        order_id: selectedOrder.id,
        channel: "whatsapp",
        status_at_send: newStatus,
        message_preview: msg.slice(0, 200),
        recipient_phone: selectedOrder.contact_no,
      });
    }

    if (channel === "email" || channel === "both") {
      if (!selectedOrder.email) {
        toast.error("No email on file for this customer");
      } else {
        toast.info("Email notification — configure EmailJS in Settings");
      }
    }

    toast.success(`Status updated to ${newStatus}`);
    resetAndClose();
  };

  const resetAndClose = () => {
    setSearch("");
    setSelectedOrder(null);
    setNewStatus("");
    setStep("search");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⚡ Quick Status Update
          </DialogTitle>
        </DialogHeader>

        {step === "search" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order #, customer name, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.map((o) => (
                <button
                  key={o.id}
                  onClick={() => handleSelectOrder(o)}
                  className="w-full text-left p-3 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">{o.order_no}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {o.customer_name} · {o.product_type}
                  </p>
                </button>
              ))}
              {search && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No orders found</p>
              )}
            </div>
          </div>
        )}

        {step === "status" && selectedOrder && (
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">{selectedOrder.order_no}</span>
                <StatusBadge status={selectedOrder.status} />
              </div>
              <p className="text-sm text-muted-foreground">{selectedOrder.customer_name}</p>
            </div>
            <p className="text-sm font-medium">Move to:</p>
            <div className="grid grid-cols-2 gap-2">
              {ORDER_STATUSES.filter(s => s !== selectedOrder.status).map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs h-9"
                  onClick={() => handleStatusSelect(s)}
                  disabled={updateStatus.isPending}
                >
                  <span className="mr-1">{STATUS_EMOJIS[s]}</span> {s}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setStep("search"); setSelectedOrder(null); }}>
              ← Back to search
            </Button>
          </div>
        )}

        {step === "notify" && selectedOrder && (
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="text-lg font-semibold">✅ Status updated!</p>
              <p className="text-sm text-muted-foreground">
                {selectedOrder.order_no} → {newStatus}
              </p>
            </div>
            <p className="text-sm font-medium text-center">Notify {selectedOrder.customer_name}?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => handleNotify("whatsapp")} className="gap-1">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </Button>
              <Button onClick={() => handleNotify("email")} variant="outline" className="gap-1">
                <Mail className="h-4 w-4" /> Email
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleNotify("both")} variant="secondary" className="flex-1 gap-1">
                Both
              </Button>
              <Button onClick={() => handleNotify("skip")} variant="ghost" className="flex-1">
                Skip
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
