import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useProductTypes } from "@/hooks/useProductTypes";
import { useCreatePurchaseOrder, useCreatePOLineItems } from "@/hooks/usePurchaseOrders";
import { useCreateOrder } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Upload, Loader2, FileText, Trash2, CheckCircle2, X, PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  parseDocumentWithClaude,
  type ClaudePurchaseOrderResponse,
} from "@/lib/parseDocumentWithClaude";

const MAX_PO_FILE_BYTES = 4 * 1024 * 1024; // 4MB for Claude API

type ParsedLineItem = {
  description: string;
  hsn_code: string;
  qty: number;
  uom: string;
  unit_price: number;
  amount: number;
  suggested_product_type: string;
  mapped_product_type_id?: string;
};

type ParsedPO = {
  po_number: string;
  po_date: string | null;
  vendor_name: string;
  contact_no: string | null;
  contact_person: string | null;
  gstin: string | null;
  delivery_address: string | null;
  delivery_date: string | null;
  payment_terms: string | null;
  currency: string;
  total_amount: number;
  tax_amount: number;
  base_amount: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  line_items: ParsedLineItem[];
};

/** Map Claude API purchase_order response to ParsedPO shape used by ImportPO. */
function mapClaudePOToParsedPO(claude: ClaudePurchaseOrderResponse): ParsedPO {
  const buyer = claude.buyer ?? {};
  const vendor = claude.vendor ?? {};
  const items = claude.items ?? [];
  const grandTotal = Number(claude.grand_total) || 0;
  return {
    po_number: claude.po_number ?? "",
    po_date: claude.po_date ?? null,
    vendor_name: buyer.name ?? vendor.name ?? "",
    contact_no: null,
    contact_person: claude.order_handled_by ?? null,
    gstin: buyer.gst ?? null,
    delivery_address: buyer.address ?? vendor.address ?? null,
    delivery_date: items[0]?.delivery_date ?? null,
    payment_terms: claude.payment_terms ?? null,
    currency: "INR",
    total_amount: grandTotal,
    tax_amount: 0,
    base_amount: grandTotal,
    cgst_percent: items[0]?.cgst_pct ?? 0,
    cgst_amount: 0,
    sgst_percent: items[0]?.sgst_pct ?? 0,
    sgst_amount: 0,
    igst_percent: 0,
    igst_amount: 0,
    line_items: items.map((i) => ({
      description: i.description ?? "",
      hsn_code: i.hsn ?? "",
      qty: Number(i.qty) || 0,
      uom: i.uom ?? "NOS",
      unit_price: Number(i.rate) || 0,
      amount: Number(i.total_value) || 0,
      suggested_product_type: "Other",
    })),
  };
}

