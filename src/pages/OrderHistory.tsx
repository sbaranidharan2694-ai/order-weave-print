import { useState, useMemo, useEffect } from "react";
import { useOrders, useUpdateOrderStatus, useDeleteOrder } from "@/hooks/useOrders";
import { useAllOrderTags, TAG_COLORS } from "@/hooks/useOrderTags";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ORDER_STATUSES, ORDER_SOURCES } from "@/lib/constants";
import { format, parseISO, isBefore, subDays } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Download, Eye, Pencil, Trash2, MessageCircle, Copy, PlusCircle, ClipboardList, Settings2, GripVertical, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const formatContact = (phone: string) => phone.replace(/\D/g, "").slice(-10);

type ColumnDef = { key: string; label: string; visible: boolean; locked?: boolean };

const defaultColumns: ColumnDef[] = [
  { key: "order_no", label: "Order No.", visible: true, locked: true },
  { key: "created", label: "Created", visible: true },
  { key: "product", label: "Product", visible: true },
  { key: "customer", label: "Customer", visible: true },
  { key: "contact", label: "Contact", visible: true },
  { key: "amount", label: "Amount ₹", visible: true },
  { key: "status", label: "Status", visible: true },
  { key: "delivery", label: "Delivery Date", visible: false },
  { key: "po_number", label: "PO Number", visible: true },
  { key: "source", label: "Source", visible: false },
  { key: "actions", label: "Actions", visible: true, locked: true },
];

