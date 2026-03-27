import { useParams, useNavigate } from "react-router-dom";
import { useOrder, useStatusLogs, useUpdateOrderStatus, useCreateOrder } from "@/hooks/useOrders";
import { useFulfillments, useAddFulfillment, useUpdateFulfillment, useDeleteFulfillment, type Fulfillment } from "@/hooks/useFulfillments";
import { useProductionJobsByOrder, useUpdateJobStatus, useUpdateJob } from "@/hooks/useProductionJobs";
import { useOrderItems } from "@/hooks/useOrderItems";
import { useNotificationLogs, useLogNotification } from "@/hooks/useNotificationLogs";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "@/lib/productionJobConstants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { NotifyPrompt } from "@/components/NotifyPrompt";
import { ORDER_STATUSES, STATUS_EMOJIS, WHATSAPP_STATUS_TEMPLATES, fillWhatsAppTemplate } from "@/lib/constants";
import { useSettings } from "@/hooks/useSettings";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { MessageCircle, Mail, Pencil, Printer, ArrowLeft, Copy, Plus, Trash2, Bell, CheckCircle2, Clock, ChevronUp, ChevronDown, Briefcase, ExternalLink } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMemo } from "react";

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
  const updateFulfillment = useUpdateFulfillment();
  const deleteFulfillment = useDeleteFulfillment();
  const updateStatus = useUpdateOrderStatus();
  const createOrder = useCreateOrder();
  const { data: productionJobs = [] } = useProductionJobsByOrder(id);
  const updateJobStatus = useUpdateJobStatus();
  const updateJob = useUpdateJob();
  const { data: orderItems = [] } = useOrderItems(id);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [clickedStatus, setClickedStatus] = useState<string | null>(null);
  const [showNotifyPrompt, setShowNotifyPrompt] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState("");
  const [showFulfillmentForm, setShowFulfillmentForm] = useState(false);
  const [editingFulfillment, setEditingFulfillment] = useState<Fulfillment | null>(null);
  const [deleteConfirmFulfillment, setDeleteConfirmFulfillment] = useState<Fulfillment | null>(null);
  const [fulfillmentSortCol, setFulfillmentSortCol] = useState<"fulfillment_date" | "qty_delivered" | "invoice_number" | "invoice_date" | "dc_number">("fulfillment_date");
  const [fulfillmentSortDir, setFulfillmentSortDir] = useState<"asc" | "desc">("asc");
  const [fulfillmentForm, setFulfillmentForm] = useState({
    order_item_id: "" as string,
    fulfillment_date: format(new Date(), "yyyy-MM-dd"),
    qty_delivered: "",
    invoice_number: "",
    invoice_date: "",
    dc_number: "",
    delivery_note: "",
  });
  const [fulfillmentErrors, setFulfillmentErrors] = useState<Record<string, string>>({});
  const [editFulfillmentErrors, setEditFulfillmentErrors] = useState<Record<string, string>>({});
  const [editForm, setEditForm] = useState({
    fulfillment_date: "",
    qty_delivered: "",
    invoice_number: "",
    invoice_date: "",
    dc_number: "",
    delivery_note: "",
  });

  const itemDeliveredMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fulfillments ?? []) {
      const key = (f as Fulfillment).order_item_id ?? "__order__";
      m.set(key, (m.get(key) || 0) + (f.qty_delivered || 0));
    }
    return m;
  }, [fulfillments]);

  const sortedFulfillments = useMemo(() => {
    const list = [...(fulfillments ?? [])];
    list.sort((a, b) => {
      let av: string | number = (a as any)[fulfillmentSortCol];
      let bv: string | number = (b as any)[fulfillmentSortCol];
      if (fulfillmentSortCol === "fulfillment_date" || fulfillmentSortCol === "invoice_date") {
        av = av || "";
        bv = bv || "";
        return fulfillmentSortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      }
      if (fulfillmentSortCol === "qty_delivered") {
        return fulfillmentSortDir === "asc" ? (Number(av) || 0) - (Number(bv) || 0) : (Number(bv) || 0) - (Number(av) || 0);
      }
      av = String(av ?? ""); bv = String(bv ?? "");
      return fulfillmentSortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [fulfillments, fulfillmentSortCol, fulfillmentSortDir]);

  const pendingByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of orderItems) {
      const del = itemDeliveredMap.get(item.id) || 0;
      m.set(item.id, Math.max(0, Number(item.quantity) - del));
    }
    return m;
  }, [orderItems, itemDeliveredMap]);

  if (!id) return null;
  if (isError && !isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in text-center py-12">
        <h2 className="text-xl font-semibold text-[#1E293B]">Order not found</h2>
        <p className="text-muted-foreground">The order you are looking for may have been deleted or the link is invalid.</p>
        <Button onClick={() => navigate("/orders")} className="bg-[#F97316] hover:bg-[#ea580c] text-white" style={{ backgroundColor: "#F97316" }}>Back to Orders</Button>
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
  const qtyOrdered = order.quantity; // canonical source — never use qty_ordered
  const qtyFulfilled = Math.min(Number(order.qty_fulfilled) || 0, qtyOrdered);
  const qtyPending = Math.max(0, qtyOrdered - qtyFulfilled);
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

  const today = format(new Date(), "yyyy-MM-dd");

  const validateAddFulfillment = (): boolean => {
    const err: Record<string, string> = {};
    const qty = parseInt(fulfillmentForm.qty_delivered, 10);
    if (!fulfillmentForm.fulfillment_date) err.fulfillment_date = "Delivery date is required.";
    else if (fulfillmentForm.fulfillment_date > today) err.fulfillment_date = "Delivery date cannot be in the future.";
    if (orderItems.length > 0) {
      if (!fulfillmentForm.order_item_id) err.order_item_id = "Select an item.";
      else {
        const pending = pendingByItem.get(fulfillmentForm.order_item_id) ?? 0;
        if (isNaN(qty) || qty <= 0) err.qty_delivered = "Quantity must be greater than 0.";
        else if (qty > pending) err.qty_delivered = `Quantity must not exceed pending (${pending}).`;
      }
    } else {
      if (isNaN(qty) || qty <= 0) err.qty_delivered = "Quantity must be greater than 0.";
      else if (qty > qtyPending) err.qty_delivered = `Quantity must not exceed pending (${qtyPending}).`;
    }
    if (!fulfillmentForm.invoice_number?.trim()) err.invoice_number = "Invoice number is required.";
    setFulfillmentErrors(err);
    return Object.keys(err).length === 0;
  };
  const validateEditFulfillment = (editForm: { fulfillment_date: string; qty_delivered: number; invoice_number: string }): boolean => {
    const err: Record<string, string> = {};
    if (!editForm.fulfillment_date) err.fulfillment_date = "Delivery date is required.";
    else if (editForm.fulfillment_date > today) err.fulfillment_date = "Delivery date cannot be in the future.";
    if (editForm.qty_delivered <= 0) err.qty_delivered = "Quantity must be greater than 0.";
    if (!editForm.invoice_number?.trim()) err.invoice_number = "Invoice number is required.";
    setEditFulfillmentErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveFulfillment = async () => {
    if (!validateAddFulfillment()) return;
    const qty = parseInt(fulfillmentForm.qty_delivered, 10);
    await addFulfillment.mutateAsync({
      order_id: order.id,
      order_item_id: orderItems.length > 0 && fulfillmentForm.order_item_id ? fulfillmentForm.order_item_id : undefined,
      fulfillment_date: fulfillmentForm.fulfillment_date,
      qty_delivered: qty,
      invoice_number: fulfillmentForm.invoice_number.trim() || null,
      invoice_date: fulfillmentForm.invoice_date?.trim() || null,
      dc_number: fulfillmentForm.dc_number?.trim() || null,
      delivery_note: fulfillmentForm.delivery_note?.trim() || undefined,
    });
    const newOrderPending = orderItems.length > 0
      ? (pendingByItem.get(fulfillmentForm.order_item_id) ?? qtyPending) - qty
      : qtyPending - qty;
    if (newOrderPending <= 0 && qtyPending - qty <= 0) {
      toast("All qty fulfilled! Mark as Delivered?", {
        action: { label: "Yes, Deliver", onClick: () => updateStatus.mutate({ id: order.id, oldStatus: order.status, newStatus: "Delivered", notes: "All quantities fulfilled" }) },
      });
    }
    setShowFulfillmentForm(false);
    setFulfillmentErrors({});
    setFulfillmentForm({ order_item_id: "", fulfillment_date: format(new Date(), "yyyy-MM-dd"), qty_delivered: "", invoice_number: "", invoice_date: "", dc_number: "", delivery_note: "" });
  };

  const handleUpdateFulfillment = async (editForm: { fulfillment_date: string; qty_delivered: number; invoice_number: string; invoice_date: string; dc_number: string; delivery_note: string }) => {
    if (!editingFulfillment) return;
    const maxQty = qtyPending + editingFulfillment.qty_delivered;
    if (editForm.qty_delivered > maxQty) {
      setEditFulfillmentErrors({ qty_delivered: `Quantity must not exceed ${maxQty} (pending + this row).` });
      return;
    }
    if (!validateEditFulfillment(editForm)) return;
    await updateFulfillment.mutateAsync({
      id: editingFulfillment.id,
      order_id: order.id,
      fulfillment_date: editForm.fulfillment_date,
      qty_delivered: editForm.qty_delivered,
      invoice_number: editForm.invoice_number.trim() || null,
      invoice_date: editForm.invoice_date?.trim() || null,
      dc_number: editForm.dc_number?.trim() || null,
      delivery_note: editForm.delivery_note?.trim() || null,
    });
    setEditingFulfillment(null);
    setEditFulfillmentErrors({});
  };

  const handleDeleteFulfillmentConfirm = () => {
    if (deleteConfirmFulfillment) {
      deleteFulfillment.mutate({ id: deleteConfirmFulfillment.id, orderId: order.id });
      setDeleteConfirmFulfillment(null);
    }
  };

  const lastDeliveryDate = fulfillments.length > 0
    ? format(parseISO([...fulfillments].sort((a, b) => String(b.fulfillment_date).localeCompare(String(a.fulfillment_date)))[0].fulfillment_date), "dd MMM yyyy")
    : null;

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
      const gstRate = 0;
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
          <p><strong>Date:</strong> ${order.order_date ? format(parseISO(order.order_date), "dd MMM yyyy") : "—"}</p>
          <p><strong>Due Date:</strong> ${order.delivery_date ? format(parseISO(order.delivery_date), "dd MMM yyyy") : "—"}</p>
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
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold text-foreground">{order.order_no}</h1>
        <StatusBadge status={order.status} />
      </div>

      {/* Status Update Panel - Most Prominent */}
      <Card className="shadow-card rounded-2xl border border-[#E5E7EB] border-secondary/30 bg-secondary/5">
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
      <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
        <CardHeader className="border-b border-[#F1F5F9]"><CardTitle className="text-sm font-semibold text-[#1E293B]">Order Progress</CardTitle></CardHeader>
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
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardHeader className="border-b border-[#F1F5F9]"><CardTitle className="text-sm font-semibold text-[#1E293B]">Order Information</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Customer" value={order.customer_name} />
            <Row label="Contact">
              <a href={`tel:${(order.contact_no || "").replace(/\D/g, "").slice(-10)}`} className="text-[#3B82F6] hover:underline">{formatContact(order.contact_no || "")}</a>
            </Row>
            <Row label="WhatsApp">
              <a href={`https://wa.me/91${formatContact(order.contact_no || "")}`} target="_blank" className="text-source-whatsapp hover:underline flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> {formatContact(order.contact_no || "")}
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
            <Row label="Quantity" value={String(Number(order.quantity) || 0)} />
            <Row label="Size" value={order.size || "—"} />
            <Row label="Color Mode" value={(order.color_mode || "").replace("_", " ")} />
            <Row label="Paper" value={order.paper_type || "—"} />
            {hsnCode && <Row label="HSN Code" value={hsnCode} />}
            {poNumber && <Row label="PO Number" value={poNumber} />}
            {poContactPerson && <Row label="PO Contact" value={poContactPerson} />}
            <Row label="Assigned To" value={order.assigned_to || "—"} />
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardHeader className="border-b border-[#F1F5F9]"><CardTitle className="text-sm font-semibold text-[#1E293B]">Payment & Dates</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Order Date" value={order.order_date ? format(parseISO(order.order_date), "dd MMM yyyy") : "—"} />
            <Row label="Delivery Date" value={order.delivery_date ? format(parseISO(order.delivery_date), "dd MMM yyyy") : "—"} />
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
      <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
        <CardHeader className="border-b border-[#F1F5F9]">
          <CardTitle className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
            <Bell className="h-4 w-4" /> Customer Communications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastNotif && (
            <div className="flex items-center gap-2 text-sm p-2 bg-success/10 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>Last: {lastNotif.channel === "whatsapp" ? "📱 WhatsApp" : "📧 Email"} · {lastNotif.status_at_send}</span>
              <span className="text-muted-foreground">· {lastNotif.sent_at ? formatDistanceToNow(parseISO(lastNotif.sent_at), { addSuffix: true }) : "—"}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button onClick={handleWhatsAppNow} variant="outline" className="gap-2 h-auto py-3">
              <MessageCircle className="h-5 w-5 text-source-whatsapp" />
              <div className="text-left">
                <p className="font-semibold text-sm">Send WhatsApp</p>
                <p className="text-xs text-muted-foreground">{order.customer_name} · {formatContact(order.contact_no || "")}</p>
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
                          <td className="p-2 text-muted-foreground whitespace-nowrap">{n.sent_at ? format(parseISO(n.sent_at), "dd MMM, HH:mm") : "—"}</td>
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

      {/* PO Line Items */}
      <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
        <CardHeader className="border-b border-[#F1F5F9]">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">PO Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orderItems.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Single item: {order.product_type} — Ordered {Number(qtyOrdered).toLocaleString("en-IN")}, Delivered {Number(qtyFulfilled).toLocaleString("en-IN")}, Pending {Number(qtyPending).toLocaleString("en-IN")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Item No</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Ordered Qty</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Delivered Qty</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Pending Qty</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Unit Price</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item) => {
                    const del = itemDeliveredMap.get(item.id) || 0;
                    const pending = Math.max(0, item.quantity - del);
                    return (
                      <tr key={item.id} className="border-b table-row-hover">
                        <td className="p-3 font-medium">{item.item_no}</td>
                        <td className="p-3">{item.description}</td>
                        <td className="p-3 text-right tabular-nums">{Number(item.quantity).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right tabular-nums text-green-600">{Number(del).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right tabular-nums">{Number(pending).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right tabular-nums">₹{Number(item.unit_price || 0).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right tabular-nums font-medium">₹{Number(item.amount || 0).toLocaleString("en-IN")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fulfillment by item + Record Delivery */}
      <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
        <CardHeader className="border-b border-[#F1F5F9]">
          <CardTitle className="text-sm font-semibold text-[#1E293B] flex items-center justify-between flex-wrap gap-2">
            Fulfillment
            <Button size="sm" variant="outline" onClick={() => { setFulfillmentErrors({}); setFulfillmentForm(f => ({ ...f, order_item_id: orderItems[0]?.id ?? "" })); setShowFulfillmentForm(true); }}>
              <Plus className="h-3 w-3 mr-1" /> {fulfillments.length === 0 ? "Record First Delivery" : "Record Delivery"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderItems.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Item</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Ordered</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Delivered</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Pending</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Record Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item) => {
                    const del = itemDeliveredMap.get(item.id) || 0;
                    const pending = Math.max(0, item.quantity - del);
                    return (
                      <tr key={item.id} className="border-b table-row-hover">
                        <td className="p-3">{item.description}</td>
                        <td className="p-3 text-right tabular-nums">{Number(item.quantity).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right tabular-nums text-green-600">{Number(del).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right tabular-nums">{Number(pending).toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={pending <= 0} onClick={() => { setFulfillmentForm(f => ({ ...f, order_item_id: item.id })); setFulfillmentErrors({}); setShowFulfillmentForm(true); }}>Record</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Delivery summary header */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 bg-muted rounded-xl">
              <p className="text-lg font-bold text-foreground">{Number(qtyOrdered).toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Ordered</p>
            </div>
            <div className="p-3 bg-success/10 rounded-xl">
              <p className="text-lg font-bold text-success">{Number(qtyFulfilled).toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </div>
            <div className="p-3 bg-warning/10 rounded-xl">
              <p className="text-lg font-bold text-warning">{Number(Math.max(0, qtyPending)).toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-xl">
              <p className="text-lg font-bold text-foreground">{lastDeliveryDate ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Last Delivery</p>
            </div>
          </div>
          {/* Two-segment progress bar */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex h-6 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-green-600 transition-all"
                      style={{ width: qtyOrdered > 0 ? `${(qtyFulfilled / qtyOrdered) * 100}%` : "0%" }}
                    />
                    <div
                      className="h-full bg-orange-500/80 transition-all flex-1 min-w-0"
                      style={{ minWidth: qtyOrdered > 0 && qtyPending > 0 ? "2px" : 0 }}
                    />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground text-center">
                    {Number(qtyFulfilled).toLocaleString("en-IN")} / {Number(qtyOrdered).toLocaleString("en-IN")} Delivered
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Fulfilled: {Number(qtyFulfilled).toLocaleString("en-IN")}</p>
                <p>Pending: {Number(qtyPending).toLocaleString("en-IN")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Delivery history table or empty state */}
          {fulfillments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border border-dashed rounded-xl">
              <p className="text-sm font-medium">No deliveries recorded yet</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowFulfillmentForm(true)}>
                Record First Delivery
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="sticky top-0 z-10 bg-background border-b">
                  <tr>
                    {orderItems.length > 0 && <th className="p-2 font-medium text-muted-foreground text-left">Item</th>}
                    {(["fulfillment_date", "qty_delivered", "invoice_number", "invoice_date", "dc_number"] as const).map((col) => (
                      <th
                        key={col}
                        className={cn(
                          "p-2 font-medium text-muted-foreground text-left cursor-pointer hover:bg-muted/50",
                          col === "qty_delivered" && "text-right"
                        )}
                        onClick={() => {
                          if (fulfillmentSortCol === col) setFulfillmentSortDir(d => d === "asc" ? "desc" : "asc");
                          else { setFulfillmentSortCol(col); setFulfillmentSortDir("asc"); }
                        }}
                        aria-sort={fulfillmentSortCol === col ? (fulfillmentSortDir === "asc" ? "ascending" : "descending") : undefined}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {col === "fulfillment_date" ? "Date" : col === "qty_delivered" ? "Qty" : col === "invoice_number" ? "Invoice No" : col === "invoice_date" ? "Invoice Date" : "DC No"}
                          {fulfillmentSortCol === col && (fulfillmentSortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                        </span>
                      </th>
                    ))}
                    <th className="p-2 w-20 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFulfillments.map((f, idx) => {
                    const itemDesc = orderItems.length > 0 && (f as Fulfillment).order_item_id
                      ? orderItems.find(i => i.id === (f as Fulfillment).order_item_id)?.description ?? "—"
                      : null;
                    return (
                    <tr key={f.id} className={cn("border-b border-border/50 table-row-hover", idx % 2 === 1 && "bg-muted/30")}>
                      {orderItems.length > 0 && <td className="p-2 text-muted-foreground max-w-[180px] truncate" title={itemDesc ?? undefined}>{itemDesc ?? "Order"}</td>}
                      <td className="p-2 whitespace-nowrap">{f.fulfillment_date ? format(parseISO(f.fulfillment_date), "dd MMM yyyy") : "—"}</td>
                      <td className="p-2 text-right font-medium tabular-nums">{Number(f.qty_delivered).toLocaleString("en-IN")}</td>
                      <td className="p-2">{f.invoice_number?.trim() ? <span className="font-medium">{f.invoice_number}</span> : "—"}</td>
                      <td className="p-2 whitespace-nowrap">{f.invoice_date ? format(parseISO(f.invoice_date), "dd MMM yyyy") : "—"}</td>
                      <td className="p-2">{f.dc_number?.trim() || "—"}</td>
                      <td className="p-2 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 mr-1" onClick={() => {
                          setEditingFulfillment(f);
                          setEditForm({
                            fulfillment_date: f.fulfillment_date,
                            qty_delivered: String(f.qty_delivered),
                            invoice_number: f.invoice_number || "",
                            invoice_date: f.invoice_date || "",
                            dc_number: f.dc_number || "",
                            delivery_note: f.delivery_note || "",
                          });
                          setEditFulfillmentErrors({});
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmFulfillment(f)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Production Jobs */}
      <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
        <CardHeader className="border-b border-[#F1F5F9]">
          <CardTitle className="text-sm font-semibold text-[#1E293B] flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Production Jobs</span>
            <Button size="sm" variant="outline" onClick={() => navigate("/production-jobs")} className="gap-1">
              View all jobs <ExternalLink className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {productionJobs.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground text-sm">No production jobs for this order. Jobs are created when the order is created.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Job Number</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Item</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Qty</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Assigned</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {productionJobs.map((job) => {
                    const currentIdx = JOB_STATUSES.indexOf(job.status as any);
                    return (
                      <tr key={job.id} className="border-b table-row-hover">
                        <td className="p-3 font-mono font-semibold text-[#1E293B]">{job.job_number}</td>
                        <td className="p-3">{job.description}</td>
                        <td className="p-3 text-right">{Number(job.quantity).toLocaleString("en-IN")}</td>
                        <td className="p-3">
                          <Select value={job.status} onValueChange={(v) => updateJobStatus.mutate({ id: job.id, status: v })}>
                            <SelectTrigger className="h-8 w-[130px] text-xs border-[#E5E7EB]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {JOB_STATUSES.map((s) => <SelectItem key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Select value={job.assigned_to || "unassigned"} onValueChange={(v) => updateJob.mutate({ id: job.id, assigned_to: v === "unassigned" ? null : v })}>
                            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">—</SelectItem>
                              {(settings?.operator_names || []).map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-0.5 flex-wrap" title={JOB_STATUS_LABELS[job.status] || job.status}>
                            {JOB_STATUSES.map((s, i) => (
                              <span
                                key={s}
                                className={cn(
                                  "h-2 w-2 rounded-full shrink-0",
                                  i < currentIdx ? "bg-green-500" : i === currentIdx ? "bg-[#F97316]" : "bg-muted"
                                )}
                                aria-hidden
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Delivery modal */}
      <Dialog open={showFulfillmentForm} onOpenChange={setShowFulfillmentForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Delivery</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            {orderItems.length > 0 && (
              <div>
                <Label>Item</Label>
                <Select value={fulfillmentForm.order_item_id || ""} onValueChange={(v) => setFulfillmentForm(f => ({ ...f, order_item_id: v }))}>
                  <SelectTrigger className={fulfillmentErrors.order_item_id ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {orderItems.map((item) => {
                      const pending = pendingByItem.get(item.id) ?? 0;
                      return (
                        <SelectItem key={item.id} value={item.id} disabled={pending <= 0}>
                          {item.description} (pending: {Number(pending).toLocaleString("en-IN")})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {fulfillmentErrors.order_item_id && <p className="text-xs text-destructive mt-0.5">{fulfillmentErrors.order_item_id}</p>}
              </div>
            )}
            <div>
              <Label htmlFor="fd-date">Delivery Date</Label>
              <Input id="fd-date" type="date" value={fulfillmentForm.fulfillment_date} onChange={(e) => setFulfillmentForm(f => ({ ...f, fulfillment_date: e.target.value }))} className={fulfillmentErrors.fulfillment_date ? "border-destructive" : ""} />
              {fulfillmentErrors.fulfillment_date && <p className="text-xs text-destructive mt-0.5">{fulfillmentErrors.fulfillment_date}</p>}
            </div>
            <div>
              <Label htmlFor="fd-qty">Quantity Delivered</Label>
              <Input
                id="fd-qty"
                type="number"
                min={1}
                value={fulfillmentForm.qty_delivered}
                onChange={(e) => setFulfillmentForm(f => ({ ...f, qty_delivered: e.target.value }))}
                placeholder={orderItems.length > 0 && fulfillmentForm.order_item_id ? `Max ${pendingByItem.get(fulfillmentForm.order_item_id) ?? 0}` : `Max ${qtyPending}`}
                className={fulfillmentErrors.qty_delivered ? "border-destructive" : ""}
              />
              <p className="text-xs text-muted-foreground mt-0.5">Quantity must not exceed pending for selected item.</p>
              {fulfillmentErrors.qty_delivered && <p className="text-xs text-destructive mt-0.5">{fulfillmentErrors.qty_delivered}</p>}
            </div>
            <div>
              <Label htmlFor="fd-inv">Invoice Number</Label>
              <Input id="fd-inv" value={fulfillmentForm.invoice_number} onChange={(e) => setFulfillmentForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="e.g. INV-001" className={fulfillmentErrors.invoice_number ? "border-destructive" : ""} />
              {fulfillmentErrors.invoice_number && <p className="text-xs text-destructive mt-0.5">{fulfillmentErrors.invoice_number}</p>}
            </div>
            <div>
              <Label htmlFor="fd-invdate">Invoice Date</Label>
              <Input id="fd-invdate" type="date" value={fulfillmentForm.invoice_date} onChange={(e) => setFulfillmentForm(f => ({ ...f, invoice_date: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="fd-dc">DC Number</Label>
              <Input id="fd-dc" value={fulfillmentForm.dc_number} onChange={(e) => setFulfillmentForm(f => ({ ...f, dc_number: e.target.value }))} placeholder="Delivery Challan No" />
            </div>
            <div>
              <Label htmlFor="fd-notes">Notes (optional)</Label>
              <Input id="fd-notes" value={fulfillmentForm.delivery_note} onChange={(e) => setFulfillmentForm(f => ({ ...f, delivery_note: e.target.value }))} placeholder="e.g. First batch" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveFulfillment} disabled={addFulfillment.isPending}>{addFulfillment.isPending ? "Saving..." : "Save"}</Button>
            <Button variant="outline" onClick={() => { setShowFulfillmentForm(false); setFulfillmentErrors({}); }}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Delivery modal */}
      <Dialog open={!!editingFulfillment} onOpenChange={(open) => !open && setEditingFulfillment(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Delivery</DialogTitle></DialogHeader>
          {editingFulfillment && (
            <>
              <div className="grid gap-3 py-2">
                <div>
                  <Label htmlFor="ef-date">Delivery Date</Label>
                  <Input id="ef-date" type="date" value={editForm.fulfillment_date} onChange={(e) => setEditForm(f => ({ ...f, fulfillment_date: e.target.value }))} className={editFulfillmentErrors.fulfillment_date ? "border-destructive" : ""} />
                  {editFulfillmentErrors.fulfillment_date && <p className="text-xs text-destructive mt-0.5">{editFulfillmentErrors.fulfillment_date}</p>}
                </div>
                <div>
                  <Label htmlFor="ef-qty">Quantity Delivered</Label>
                  <Input id="ef-qty" type="number" min={1} value={editForm.qty_delivered} onChange={(e) => setEditForm(f => ({ ...f, qty_delivered: e.target.value }))} className={editFulfillmentErrors.qty_delivered ? "border-destructive" : ""} />
                  <p className="text-xs text-muted-foreground mt-0.5">Max: {qtyPending + editingFulfillment.qty_delivered} (pending + this row)</p>
                  {editFulfillmentErrors.qty_delivered && <p className="text-xs text-destructive mt-0.5">{editFulfillmentErrors.qty_delivered}</p>}
                </div>
                <div>
                  <Label htmlFor="ef-inv">Invoice Number</Label>
                  <Input id="ef-inv" value={editForm.invoice_number} onChange={(e) => setEditForm(f => ({ ...f, invoice_number: e.target.value }))} className={editFulfillmentErrors.invoice_number ? "border-destructive" : ""} />
                  {editFulfillmentErrors.invoice_number && <p className="text-xs text-destructive mt-0.5">{editFulfillmentErrors.invoice_number}</p>}
                </div>
                <div>
                  <Label htmlFor="ef-invdate">Invoice Date</Label>
                  <Input id="ef-invdate" type="date" value={editForm.invoice_date} onChange={(e) => setEditForm(f => ({ ...f, invoice_date: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="ef-dc">Delivery Challan No</Label>
                  <Input id="ef-dc" value={editForm.dc_number} onChange={(e) => setEditForm(f => ({ ...f, dc_number: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="ef-notes">Notes (optional)</Label>
                  <Input id="ef-notes" value={editForm.delivery_note} onChange={(e) => setEditForm(f => ({ ...f, delivery_note: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => handleUpdateFulfillment({
                    fulfillment_date: editForm.fulfillment_date,
                    qty_delivered: parseInt(editForm.qty_delivered, 10) || 0,
                    invoice_number: editForm.invoice_number,
                    invoice_date: editForm.invoice_date,
                    dc_number: editForm.dc_number,
                    delivery_note: editForm.delivery_note,
                  })}
                  disabled={updateFulfillment.isPending}
                >
                  {updateFulfillment.isPending ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={() => setEditingFulfillment(null)}>Cancel</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete delivery confirmation */}
      <AlertDialog open={!!deleteConfirmFulfillment} onOpenChange={(open) => !open && setDeleteConfirmFulfillment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete delivery record?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this delivery record?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFulfillmentConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                  <td className="p-3 text-muted-foreground text-xs">{l.changed_at ? format(parseISO(l.changed_at), "dd MMM, HH:mm") : "—"}</td>
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
