import { useParams, useNavigate } from "react-router-dom";
import { useOrder, useStatusLogs, useUpdateOrderStatus, useCreateOrder } from "@/hooks/useOrders";
import { useFulfillments, useAddFulfillment, useDeleteFulfillment } from "@/hooks/useFulfillments";
import { useNotificationLogs, useLogNotification } from "@/hooks/useNotificationLogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { NotifyPrompt } from "@/components/NotifyPrompt";
import { ORDER_STATUSES, STATUS_EMOJIS, WHATSAPP_STATUS_TEMPLATES, fillWhatsAppTemplate } from "@/lib/constants";
import { useSettings } from "@/hooks/useSettings";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { MessageCircle, Mail, Pencil, Printer, ArrowLeft, Copy, Plus, Trash2, Bell, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { STATUS_TEXT_COLORS } from "@/lib/constants";
import { toast } from "sonner";
import { numberToWords } from "@/lib/numberToWords";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const formatContact = (phone: string) => phone.replace(/\D/g, "").slice(-10);

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, isError } = useOrder(id);
  const { data: logs = [] } = useStatusLogs(id);
  const { data: settings } = useSettings();
  const { data: fulfillments = [] } = useFulfillments(id);
  const { data: notifLogs = [] } = useNotificationLogs(id);
  const logNotification = useLogNotification();
  const addFulfillment = useAddFulfillment();
  const deleteFulfillment = useDeleteFulfillment();
  const updateStatus = useUpdateOrderStatus();
  const createOrder = useCreateOrder();

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [clickedStatus, setClickedStatus] = useState<string | null>(null);
  const [showNotifyPrompt, setShowNotifyPrompt] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState("");
  const [showFulfillmentForm, setShowFulfillmentForm] = useState(false);
  const [fulfillmentForm, setFulfillmentForm] = useState({
    fulfillment_date: format(new Date(), "yyyy-MM-dd"),
    qty_delivered: "",
    delivered_by: "",
    delivery_note: "",
  });

  if (!id) return null;
  if (isError && !isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in text-center py-12">
        <h2 className="text-xl font-semibold text-foreground">Order not found</h2>
        <p className="text-muted-foreground">The order you are looking for may have been deleted or the link is invalid.</p>
        <Button variant="default" onClick={() => navigate("/orders")}>Back to Orders</Button>
      </div>
    );
  }
  if (isLoading || !order) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const currentIdx = ORDER_STATUSES.indexOf(order.status);
  const balanceDue = Number(order.amount) - Number(order.advance_paid);
  const poNumber = order.po_number;
  const hsnCode = order.hsn_code;
  const gstin = order.gstin;
  const poContactPerson = order.po_contact_person;
  const baseAmount = Number(order.base_amount) || 0;
  const cgstAmount = Number(order.cgst_amount) || 0;
  const sgstAmount = Number(order.sgst_amount) || 0;
  const igstAmount = Number(order.igst_amount) || 0;
  const totalTax = Number(order.total_tax_amount) || 0;
  const hasTaxBreakdown = baseAmount > 0 || totalTax > 0;
  const qtyOrdered = Number(order.qty_ordered) || order.quantity;
  const qtyFulfilled = Number(order.qty_fulfilled) || 0;
  const qtyPending = qtyOrdered - qtyFulfilled;
  const fulfillmentPct = qtyOrdered > 0 ? Math.round((qtyFulfilled / qtyOrdered) * 100) : 0;
  const operators = settings?.operator_names || [];
  const shopPhone = settings?.contact_number || settings?.whatsapp_number || "9840199878";

  // Next logical status
  const nextStatusIdx = currentIdx + 1;
  const nextStatus = nextStatusIdx < ORDER_STATUSES.length ? ORDER_STATUSES[nextStatusIdx] : null;

  const handleStatusChange = async () => {
    if (!newStatus) return;
    await updateStatus.mutateAsync({
      id: order.id, oldStatus: order.status, newStatus, notes: statusNotes,
    });
    setShowStatusModal(false);
    setNotifyStatus(newStatus);
    setShowNotifyPrompt(true);
    setNewStatus("");
    setStatusNotes("");
  };

  const handleStatusClick = (status: string) => {
    if (status === order.status) return;
    setClickedStatus(status);
    setNewStatus(status);
  };

  const confirmStatusClick = async () => {
    if (!clickedStatus) return;
    await updateStatus.mutateAsync({
      id: order.id, oldStatus: order.status, newStatus: clickedStatus,
    });
    setNotifyStatus(clickedStatus);
    setShowNotifyPrompt(true);
    setClickedStatus(null);
  };

  const handleNextStatus = async () => {
    if (!nextStatus) return;
    await updateStatus.mutateAsync({
      id: order.id, oldStatus: order.status, newStatus: nextStatus,
    });
    setNotifyStatus(nextStatus);
    setShowNotifyPrompt(true);
  };

  const handleDuplicate = async () => {
    try {
      await createOrder.mutateAsync({
        customer_name: order.customer_name, contact_no: order.contact_no, email: order.email,
        source: order.source, product_type: order.product_type, quantity: order.quantity,
        size: order.size, color_mode: order.color_mode, paper_type: order.paper_type,
        special_instructions: order.special_instructions, order_date: format(new Date(), "yyyy-MM-dd"),
        delivery_date: order.delivery_date, amount: order.amount, advance_paid: 0,
        assigned_to: order.assigned_to, gstin, hsn_code: hsnCode, po_number: poNumber,
      });
      toast.success("Order duplicated!");
      navigate("/orders");
    } catch {
      // Ignore duplicate/create errors
    }
  };

  const handleSaveFulfillment = async () => {
    const qty = parseInt(fulfillmentForm.qty_delivered) || 0;
    if (qty <= 0) { toast.error("Qty must be > 0"); return; }
    if (qty > qtyPending) { toast.error(`Cannot deliver more than pending qty (${qtyPending})`); return; }
    await addFulfillment.mutateAsync({
      order_id: order.id, fulfillment_date: fulfillmentForm.fulfillment_date,
      qty_delivered: qty, delivered_by: fulfillmentForm.delivered_by || undefined,
      delivery_note: fulfillmentForm.delivery_note || undefined,
    });
    const newPending = qtyPending - qty;
    if (newPending === 0) {
      toast("All qty fulfilled! Mark as Delivered?", {
        action: { label: "Yes, Deliver", onClick: () => updateStatus.mutate({ id: order.id, oldStatus: order.status, newStatus: "Delivered", notes: "All quantities fulfilled" }) },
      });
    }
    setShowFulfillmentForm(false);
    setFulfillmentForm({ fulfillment_date: format(new Date(), "yyyy-MM-dd"), qty_delivered: "", delivered_by: "", delivery_note: "" });
  };

  const handleWhatsAppNow = () => {
    const template = WHATSAPP_STATUS_TEMPLATES[order.status] || "";
    const msg = fillWhatsAppTemplate(template, order, shopPhone);
    const safeMsg = unescape(encodeURIComponent(msg));
    const url = `https://wa.me/91${formatContact(order.contact_no)}?text=${encodeURIComponent(safeMsg)}`;
    window.open(url, "_blank");
    logNotification.mutate({
      order_id: order.id, channel: "whatsapp", status_at_send: order.status,
      message_preview: msg.slice(0, 200), recipient_phone: order.contact_no,
    });
    toast.success("WhatsApp opened");
  };

  const handlePrint = () => {
    const businessName = settings?.business_name || "Super Printers";
    const businessAddr = settings?.business_address || "";
    const businessGstin = settings?.gstin || "";
    const bankName = settings?.bank_name || "";
    const bankAccName = settings?.bank_account_name || "";
    const bankAccNo = settings?.bank_account_number || "";
    const bankIfsc = settings?.bank_ifsc || "";
    const invoiceFooter = settings?.invoice_footer || "";
    const showGst = settings?.show_gst_breakdown !== false;
    const businessStateCode = businessGstin ? businessGstin.substring(0, 2) : "";
    const customerStateCode = gstin ? gstin.substring(0, 2) : "";
    const isInterState = businessStateCode && customerStateCode && businessStateCode !== customerStateCode;
    let taxableAmount = baseAmount > 0 ? baseAmount : Number(order.amount);
    let displayCgst = cgstAmount, displaySgst = sgstAmount, displayIgst = igstAmount, displayTotalTax = totalTax;
    if (!hasTaxBreakdown && showGst && Number(order.amount) > 0) {
      const gstRate = 18;
      taxableAmount = Number(order.amount) / (1 + gstRate / 100);
      displayTotalTax = Number(order.amount) - taxableAmount;
      if (isInterState) { displayIgst = displayTotalTax; } else { displayCgst = displayTotalTax / 2; displaySgst = displayTotalTax / 2; }
    }
    const unitRate = order.quantity > 0 ? taxableAmount / order.quantity : taxableAmount;
    const grandTotal = Number(order.amount);
    const grandTotalWords = numberToWords(grandTotal);
    const html = `
      <html><head><title>Invoice - ${order.order_no}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 30px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #F4A100; padding-bottom: 15px; }
        .header h1 { color: #1B2B4B; margin: 0; font-size: 24px; }
        .header p { color: #666; margin: 3px 0; font-size: 12px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .info-box { padding: 12px; border: 1px solid #eee; border-radius: 6px; }
        .info-box h3 { margin: 0 0 8px 0; font-size: 12px; color: #666; text-transform: uppercase; }
        .info-box p { margin: 2px 0; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f8f9fa; padding: 10px; text-align: left; font-size: 12px; color: #555; border-bottom: 2px solid #ddd; }
        td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
        .total-section { text-align: right; margin: 20px 0; }
        .total-row { display: flex; justify-content: flex-end; gap: 30px; padding: 4px 0; font-size: 13px; }
        .total-row.grand { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 8px; }
        .words { font-size: 12px; color: #555; text-align: right; margin-top: 4px; font-style: italic; }
        .bank-details { margin: 20px 0; padding: 12px; background: #f8f9fa; border-radius: 6px; font-size: 12px; }
        .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
        @media print { body { padding: 15px; } }
      </style></head><body>
      <div class="header">
        <h1>${businessName}</h1>
        ${businessAddr ? `<p>${businessAddr}</p>` : ""}
        ${businessGstin ? `<p>GSTIN: ${businessGstin}</p>` : ""}
        <p style="font-weight:bold; margin-top:8px;">TAX INVOICE</p>
      </div>
      <div class="info-grid">
        <div class="info-box"><h3>Invoice Details</h3>
          <p><strong>Invoice No:</strong> ${order.order_no}</p>
          <p><strong>Date:</strong> ${format(parseISO(order.order_date), "dd MMM yyyy")}</p>
          <p><strong>Due Date:</strong> ${format(parseISO(order.delivery_date), "dd MMM yyyy")}</p>
          ${poNumber ? `<p><strong>PO Ref:</strong> ${poNumber}</p>` : ""}
        </div>
        <div class="info-box"><h3>Bill To</h3>
          <p><strong>${order.customer_name}</strong></p>
          <p>${formatContact(order.contact_no)}</p>
          ${gstin ? `<p>GSTIN: ${gstin}</p>` : ""}
        </div>
      </div>
      <table><thead><tr><th>#</th><th>Description</th>${hsnCode ? "<th>HSN</th>" : ""}<th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody><tr><td>1</td><td>${order.product_type}${order.special_instructions ? "<br><small style='color:#888'>" + order.special_instructions + "</small>" : ""}</td>
      ${hsnCode ? `<td>${hsnCode}</td>` : ""}<td>${order.quantity}</td><td>₹${unitRate.toFixed(2)}</td><td>₹${taxableAmount.toFixed(2)}</td></tr></tbody></table>
      <div class="total-section">
        ${showGst ? `<div class="total-row"><span>Taxable Amount:</span><span>₹${taxableAmount.toFixed(2)}</span></div>
        ${isInterState ? `<div class="total-row"><span>IGST (18%):</span><span>₹${displayIgst.toFixed(2)}</span></div>` :
        `<div class="total-row"><span>CGST (9%):</span><span>₹${displayCgst.toFixed(2)}</span></div><div class="total-row"><span>SGST (9%):</span><span>₹${displaySgst.toFixed(2)}</span></div>`}` : ""}
        <div class="total-row grand"><span>Grand Total:</span><span>₹${grandTotal.toLocaleString("en-IN")}</span></div>
        <p class="words">${grandTotalWords}</p>
        ${Number(order.advance_paid) > 0 ? `<div class="total-row"><span>Advance Paid:</span><span>₹${Number(order.advance_paid).toLocaleString("en-IN")}</span></div>` : ""}
        ${balanceDue > 0 ? `<div class="total-row" style="color:#ef4444"><span>Balance Due:</span><span>₹${balanceDue.toLocaleString("en-IN")}</span></div>` : ""}
      </div>
      ${bankName ? `<div class="bank-details"><strong>Bank Details:</strong><br>${bankAccName ? `A/C Name: ${bankAccName}<br>` : ""}A/C No: ${bankAccNo}<br>IFSC: ${bankIfsc}<br>Bank: ${bankName}</div>` : ""}
      ${invoiceFooter ? `<div class="footer">${invoiceFooter}</div>` : ""}
      <script>window.print();</script></body></html>
    `;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  // Get last notification info
  const lastNotif = notifLogs[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold text-foreground">{order.order_no}</h1>
        <StatusBadge status={order.status} />
      </div>

      {/* Status Update Panel - Most Prominent */}
      <Card className="shadow-card rounded-2xl border-secondary/30 bg-secondary/5">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="text-center sm:text-left flex-1">
              <p className="text-sm text-muted-foreground">Current Status</p>
              <p className="text-2xl font-bold mt-1">
                {STATUS_EMOJIS[order.status]} {order.status}
              </p>
            </div>
            {nextStatus && nextStatus !== "Cancelled" && (
              <Button size="lg" onClick={handleNextStatus} className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
                Move to: {STATUS_EMOJIS[nextStatus]} {nextStatus}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status Timeline */}
      <Card className="shadow-card rounded-2xl">
        <CardHeader><CardTitle className="text-sm">Order Progress</CardTitle></CardHeader>
        <CardContent>
          <div className="flex overflow-x-auto gap-1 pb-2">
            {ORDER_STATUSES.filter(s => s !== "Cancelled").map((s, i) => {
              const isActive = i <= currentIdx && order.status !== "Cancelled";
              const isCurrent = s === order.status;
              // Check if this status was notified
              const wasNotified = notifLogs.some(n => n.status_at_send === s);
              return (
                <button
                  key={s}
                  onClick={() => handleStatusClick(s)}
                  className="flex flex-col items-center min-w-[80px] flex-shrink-0 group cursor-pointer"
                >
                  <div className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors group-hover:border-secondary",
                    isCurrent ? "bg-secondary border-secondary text-secondary-foreground" :
                    isActive ? "bg-secondary/20 border-secondary/40 text-secondary" :
                    "bg-muted border-border text-muted-foreground"
                  )}>
                    {STATUS_EMOJIS[s] || (i + 1)}
                  </div>
                  <span className={cn("text-[10px] mt-1 text-center leading-tight", isCurrent && "font-bold text-secondary")}>
                    {s}
                  </span>
                  {wasNotified && (
                    <span className="text-[8px] text-success mt-0.5">✓ Notified</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Order Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-card rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Order Information</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Customer" value={order.customer_name} />
            <Row label="Contact">
              <a href={`tel:${order.contact_no}`} className="text-secondary hover:underline">{formatContact(order.contact_no)}</a>
            </Row>
            <Row label="WhatsApp">
              <a href={`https://wa.me/91${formatContact(order.contact_no)}`} target="_blank" className="text-source-whatsapp hover:underline flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> {formatContact(order.contact_no)}
              </a>
            </Row>
            <Row label="Email">
              {order.email ? (
                <a href={`mailto:${order.email}`} className="text-secondary hover:underline">{order.email}</a>
              ) : (
                <span className="text-warning text-xs">⚠️ No email on file</span>
              )}
            </Row>
            {gstin && <Row label="GSTIN" value={gstin} />}
            <Row label="Source"><SourceBadge source={order.source} /></Row>
            <Row label="Product" value={order.product_type} />
            <Row label="Quantity" value={String(order.quantity)} />
            <Row label="Size" value={order.size || "—"} />
            <Row label="Color Mode" value={order.color_mode.replace("_", " ")} />
            <Row label="Paper" value={order.paper_type || "—"} />
            {hsnCode && <Row label="HSN Code" value={hsnCode} />}
            {poNumber && <Row label="PO Number" value={poNumber} />}
            {poContactPerson && <Row label="PO Contact" value={poContactPerson} />}
            <Row label="Assigned To" value={order.assigned_to || "—"} />
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Payment & Dates</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Order Date" value={format(parseISO(order.order_date), "dd MMM yyyy")} />
            <Row label="Delivery Date" value={format(parseISO(order.delivery_date), "dd MMM yyyy")} />
            {hasTaxBreakdown ? (
              <>
                <Row label="Base Amount" value={`₹${baseAmount.toLocaleString("en-IN")}`} />
                {cgstAmount > 0 && <Row label={`CGST (${order.cgst_percent ?? 9}%)`} value={`₹${cgstAmount.toLocaleString("en-IN")}`} />}
                {sgstAmount > 0 && <Row label={`SGST (${order.sgst_percent ?? 9}%)`} value={`₹${sgstAmount.toLocaleString("en-IN")}`} />}
                {igstAmount > 0 && <Row label={`IGST (${order.igst_percent ?? 18}%)`} value={`₹${igstAmount.toLocaleString("en-IN")}`} />}
                <Row label="Total Tax" value={`₹${totalTax.toLocaleString("en-IN")}`} />
              </>
            ) : null}
            <Row label="Amount (Grand Total)" value={Number(order.amount) ? `₹${Number(order.amount).toLocaleString("en-IN")}` : "—"} />
            <Row label="Advance Paid" value={Number(order.advance_paid) > 0 ? `₹${Number(order.advance_paid).toLocaleString("en-IN")}` : "—"} />
            <Row label="Balance Due" value={balanceDue > 0 ? `₹${balanceDue.toLocaleString("en-IN")}` : "—"} className={balanceDue > 0 ? "font-bold text-destructive" : "text-foreground"} />
            {order.special_instructions && <Row label="Instructions" value={order.special_instructions} />}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setShowStatusModal(true)}>Change Status</Button>
        <Button variant="outline" onClick={() => navigate(`/orders/${order.id}/edit`)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
        <Button variant="outline" onClick={handleWhatsAppNow} className="gap-1">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </Button>
        <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />Print Invoice</Button>
        <Button variant="outline" onClick={handleDuplicate}><Copy className="h-4 w-4 mr-1" />Duplicate</Button>
      </div>

      {/* Notification Center */}
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" /> Customer Communications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastNotif && (
            <div className="flex items-center gap-2 text-sm p-2 bg-success/10 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>Last: {lastNotif.channel === "whatsapp" ? "📱 WhatsApp" : "📧 Email"} · {lastNotif.status_at_send}</span>
              <span className="text-muted-foreground">· {formatDistanceToNow(parseISO(lastNotif.sent_at), { addSuffix: true })}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button onClick={handleWhatsAppNow} variant="outline" className="gap-2 h-auto py-3">
              <MessageCircle className="h-5 w-5 text-source-whatsapp" />
              <div className="text-left">
                <p className="font-semibold text-sm">Send WhatsApp</p>
                <p className="text-xs text-muted-foreground">{order.customer_name} · {formatContact(order.contact_no)}</p>
              </div>
            </Button>
            <Button variant="outline" className="gap-2 h-auto py-3" disabled={!order.email} onClick={() => toast.info("Configure EmailJS in Settings")}>
              <Mail className="h-5 w-5 text-status-received" />
              <div className="text-left">
                <p className="font-semibold text-sm">Send Email</p>
                <p className="text-xs text-muted-foreground">
                  {order.email || "⚠️ No email on file"}
                </p>
              </div>
            </Button>
          </div>

          {notifLogs.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="text-xs text-secondary hover:underline flex items-center gap-1">
                <Clock className="h-3 w-3" /> View notification log ({notifLogs.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 text-muted-foreground">Channel</th>
                        <th className="text-left p-2 text-muted-foreground">Status</th>
                        <th className="text-left p-2 text-muted-foreground">Preview</th>
                        <th className="text-left p-2 text-muted-foreground">Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notifLogs.map((n) => (
                        <tr key={n.id} className="border-b">
                          <td className="p-2">{n.channel === "whatsapp" ? "📱" : "📧"} {n.channel}</td>
                          <td className="p-2">{n.status_at_send}</td>
                          <td className="p-2 max-w-[200px] truncate text-muted-foreground">{n.message_preview}</td>
                          <td className="p-2 text-muted-foreground whitespace-nowrap">{format(parseISO(n.sent_at), "dd MMM, HH:mm")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Fulfillment Tracker */}
      <Card className="shadow-card rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            Fulfillment Tracker
            <Button size="sm" variant="outline" onClick={() => setShowFulfillmentForm(true)}>
              <Plus className="h-3 w-3 mr-1" /> Record Delivery
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted rounded-xl">
              <p className="text-2xl font-bold text-foreground">{qtyOrdered.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Ordered</p>
            </div>
            <div className="text-center p-3 bg-success/10 rounded-xl">
              <p className="text-2xl font-bold text-success">{qtyFulfilled.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Fulfilled</p>
            </div>
            <div className="text-center p-3 bg-warning/10 rounded-xl">
              <p className="text-2xl font-bold text-warning">{Math.max(0, qtyPending).toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
          <div className="relative">
            <Progress value={fulfillmentPct} className="h-6" />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary-foreground">{fulfillmentPct}%</span>
          </div>
          {fulfillments.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Qty</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">By</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">Note</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {fulfillments.map((f) => (
                  <tr key={f.id} className="border-b">
                    <td className="p-2">{format(parseISO(f.fulfillment_date), "dd MMM yyyy")}</td>
                    <td className="p-2 font-semibold">{f.qty_delivered.toLocaleString("en-IN")}</td>
                    <td className="p-2 text-muted-foreground">{f.delivered_by || "—"}</td>
                    <td className="p-2 text-muted-foreground">{f.delivery_note || "—"}</td>
                    <td className="p-2">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteFulfillment.mutate({ id: f.id, orderId: order.id })}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {showFulfillmentForm && (
            <div className="p-4 border rounded-xl space-y-3 bg-muted/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label className="text-xs">Fulfillment Date</Label><Input type="date" value={fulfillmentForm.fulfillment_date} onChange={(e) => setFulfillmentForm(f => ({ ...f, fulfillment_date: e.target.value }))} /></div>
                <div><Label className="text-xs">Qty Delivered *</Label><Input type="number" min={1} max={qtyPending} value={fulfillmentForm.qty_delivered} onChange={(e) => setFulfillmentForm(f => ({ ...f, qty_delivered: e.target.value }))} placeholder={`Max ${qtyPending}`} /></div>
                <div>
                  <Label className="text-xs">Delivered By</Label>
                  {operators.length > 0 ? (
                    <Select value={fulfillmentForm.delivered_by} onValueChange={(v) => setFulfillmentForm(f => ({ ...f, delivered_by: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                      <SelectContent>{operators.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Input value={fulfillmentForm.delivered_by} onChange={(e) => setFulfillmentForm(f => ({ ...f, delivered_by: e.target.value }))} placeholder="Operator name" />
                  )}
                </div>
                <div><Label className="text-xs">Note</Label><Input value={fulfillmentForm.delivery_note} onChange={(e) => setFulfillmentForm(f => ({ ...f, delivery_note: e.target.value }))} placeholder="e.g. First batch" /></div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveFulfillment} disabled={addFulfillment.isPending}>{addFulfillment.isPending ? "Saving..." : "Save"}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowFulfillmentForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status History */}
      <Card className="shadow-card rounded-2xl">
        <CardHeader><CardTitle className="text-sm">Status History</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">From</th>
                <th className="text-left p-3 font-medium text-muted-foreground">To</th>
                <th className="text-left p-3 font-medium text-muted-foreground">By</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Notes</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b">
                  <td className="p-3">{l.old_status || "—"}</td>
                  <td className="p-3"><StatusBadge status={l.new_status} /></td>
                  <td className="p-3 text-muted-foreground">{l.changed_by}</td>
                  <td className="p-3 text-muted-foreground">{l.notes || "—"}</td>
                  <td className="p-3 text-muted-foreground text-xs">{format(parseISO(l.changed_at), "dd MMM, HH:mm")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Status Change Modal */}
      <Dialog open={showStatusModal} onOpenChange={setShowStatusModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change Order Status</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>{ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_EMOJIS[s]} {s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes (optional)</Label><Textarea value={statusNotes} onChange={e => setStatusNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusModal(false)}>Cancel</Button>
            <Button onClick={handleStatusChange} disabled={!newStatus || updateStatus.isPending}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Status Change Confirmation */}
      <AlertDialog open={!!clickedStatus} onOpenChange={() => setClickedStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change status to "{clickedStatus}"?</AlertDialogTitle>
            <AlertDialogDescription>This will update the order from "{order.status}" to "{clickedStatus}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusClick}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Notify Prompt after status change */}
      {showNotifyPrompt && (
        <NotifyPrompt
          open={showNotifyPrompt}
          onOpenChange={setShowNotifyPrompt}
          order={order}
          status={notifyStatus}
        />
      )}
    </div>
  );
}

function Row({ label, value, children, className }: { label: string; value?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      {children || <span className={className || "text-foreground"}>{value}</span>}
    </div>
  );
}
