import { useParams, useNavigate } from "react-router-dom";
import { useOrder, useUpdateOrder } from "@/hooks/useOrders";
import { useProductTypes } from "@/hooks/useProductTypes";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { COLOR_MODES, ORDER_SOURCES } from "@/lib/constants";
import { normalizeNumber } from "@/lib/numberUtils";
import { useState, useEffect } from "react";

export default function EditOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, isError } = useOrder(id);
  const updateOrder = useUpdateOrder();
  const { data: productTypes = [] } = useProductTypes();
  const { data: settings } = useSettings();
  const [form, setForm] = useState<any>(null);
  const [emailTouched, setEmailTouched] = useState(false);

  const operators = settings?.operator_names || [];

  useEffect(() => {
    if (order) {
      setForm({
        customer_name: order.customer_name,
        contact_no: order.contact_no,
        email: order.email || "",
        source: order.source,
        product_type: order.product_type,
        quantity: order.quantity ? String(Number(order.quantity)) : "",
        size: order.size || "",
        color_mode: order.color_mode,
        paper_type: order.paper_type || "",
        hsn_code: (order as any).hsn_code || "",
        gstin: (order as any).gstin || "",
        po_number: (order as any).po_number || "",
        special_instructions: order.special_instructions || "",
        order_date: order.order_date,
        delivery_date: order.delivery_date,
        amount: Number(order.amount) ? String(normalizeNumber(order.amount)) : "",
        advance_paid: Number(order.advance_paid) ? String(normalizeNumber(order.advance_paid)) : "",
        assigned_to: order.assigned_to || "",
      });
    }
  }, [order]);

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
  if (isLoading || !form) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const amt = parseFloat(form.amount) || 0;
  const adv = parseFloat(form.advance_paid) || 0;
  const hasAmount = form.amount !== "" && !isNaN(parseFloat(form.amount));
  const balanceDue = amt - adv;
  const advanceError = hasAmount && adv > amt;
  const emailInvalid = emailTouched && form.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const update = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleProductTypeChange = (name: string) => {
    const pt = productTypes.find((p) => p.name === name);
    setForm((f: any) => ({
      ...f,
      product_type: name,
      size: pt?.default_size || f.size,
      color_mode: pt?.default_color_mode || f.color_mode,
      paper_type: pt?.default_paper_type || f.paper_type,
      hsn_code: pt?.hsn_code || f.hsn_code,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateOrder.mutateAsync({
      id,
      ...form,
      quantity: Math.max(0, Math.floor(normalizeNumber(form.quantity))),
      amount: amt,
      advance_paid: adv,
      gstin: form.gstin || null,
    });
    navigate(`/orders/${id}`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in pb-24">
      <h1 className="text-2xl font-bold text-foreground">Edit Order: {order?.order_no}</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardHeader className="border-b border-[#F1F5F9]"><CardTitle className="text-sm font-semibold text-[#1E293B]">Customer Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
            <div><Label>Customer Name <span className="text-[#DC2626]">*</span></Label><Input value={form.customer_name} onChange={e => update("customer_name", e.target.value)} required /></div>
            <div>
              <Label>Contact No.</Label>
              <Input value={form.contact_no} onChange={e => update("contact_no", e.target.value.replace(/\D/g, "").slice(0, 10))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => update("email", e.target.value)}
                onBlur={() => { if (form.email.length > 0) setEmailTouched(true); else setEmailTouched(false); }}
              />
              {emailInvalid && <p className="text-xs text-destructive mt-1">Invalid email format</p>}
            </div>
            <div><Label>Source</Label>
              <Select value={form.source} onValueChange={v => update("source", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORDER_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardHeader className="border-b border-[#F1F5F9]"><CardTitle className="text-sm font-semibold text-[#1E293B]">Order Details</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Product Type <span className="text-[#DC2626]">*</span></Label>
                <Select value={form.product_type} onValueChange={handleProductTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{productTypes.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity <span className="text-[#DC2626]">*</span></Label>
                <Input
                type="number"
                min={0}
                value={form.quantity}
                onChange={(e) => {
                  const v = e.target.value;
                  update("quantity", v === "" ? "" : String(Math.max(0, Math.floor(normalizeNumber(v)))));
                }}
                placeholder="e.g. 100"
              />
              </div>
              <div><Label>Size</Label><Input value={form.size} onChange={e => update("size", e.target.value)} /></div>
              <div><Label>Color Mode</Label>
                <Select value={form.color_mode} onValueChange={v => update("color_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COLOR_MODES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Paper Type</Label><Input value={form.paper_type} onChange={e => update("paper_type", e.target.value)} /></div>
              <div><Label>HSN Code</Label><Input value={form.hsn_code} onChange={e => update("hsn_code", e.target.value)} /></div>
              <div><Label>GSTIN</Label><Input value={form.gstin || ""} onChange={e => update("gstin", e.target.value)} placeholder="15-char GSTIN" maxLength={15} /></div>
              <div><Label>PO Number</Label><Input value={form.po_number} onChange={e => update("po_number", e.target.value)} placeholder="e.g. 94384819" /></div>
              <div><Label>Assigned To</Label>
                {operators.length > 0 ? (
                  <Select value={form.assigned_to} onValueChange={v => update("assigned_to", v)}>
                    <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                    <SelectContent>{operators.map(op => <SelectItem key={op} value={op}>{op}</SelectItem>)}</SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">No operators added — go to Settings</p>
                )}
              </div>
            </div>
            <div><Label>Special Instructions</Label><Textarea value={form.special_instructions} onChange={e => update("special_instructions", e.target.value)} /></div>
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardHeader className="border-b border-[#F1F5F9]"><CardTitle className="text-sm font-semibold text-[#1E293B]">Dates & Payment</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
            <div><Label>Order Date</Label><Input type="date" value={form.order_date} onChange={e => update("order_date", e.target.value)} /></div>
            <div><Label>Delivery Date <span className="text-[#DC2626]">*</span></Label><Input type="date" value={form.delivery_date} onChange={e => update("delivery_date", e.target.value)} required /></div>
            <div>
              <Label>Amount (₹)</Label>
              <Input type="number" value={form.amount} onChange={e => update("amount", e.target.value)} placeholder="e.g. 1500" />
            </div>
            <div>
              <Label>Advance Paid (₹)</Label>
              <Input
                type="number"
                value={form.advance_paid}
                onChange={e => update("advance_paid", e.target.value)}
                placeholder="e.g. 500"
                className={advanceError ? "border-destructive" : ""}
              />
              {advanceError && <p className="text-xs text-destructive mt-1">Advance exceeds order amount</p>}
            </div>
            <div>
              <Label>Balance Due (₹)</Label>
              <div className={`py-2 px-3 rounded-md border bg-muted/30 font-bold text-base ${balanceDue < 0 ? "text-destructive" : ""}`} style={balanceDue >= 0 ? { color: "#1E293B" } : undefined}>
                {hasAmount ? (balanceDue < 0 ? `Overpaid: ₹${Math.abs(balanceDue).toLocaleString("en-IN")}` : `₹${balanceDue.toLocaleString("en-IN")}`) : "—"}
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="sticky bottom-0 left-0 right-0 py-4 bg-background/95 border-t border-border flex gap-3 justify-end">
          <Button type="button" variant="outline" className="border-[#D1D5DB]" onClick={() => navigate(`/orders/${id}`)}>Cancel</Button>
          <Button type="submit" disabled={updateOrder.isPending} className="px-8 bg-[#F97316] hover:bg-[#ea580c] text-white" style={{ backgroundColor: "#F97316" }}>
            {updateOrder.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