export default function ImportPO() {
  const navigate = useNavigate();
  const { data: productTypes = [] } = useProductTypes();
  const createPO = useCreatePurchaseOrder();
  const createPOLineItems = useCreatePOLineItems();
  const createOrder = useCreateOrder();

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedPO | null>(null);
  const [lineItems, setLineItems] = useState<ParsedLineItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdOrders, setCreatedOrders] = useState<string[]>([]);
  const [importTab, setImportTab] = useState("pdf");

  // Manual PO entry form state
  const [manualPO, setManualPO] = useState({
    po_number: "",
    po_date: format(new Date(), "yyyy-MM-dd"),
    customer_name: "",
    contact_no: "",
    description: "",
    quantity: "",
    rate: "",
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    gst_percent: "",
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_PO_FILE_BYTES) {
      toast.error(
        `File too large: ${(f.size / 1024 / 1024).toFixed(1)}MB. Max 4MB for parsing.`
      );
      return;
    }
    const valid =
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (valid) {
      setFile(f);
      setParsed(null);
      setLineItems([]);
    } else {
      toast.error("Please select a PDF file.");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.size > MAX_PO_FILE_BYTES) {
      toast.error(
        `File too large: ${(f.size / 1024 / 1024).toFixed(1)}MB. Max 4MB for parsing.`
      );
      return;
    }
    const valid =
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (valid) {
      setFile(f);
      setParsed(null);
      setLineItems([]);
    } else {
      toast.error("Please drop a PDF file.");
    }
  }, []);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const raw = await parseDocumentWithClaude(file, "purchase_order");
      const poData = mapClaudePOToParsedPO(raw as ClaudePurchaseOrderResponse);
      setParsed(poData);

      const mappedItems = (poData.line_items || []).map((item) => {
        const matched = productTypes.find(
          (pt) =>
            pt.name.toLowerCase() === item.suggested_product_type?.toLowerCase() ||
            pt.hsn_code === item.hsn_code
        );
        return {
          ...item,
          mapped_product_type_id: matched?.id,
          suggested_product_type: matched?.name || item.suggested_product_type || "Other",
        };
      });
      setLineItems(mappedItems);
      toast.success("PO parsed successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Parsing failed: " + msg);
    } finally {
      setParsing(false);
    }
  };

  const updateLineItem = (idx: number, field: string, value: any) => {
    setLineItems((items) =>
      items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === "suggested_product_type") {
          const pt = productTypes.find((p) => p.name === value);
          updated.mapped_product_type_id = pt?.id;
        }
        return updated;
      })
    );
  };

  const removeLineItem = (idx: number) => {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  };

  const handleAutoCreate = async () => {
    if (!parsed || lineItems.length === 0) return;
    setCreating(true);
    try {
      const invalid = lineItems.some((li) => !li.description || li.qty <= 0);
      if (invalid) {
        toast.error("All line items must have description and qty > 0");
        setCreating(false);
        return;
      }

      const poRecord = await createPO.mutateAsync({
        po_number: parsed.po_number,
        po_date: parsed.po_date,
        vendor_name: parsed.vendor_name,
        contact_no: parsed.contact_no,
        contact_person: parsed.contact_person,
        gstin: parsed.gstin,
        delivery_address: parsed.delivery_address,
        delivery_date: parsed.delivery_date,
        payment_terms: parsed.payment_terms,
        currency: parsed.currency || "INR",
        total_amount: parsed.total_amount || 0,
        tax_amount: parsed.tax_amount || 0,
        po_file_url: null,
        parsed_data: parsed,
        status: "processed",
      } as any);

      const poId = poRecord.id;

      const lineItemRecords = await createPOLineItems.mutateAsync(
        lineItems.map((li, idx) => ({
          purchase_order_id: poId,
          line_item_no: idx + 1,
          description: li.description,
          hsn_code: li.hsn_code,
          qty: li.qty,
          uom: li.uom || "NOS",
          unit_price: li.unit_price,
          amount: li.amount,
          mapped_product_type_id: li.mapped_product_type_id || null,
          status: "ordered",
        }))
      );

      const orderNos: string[] = [];
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        const pt = productTypes.find((p) => p.id === li.mapped_product_type_id);
        const order = await createOrder.mutateAsync({
          customer_name: parsed.vendor_name,
          contact_no: parsed.contact_no || "",
          email: null,
          source: "purchase_order" as any,
          product_type: pt?.name || li.suggested_product_type || "Other",
          quantity: li.qty,
          size: pt?.default_size || "",
          color_mode: (pt?.default_color_mode || "full_color") as any,
          paper_type: pt?.default_paper_type || "",
          special_instructions: `Created from PO #${parsed.po_number} — ${li.description}`,
          order_date: parsed.po_date || format(new Date(), "yyyy-MM-dd"),
          delivery_date: parsed.delivery_date || format(new Date(), "yyyy-MM-dd"),
          amount: parsed.total_amount || li.amount || 0,
          advance_paid: 0,
          assigned_to: "",
          po_id: poId,
          po_line_item_id: lineItemRecords[i]?.id || null,
          po_number: parsed.po_number,
          po_contact_person: parsed.contact_person || "",
          gstin: parsed.gstin,
          hsn_code: li.hsn_code,
          base_amount: parsed.base_amount || li.amount || 0,
          cgst_percent: parsed.cgst_percent || 0,
          cgst_amount: parsed.cgst_amount || 0,
          sgst_percent: parsed.sgst_percent || 0,
          sgst_amount: parsed.sgst_amount || 0,
          igst_percent: parsed.igst_percent || 0,
          igst_amount: parsed.igst_amount || 0,
          total_tax_amount: parsed.tax_amount || 0,
        } as any);

        orderNos.push(order.order_no);

        await supabase.from("order_tags").insert({
          order_id: order.id,
          tag_name: "From PO",
        } as any);
      }

      setCreatedOrders(orderNos);
      setShowSuccess(true);
    } catch (err: any) {
      toast.error("Failed to create orders: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleManualPOCreate = async () => {
    const qty = parseInt(manualPO.quantity) || 0;
    const rate = parseFloat(manualPO.rate) || 0;
    if (!manualPO.po_number || !manualPO.customer_name || !manualPO.description || qty <= 0) {
      toast.error("Please fill all required fields");
      return;
    }
    setCreating(true);
    try {
      const subtotal = qty * rate;
      const gstPct = parseFloat(manualPO.gst_percent) || 0;
      const taxAmount = subtotal * (gstPct / 100);
      const grandTotal = subtotal + taxAmount;

      const order = await createOrder.mutateAsync({
        customer_name: manualPO.customer_name,
        contact_no: manualPO.contact_no || "",
        email: null,
        source: "purchase_order" as any,
        product_type: "Other",
        quantity: qty,
        size: "",
        color_mode: "full_color" as any,
        paper_type: "",
        special_instructions: `Created from PO #${manualPO.po_number} — ${manualPO.description}`,
        order_date: manualPO.po_date,
        delivery_date: manualPO.delivery_date,
        amount: grandTotal,
        advance_paid: 0,
        assigned_to: "",
        po_number: manualPO.po_number,
        base_amount: subtotal,
        cgst_percent: gstPct / 2,
        cgst_amount: taxAmount / 2,
        sgst_percent: gstPct / 2,
        sgst_amount: taxAmount / 2,
        total_tax_amount: taxAmount,
      } as any);

      await supabase.from("order_tags").insert({
        order_id: order.id,
        tag_name: "From PO",
      } as any);

      toast.success(`Order ${order.order_no} created from PO #${manualPO.po_number}`);
      navigate("/orders");
    } catch (err: any) {
      toast.error("Failed: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  const updateManual = (key: string, value: any) => setManualPO((f) => ({ ...f, [key]: value }));
  const manualQty = parseInt(manualPO.quantity) || 0;
  const manualRate = parseFloat(manualPO.rate) || 0;
  const manualGst = parseFloat(manualPO.gst_percent) || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Import Order from Purchase Order (PO)</h1>

      <Tabs value={importTab} onValueChange={setImportTab}>
        <TabsList>
          <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
          <TabsTrigger value="manual">Manual PO Entry</TabsTrigger>
        </TabsList>

        {/* Manual PO Entry Tab */}
        <TabsContent value="manual">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-sm">Manual PO Entry</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>PO Number *</Label><Input value={manualPO.po_number} onChange={(e) => updateManual("po_number", e.target.value)} placeholder="e.g. 94384819" /></div>
                <div><Label>PO Date</Label><Input type="date" value={manualPO.po_date} onChange={(e) => updateManual("po_date", e.target.value)} /></div>
                <div><Label>Customer Name *</Label><Input value={manualPO.customer_name} onChange={(e) => updateManual("customer_name", e.target.value)} /></div>
                <div><Label>Contact No.</Label><Input value={manualPO.contact_no} onChange={(e) => updateManual("contact_no", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="e.g. 9876543210" /></div>
                <div className="md:col-span-2"><Label>Item Description *</Label><Input value={manualPO.description} onChange={(e) => updateManual("description", e.target.value)} placeholder="e.g. Book A3 SIR 100 Leaves" /></div>
                <div><Label>Quantity *</Label><Input type="number" min={1} value={manualPO.quantity} onChange={(e) => updateManual("quantity", e.target.value)} placeholder="e.g. 100" /></div>
                <div><Label>Unit Rate (₹)</Label><Input type="number" min={0} value={manualPO.rate} onChange={(e) => updateManual("rate", e.target.value)} placeholder="e.g. 240" /></div>
                <div><Label>Delivery Date</Label><Input type="date" value={manualPO.delivery_date} onChange={(e) => updateManual("delivery_date", e.target.value)} /></div>
                <div><Label>GST %</Label><Input type="number" min={0} max={28} value={manualPO.gst_percent} onChange={(e) => updateManual("gst_percent", e.target.value)} placeholder="e.g. 18" /></div>
              </div>
              {manualQty > 0 && manualRate > 0 && (
                <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₹{(manualQty * manualRate).toLocaleString("en-IN")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">GST ({manualGst}%)</span><span>₹{(manualQty * manualRate * manualGst / 100).toLocaleString("en-IN")}</span></div>
                  <div className="flex justify-between font-bold"><span>Grand Total</span><span>₹{(manualQty * manualRate * (1 + manualGst / 100)).toLocaleString("en-IN")}</span></div>
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={handleManualPOCreate} disabled={creating || !manualPO.po_number || !manualPO.customer_name || !manualPO.description || manualQty <= 0}>
                  {creating ? "Creating..." : "Create Order from PO"}
                </Button>
                <Button variant="outline" onClick={() => navigate("/")}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PDF Upload Tab */}
        <TabsContent value="pdf">
          {!parsed && (
            <Card className="shadow-card">
              <CardContent className="p-6">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById("po-file-input")?.click()}
                >
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-foreground">Drag PDF purchase order or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">Accepts .pdf up to 4MB (parsed via Claude)</p>
                  <input
                    id="po-file-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                {file && (
                  <div className="mt-4 flex items-center justify-between p-3 bg-muted rounded-md">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setFile(null); setParsed(null); }}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button onClick={handleParse} disabled={parsing} size="sm">
                        {parsing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Parsing...</> : "Upload & Parse PO"}
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  If PDF parsing fails, switch to the "Manual PO Entry" tab to enter PO details by hand.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Parsed Data Preview */}
          {parsed && (
            <>
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-sm">Parsed PO Data</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <Field label="PO Number" value={parsed.po_number} />
                    <Field label="PO Date" value={parsed.po_date} />
                    <Field label="Customer (Buyer)" value={parsed.vendor_name} />
                    <Field label="Contact No" value={parsed.contact_no} />
                    <Field label="PO Contact Person" value={parsed.contact_person} />
                    <Field label="Buyer GSTIN" value={parsed.gstin} />
                    <Field label="Delivery Date" value={parsed.delivery_date} />
                    <Field label="Payment Terms" value={parsed.payment_terms} />
                    <Field label="Base Amount" value={`₹${(parsed.base_amount || 0).toLocaleString("en-IN")}`} />
                    {parsed.cgst_amount > 0 && <Field label={`CGST (${parsed.cgst_percent}%)`} value={`₹${parsed.cgst_amount.toLocaleString("en-IN")}`} />}
                    {parsed.sgst_amount > 0 && <Field label={`SGST (${parsed.sgst_percent}%)`} value={`₹${parsed.sgst_amount.toLocaleString("en-IN")}`} />}
                    {parsed.igst_amount > 0 && <Field label={`IGST (${parsed.igst_percent}%)`} value={`₹${parsed.igst_amount.toLocaleString("en-IN")}`} />}
                    <Field label="Total Tax" value={`₹${(parsed.tax_amount || 0).toLocaleString("en-IN")}`} />
                    <Field label="Grand Total" value={`₹${(parsed.total_amount || 0).toLocaleString("en-IN")}`} />
                  </div>
                  {parsed.delivery_address && (
                    <div className="mt-3">
                      <Label className="text-muted-foreground text-xs">Delivery Address</Label>
                      <p className="text-sm">{parsed.delivery_address}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Line Items Table */}
              <Card className="shadow-card mt-4">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Line Items ({lineItems.length})</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      Total: ₹{lineItems.reduce((s, li) => s + (li.amount || 0), 0).toLocaleString("en-IN")}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium text-muted-foreground">S.No</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">HSN</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">QTY</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">UOM</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Unit Price</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Amount</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Product Type</th>
                          <th className="text-left p-3 font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((li, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="p-3">{idx + 1}</td>
                            <td className="p-3">
                              <Input value={li.description} onChange={(e) => updateLineItem(idx, "description", e.target.value)} className="h-8 text-xs" />
                            </td>
                            <td className="p-3">
                              <Input value={li.hsn_code || ""} onChange={(e) => updateLineItem(idx, "hsn_code", e.target.value)} className="h-8 text-xs w-20" />
                            </td>
                            <td className="p-3">
                              <Input type="number" value={li.qty} onChange={(e) => updateLineItem(idx, "qty", parseInt(e.target.value) || 0)} className="h-8 text-xs w-16" />
                            </td>
                            <td className="p-3 text-muted-foreground">{li.uom || "NOS"}</td>
                            <td className="p-3">
                              <Input type="number" value={li.unit_price} onChange={(e) => updateLineItem(idx, "unit_price", parseFloat(e.target.value) || 0)} className="h-8 text-xs w-20" />
                            </td>
                            <td className="p-3 font-semibold">₹{li.amount?.toLocaleString("en-IN")}</td>
                            <td className="p-3">
                              <Select value={li.suggested_product_type} onValueChange={(v) => updateLineItem(idx, "suggested_product_type", v)}>
                                <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {productTypes.map((pt) => (
                                    <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLineItem(idx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-3 mt-4">
                <Button onClick={handleAutoCreate} disabled={creating || lineItems.length === 0}>
                  {creating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creating...</> : `Auto-Create ${lineItems.length} Order(s)`}
                </Button>
                <Button variant="outline" onClick={() => navigate("/orders/new")}>Edit & Create Manually</Button>
                <Button variant="outline" onClick={() => { setFile(null); setParsed(null); setLineItems([]); }}>Cancel</Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Success Modal */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-status-delivered" />
              Orders Created Successfully
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {createdOrders.length} order(s) created from PO #{parsed?.po_number}
            </p>
            <div className="flex flex-wrap gap-2">
              {createdOrders.map((no) => (
                <Badge key={no} variant="secondary" className="font-mono">{no}</Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate("/orders")}>View Orders</Button>
            <Button variant="outline" onClick={() => { setShowSuccess(false); setFile(null); setParsed(null); setLineItems([]); setCreatedOrders([]); }}>
              Import Another PO
            </Button>
            <Button onClick={() => navigate("/")}>Dashboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