export default function OrderHistory() {
  const { data: orders = [], isLoading } = useOrders();
  const { data: allTags = [] } = useAllOrderTags();
  const { data: templates = [] } = useWhatsAppTemplates();
  const updateStatus = useUpdateOrderStatus();
  const deleteOrder = useDeleteOrder();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("customer") || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sortCol, setSortCol] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    try {
      const saved = localStorage.getItem("sp_columns");
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore invalid saved columns
    }
    return defaultColumns;
  });

  useEffect(() => {
    localStorage.setItem("sp_columns", JSON.stringify(columns));
  }, [columns]);

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const [waOrder, setWaOrder] = useState<any>(null);
  const [waMessage, setWaMessage] = useState("");

  const orderTagsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    allTags.forEach((t) => {
      if (!map[t.order_id]) map[t.order_id] = [];
      map[t.order_id].push(t.tag_name);
    });
    return map;
  }, [allTags]);

  const filtered = useMemo(() => {
    let result = [...orders];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((o) =>
        o.order_no.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.contact_no.includes(q) ||
        ((o as any).po_number || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") result = result.filter((o) => o.status === statusFilter);
    if (sourceFilter !== "all") result = result.filter((o) => o.source === sourceFilter);
    if (dateFilter === "7") result = result.filter((o) => parseISO(o.order_date) >= subDays(new Date(), 7));
    if (dateFilter === "30") result = result.filter((o) => parseISO(o.order_date) >= subDays(new Date(), 30));

    result.sort((a, b) => {
      let av: any = (a as any)[sortCol] || "";
      let bv: any = (b as any)[sortCol] || "";
      if (sortCol === "amount") { av = Number(av) || 0; bv = Number(bv) || 0; }
      if (sortDir === "asc") return av > bv ? 1 : -1;
      return av < bv ? 1 : -1;
    });
    return result;
  }, [orders, search, statusFilter, sourceFilter, dateFilter, sortCol, sortDir]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);
  const grandTotal = filtered.reduce((s, o) => s + (parseFloat(String(o.amount)) || 0), 0);

  const exportCSV = () => {
    const headers = ["Order No", "Created", "Customer", "Contact", "Product", "Amount", "PO Number", "Source", "Status", "Order Date", "Delivery Date", "Tags"];
    const rows = filtered.map((o) => [
      o.order_no, format(parseISO(o.created_at), "dd MMM yyyy, h:mm a"), o.customer_name, formatContact(o.contact_no), o.product_type,
      o.amount, (o as any).po_number || "", o.source, o.status,
      o.order_date, o.delivery_date, (orderTagsMap[o.id] || []).join("; "),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const toggleSort = (col: string) => {
    const sortMap: Record<string, string> = {
      order_no: "order_no", created: "created_at", product: "product_type",
      customer: "customer_name", contact: "contact_no", amount: "amount",
      status: "status", delivery: "delivery_date", po_number: "po_number", source: "source",
    };
    const dbCol = sortMap[col] || col;
    if (sortCol === dbCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(dbCol); setSortDir("desc"); }
  };

  const openWhatsApp = (order: any) => {
    const template = templates[0];
    if (!template) {
      toast.error("No WhatsApp template configured. Add one in Settings.");
      return;
    }
    const msg = template.body
      .replace("{{customer_name}}", order.customer_name)
      .replace("{{order_no}}", order.order_no)
      .replace("{{product_type}}", order.product_type)
      .replace("{{quantity}}", String(order.quantity))
      .replace("{{status}}", order.status)
      .replace("{{delivery_date}}", format(parseISO(order.delivery_date), "dd MMM yyyy"))
      .replace("{{amount}}", Number(order.amount).toLocaleString("en-IN"))
      .replace("{{balance_due}}", Number(order.balance_due || 0).toLocaleString("en-IN"))
      .replace("{{qty_ordered}}", String((order as any).qty_ordered || order.quantity))
      .replace("{{qty_fulfilled}}", String((order as any).qty_fulfilled || 0))
      .replace("{{qty_pending}}", String((order as any).qty_pending || order.quantity));
    setWaOrder(order);
    setWaMessage(msg);
  };

  const sendWhatsApp = async () => {
    if (!waOrder) return;
    const url = `https://wa.me/${waOrder.contact_no.replace(/\D/g, "")}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, "_blank");
    await supabase.from("orders").update({
      whatsapp_message_sent_at: new Date().toISOString(),
      whatsapp_message_body: waMessage,
    } as any).eq("id", waOrder.id);
    toast.success(`WhatsApp sent to ${waOrder.customer_name}`);
    setWaOrder(null);
  };

  const toggleColumn = (key: string) => {
    setColumns(cols => cols.map(c => c.key === key && !c.locked ? { ...c, visible: !c.visible } : c));
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setColumns(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const visibleCols = columns.filter(c => c.visible);

  const renderCell = (o: any, colKey: string) => {
    const tags = orderTagsMap[o.id] || [];
    const overdue = isBefore(parseISO(o.delivery_date), new Date()) && o.status !== "Delivered" && o.status !== "Cancelled";
    switch (colKey) {
      case "order_no": {
        const hasPO = !!(o as any).po_number;
        return (
          <span className="font-mono text-xs font-semibold whitespace-nowrap">
            {o.order_no}
            {hasPO && <Badge variant="secondary" className="ml-1 text-[10px] bg-sky-100 text-sky-700">PO</Badge>}
          </span>
        );
      }
      case "created": return <span className="text-muted-foreground whitespace-nowrap text-xs">{format(parseISO(o.created_at), "dd MMM yyyy, h:mm a")}</span>;
      case "product": return <span className="whitespace-nowrap">{o.product_type}</span>;
      case "customer": return <span className="whitespace-nowrap">{o.customer_name}</span>;
      case "contact": return <span className="text-muted-foreground whitespace-nowrap">{formatContact(o.contact_no)}</span>;
      case "amount": return <span className="whitespace-nowrap text-foreground">{Number(o.amount) ? `₹${Number(o.amount).toLocaleString("en-IN")}` : "—"}</span>;
      case "status": return (
        <span onClick={(e) => e.stopPropagation()}>
          <Select value={o.status} onValueChange={(val) => updateStatus.mutate({ id: o.id, oldStatus: o.status, newStatus: val })}>
            <SelectTrigger className="h-7 text-xs w-[160px] border-0 bg-transparent p-0">
              <StatusBadge status={o.status} />
            </SelectTrigger>
            <SelectContent>{ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </span>
      );
      case "delivery": return (
        <span className={`whitespace-nowrap ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
          {format(parseISO(o.delivery_date), "dd MMM yyyy")}{overdue && " ⚠"}
        </span>
      );
      case "po_number": return <span className="text-muted-foreground whitespace-nowrap text-xs">{(o as any).po_number || "—"}</span>;
      case "source": return <span onClick={(e) => e.stopPropagation()}><SourceBadge source={o.source} /></span>;
      case "actions": return (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/orders/${o.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/orders/${o.id}/edit`)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openWhatsApp(o)}><MessageCircle className="h-3.5 w-3.5 text-source-whatsapp" /></Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Order?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete order {o.order_no}.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteOrder.mutate(o.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      );
      default: return "—";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Order History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} order{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/orders/new")} className="rounded-xl gap-1.5"><PlusCircle className="h-4 w-4" />New Order</Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl gap-1.5"><Settings2 className="h-4 w-4" />Columns</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Manage Columns</span>
                <button className="text-xs text-primary hover:underline" onClick={() => setColumns(defaultColumns)}>
                  <RotateCcw className="h-3 w-3 inline mr-1" />Reset
                </button>
              </div>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {columns.map((col, idx) => (
                  <div
                    key={col.key}
                    draggable={!col.locked}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-grab text-sm"
                  >
                    {!col.locked && <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    {col.locked && <span className="w-3" />}
                    <Checkbox
                      checked={col.visible}
                      disabled={col.locked}
                      onCheckedChange={() => toggleColumn(col.key)}
                      className="h-3.5 w-3.5"
                    />
                    <span className={col.locked ? "text-muted-foreground" : ""}>{col.label}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button onClick={exportCSV} variant="outline" size="sm" className="rounded-xl gap-1.5"><Download className="h-4 w-4" />Export CSV</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-2xl border border-border/80 shadow-card">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search order, customer, contact, PO…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 rounded-xl" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {ORDER_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Empty state */}
      {orders.length === 0 ? (
        <Card className="rounded-2xl border border-border/80 shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No orders yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first order to get started</p>
            <Button onClick={() => navigate("/orders/new")}>Create First Order</Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border border-border/80 shadow-card overflow-hidden">
          <CardContent className="p-0">
            <div style={{ overflowX: "auto", width: "100%" }}>
              <table className="w-full text-sm" style={{ minWidth: "800px" }}>
                <thead>
                  <tr className="border-b bg-muted/50">
                    {visibleCols.map((col) => (
                      <th
                        key={col.key}
                        className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap select-none"
                        onClick={() => col.key !== "actions" && toggleSort(col.key)}
                      >
                        {col.label}
                        {(() => {
                          const sortMap: Record<string, string> = {
                            order_no: "order_no", created: "created_at", product: "product_type",
                            customer: "customer_name", contact: "contact_no", amount: "amount",
                            status: "status", delivery: "delivery_date", po_number: "po_number", source: "source",
                          };
                          const dbCol = sortMap[col.key] || col.key;
                          return sortCol === dbCol ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                        })()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/orders/${o.id}`)}
                    >
                      {visibleCols.map((col) => (
                        <td key={col.key} className="p-3">{renderCell(o, col.key)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Summary row */}
            <div className="flex items-center justify-between p-3 border-t bg-muted/30">
              <span className="text-sm text-muted-foreground">
                Showing <strong>{filtered.length}</strong> orders
              </span>
              <span className="text-sm font-bold text-foreground">
                Grand Total: ₹{grandTotal.toLocaleString("en-IN")}
              </span>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between p-3 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{filtered.length} orders</span>
                <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span>per page</span>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <span className="flex items-center px-2 text-sm text-muted-foreground">{page}/{totalPages || 1}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Modal */}
      <Dialog open={!!waOrder} onOpenChange={() => setWaOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send WhatsApp Message</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">To: {waOrder?.customer_name} ({waOrder?.contact_no})</p>
            <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} className="min-h-[120px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(waMessage); toast.success("Copied!"); }}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
            <Button variant="outline" onClick={() => setWaOrder(null)}>Cancel</Button>
            <Button onClick={sendWhatsApp}>Send via WhatsApp</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
