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
import { Upload, Loader2, FileText, Trash2, CheckCircle2, X, PlusCircle, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { extractTextFromPdf } from "@/utils/extractPdfText";
import { numberToWords } from "@/lib/numberToWords";

const MAX_PO_FILE_BYTES = 10 * 1024 * 1024;

type ParsedLineItem = {
  description: string;
  item_code: string;
  hsn_code: string;
  qty: number;
  uom: string;
  unit_price: number;
  base_amount: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  total_amount: number;
  suggested_product_type: string;
  mapped_product_type_id?: string;
};

type ParsedPO = {
  po_number: string;
  po_date: string | null;
  vendor_name: string;
  contact_no: string | null;
  contact_person: string | null;
  contact_email: string | null;
  gstin: string | null;
  vendor_gstin: string | null;
  delivery_address: string | null;
  buyer_address: string | null;
  delivery_date: string | null;
  payment_terms: string | null;
  currency: string;
  gst_extra: boolean;
  total_amount: number;
  tax_amount: number;
  base_amount: number;
  cgst_percent: number;
  cgst_amount: number;
  sgst_percent: number;
  sgst_amount: number;
  igst_percent: number;
  igst_amount: number;
  remarks: string | null;
  line_items: ParsedLineItem[];
};

function recalcLineItem(li: ParsedLineItem): ParsedLineItem {
  const base = li.qty * li.unit_price;
  const cgst = base * (li.cgst_percent / 100);
  const sgst = base * (li.sgst_percent / 100);
  const igst = base * (li.igst_percent / 100);
  return {
    ...li,
    base_amount: Math.round(base * 100) / 100,
    cgst_amount: Math.round(cgst * 100) / 100,
    sgst_amount: Math.round(sgst * 100) / 100,
    igst_amount: Math.round(igst * 100) / 100,
    total_amount: Math.round((base + cgst + sgst + igst) * 100) / 100,
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
  const [editHeader, setEditHeader] = useState<Partial<ParsedPO>>({});

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
      toast.error(`File too large: ${(f.size / 1024 / 1024).toFixed(1)}MB. Max 10MB.`);
      return;
    }
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      setFile(f);
      setParsed(null);
      setLineItems([]);
      setEditHeader({});
    } else {
      toast.error("Please select a PDF file.");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.size > MAX_PO_FILE_BYTES) {
      toast.error(`File too large: ${(f.size / 1024 / 1024).toFixed(1)}MB. Max 10MB.`);
      return;
    }
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      setFile(f);
      setParsed(null);
      setLineItems([]);
      setEditHeader({});
    } else {
      toast.error("Please drop a PDF file.");
    }
  }, []);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      // Step 1: Extract text client-side
      const { text: pdfText } = await extractTextFromPdf(file);
      if (!pdfText || pdfText.trim().length < 30) {
        toast.error("Could not extract text from PDF. File may be scanned/image-based.");
        return;
      }

      // Step 2: Send to AI edge function for structured parsing
      const { data: result, error } = await supabase.functions.invoke("parse-po", {
        body: { pdfText },
      });

      if (error) {
        toast.error("Parsing failed: " + (error.message || "Unknown error"));
        return;
      }

      if (!result?.success || !result?.data) {
        const msg = result?.error || "AI parsing returned no data";
        toast.error(msg + " — Ensure Supabase edge function 'parse-po' is deployed and LOVABLE_API_KEY is set.");
        return;
      }

      const d = result.data;
      const poData: ParsedPO = {
        po_number: d.po_number || "",
        po_date: d.po_date || null,
        vendor_name: d.vendor_name || "",
        contact_no: d.contact_no || null,
        contact_person: d.contact_person || null,
        contact_email: d.contact_email || null,
        gstin: d.gstin || null,
        vendor_gstin: d.vendor_gstin || null,
        delivery_address: d.delivery_address || d.buyer_address || null,
        buyer_address: d.buyer_address || null,
        delivery_date: d.delivery_date || null,
        payment_terms: d.payment_terms || null,
        currency: d.currency || "INR",
        gst_extra: d.gst_extra || false,
        total_amount: d.total_amount || 0,
        tax_amount: d.tax_amount || 0,
        base_amount: d.base_amount || 0,
        cgst_percent: d.cgst_percent || 0,
        cgst_amount: d.cgst_amount || 0,
        sgst_percent: d.sgst_percent || 0,
        sgst_amount: d.sgst_amount || 0,
        igst_percent: d.igst_percent || 0,
        igst_amount: d.igst_amount || 0,
        remarks: d.remarks || null,
        line_items: (d.line_items || []).map((li: any) => {
          const matched = productTypes.find(
            (pt) =>
              pt.name.toLowerCase() === (li.suggested_product_type || "").toLowerCase() ||
              pt.hsn_code === li.hsn_code
          );
          return {
            description: li.description || "",
            item_code: li.item_code || "",
            hsn_code: li.hsn_code || "",
            qty: li.qty || 0,
            uom: li.uom || "NOS",
            unit_price: li.unit_price || 0,
            base_amount: li.base_amount || (li.qty || 0) * (li.unit_price || 0),
            cgst_percent: li.cgst_percent || 0,
            cgst_amount: li.cgst_amount || 0,
            sgst_percent: li.sgst_percent || 0,
            sgst_amount: li.sgst_amount || 0,
            igst_percent: li.igst_percent || 0,
            igst_amount: li.igst_amount || 0,
            total_amount: li.total_amount || li.base_amount || (li.qty || 0) * (li.unit_price || 0),
            suggested_product_type: matched?.name || li.suggested_product_type || "Other",
            mapped_product_type_id: matched?.id,
          };
        }),
      };

      setParsed(poData);
      setLineItems(poData.line_items);
      setEditHeader({});
      toast.success("PO parsed successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Parsing failed: " + msg);
    } finally {
      setParsing(false);
    }
  };

  const getHeader = (field: keyof ParsedPO) =>
    editHeader[field] !== undefined ? editHeader[field] : parsed?.[field];
  const setHeader = (field: keyof ParsedPO, value: any) =>
    setEditHeader((h) => ({ ...h, [field]: value }));

  const updateLineItem = (idx: number, field: string, value: any) => {
    setLineItems((items) =>
      items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === "suggested_product_type") {
          const pt = productTypes.find((p) => p.name === value);
          updated.mapped_product_type_id = pt?.id;
        }
        // Recalc on qty/price/gst change
        if (["qty", "unit_price", "cgst_percent", "sgst_percent", "igst_percent"].includes(field)) {
          return recalcLineItem(updated);
        }
        return updated;
      })
    );
  };

  const removeLineItem = (idx: number) => {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  };

  const addLineItem = () => {
    setLineItems((items) => [
      ...items,
      {
        description: "",
        item_code: "",
        hsn_code: "",
        qty: 0,
        uom: "NOS",
        unit_price: 0,
        base_amount: 0,
        cgst_percent: 0,
        cgst_amount: 0,
        sgst_percent: 0,
        sgst_amount: 0,
        igst_percent: 0,
        igst_amount: 0,
        total_amount: 0,
        suggested_product_type: "Other",
      },
    ]);
  };

  // Computed totals from line items
  const totals = lineItems.reduce(
    (acc, li) => ({
      base: acc.base + (li.base_amount || 0),
      cgst: acc.cgst + (li.cgst_amount || 0),
      sgst: acc.sgst + (li.sgst_amount || 0),
      igst: acc.igst + (li.igst_amount || 0),
      total: acc.total + (li.total_amount || 0),
    }),
    { base: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  );

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

      const customerName = (getHeader("vendor_name") as string) || parsed.vendor_name;
      const customerGstin = (getHeader("gstin") as string) || parsed.gstin;
      const customerAddress = (getHeader("buyer_address") as string) || parsed.buyer_address;
      const contactNo = (getHeader("contact_no") as string) || parsed.contact_no || "";
      const contactPerson = (getHeader("contact_person") as string) || parsed.contact_person || "";
      const contactEmail = (getHeader("contact_email") as string) || parsed.contact_email || "";
      const poNumber = (getHeader("po_number") as string) || parsed.po_number;
      const poDate = (getHeader("po_date") as string) || parsed.po_date;
      const deliveryDate = (getHeader("delivery_date") as string) || parsed.delivery_date;
      const paymentTerms = (getHeader("payment_terms") as string) || parsed.payment_terms;

      // Auto-create customer if not exists
      let customerId: string | null = null;
      const { data: existingByName } = await supabase
        .from("customers")
        .select("*")
        .ilike("name", customerName)
        .maybeSingle();

      if (existingByName) {
        customerId = existingByName.id;
      } else if (contactNo && contactNo.length >= 10) {
        const { data: existingByPhone } = await supabase
          .from("customers")
          .select("*")
          .eq("contact_no", contactNo)
          .maybeSingle();
        if (existingByPhone) {
          customerId = existingByPhone.id;
          // Update GSTIN/address if missing
          if (!existingByPhone.gstin && customerGstin) {
            await supabase.from("customers").update({ gstin: customerGstin, address: customerAddress || existingByPhone.address }).eq("id", existingByPhone.id);
          }
        }
      }

      if (!customerId) {
        const { data: newCust, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: customerName,
            contact_no: contactNo || "0000000000",
            email: contactEmail || null,
            gstin: customerGstin || null,
            address: customerAddress || null,
            total_orders: 0,
            total_spend: 0,
          })
          .select()
          .single();
        if (custErr) {
          console.error("Customer creation error:", custErr);
        } else {
          customerId = newCust.id;
          toast.success(`✅ New customer '${customerName}' created automatically`);
        }
      }

      let poRecord: { id: string };
      try {
        poRecord = await createPO.mutateAsync({
          po_number: poNumber,
          po_date: poDate,
          vendor_name: customerName,
          contact_no: contactNo,
          contact_person: contactPerson,
          gstin: customerGstin,
          delivery_address: (getHeader("delivery_address") as string) || parsed.delivery_address,
          delivery_date: deliveryDate,
          payment_terms: paymentTerms,
          currency: parsed.currency || "INR",
          total_amount: totals.total || parsed.total_amount || 0,
          tax_amount: (totals.cgst + totals.sgst + totals.igst) || parsed.tax_amount || 0,
          po_file_url: null,
          parsed_data: { ...parsed, ...editHeader, line_items: lineItems },
          status: "processed",
        } as any);
      } catch (poErr: unknown) {
        const msg = poErr instanceof Error ? poErr.message : String(poErr);
        toast.error("Failed to save Purchase Order: " + msg);
        setCreating(false);
        return;
      }

      const poId = poRecord.id;

      let lineItemRecords: { id: string }[];
      try {
        lineItemRecords = await createPOLineItems.mutateAsync(
        lineItems.map((li, idx) => ({
          purchase_order_id: poId,
          line_item_no: idx + 1,
          description: li.description,
          hsn_code: li.hsn_code,
          qty: li.qty,
          uom: li.uom || "NOS",
          unit_price: li.unit_price,
          amount: li.total_amount || li.base_amount,
          mapped_product_type_id: li.mapped_product_type_id || null,
          status: "ordered",
        }))
        );
      } catch (lineErr: unknown) {
        const msg = lineErr instanceof Error ? lineErr.message : String(lineErr);
        toast.error("Failed to save PO line items: " + msg);
        setCreating(false);
        return;
      }

      const orderNos: string[] = [];
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        const pt = productTypes.find((p) => p.id === li.mapped_product_type_id);
        const order = await createOrder.mutateAsync({
          customer_name: customerName,
          contact_no: contactNo || "0000000000",
          email: contactEmail || null,
          source: "purchase_order" as any,
          product_type: pt?.name || li.suggested_product_type || "Other",
          quantity: li.qty,
          size: pt?.default_size || "",
          color_mode: (pt?.default_color_mode || "full_color") as any,
          paper_type: pt?.default_paper_type || "",
          special_instructions: `PO #${poNumber} — ${li.description}`,
          order_date: poDate || format(new Date(), "yyyy-MM-dd"),
          delivery_date: deliveryDate || format(new Date(), "yyyy-MM-dd"),
          amount: li.total_amount || li.base_amount || 0,
          advance_paid: 0,
          assigned_to: "",
          po_id: poId,
          po_line_item_id: lineItemRecords[i]?.id || null,
          po_number: poNumber,
          po_contact_person: contactPerson,
          gstin: customerGstin,
          hsn_code: li.hsn_code,
          base_amount: li.base_amount || 0,
          cgst_percent: li.cgst_percent || 0,
          cgst_amount: li.cgst_amount || 0,
          sgst_percent: li.sgst_percent || 0,
          sgst_amount: li.sgst_amount || 0,
          igst_percent: li.igst_percent || 0,
          igst_amount: li.igst_amount || 0,
          total_tax_amount: (li.cgst_amount || 0) + (li.sgst_amount || 0) + (li.igst_amount || 0),
        } as any);

        orderNos.push(order.order_no);

        const { error: tagErr } = await supabase.from("order_tags").insert({
          order_id: order.id,
          tag_name: "From PO",
        } as any);
        if (tagErr) console.warn("Order tag insert failed (non-blocking):", tagErr.message);
      }

      setCreatedOrders(orderNos);
      setShowSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to create orders: " + msg + " — Check that generate_order_no RPC and orders table exist in Supabase.");
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
        special_instructions: `PO #${manualPO.po_number} — ${manualPO.description}`,
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

  const grandTotalWords = totals.total > 0 ? numberToWords(totals.total) : "";

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
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
                  <p className="text-sm text-muted-foreground mt-1">Supports: Fujitec, Guindy Machine Tools, Contemporary Leather, and other PO formats</p>
                  <input
                    id="po-file-input"
                    type="file"
                    accept=".pdf"
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
                        {parsing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />AI Parsing...</> : "Upload & Parse PO"}
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  PDF text is extracted in-browser, then parsed by AI. If parsing fails, use "Manual PO Entry" tab.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ===== Parsed Data Review Screen ===== */}
          {parsed && (
            <>
              {/* Order Header */}
              <Card className="shadow-card">
                <CardHeader><CardTitle className="text-sm">📋 Order Header</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">PO Number</Label>
                      <Input
                        value={(getHeader("po_number") as string) || ""}
                        onChange={(e) => setHeader("po_number", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">PO Date</Label>
                      <Input
                        type="date"
                        value={(getHeader("po_date") as string) || ""}
                        onChange={(e) => setHeader("po_date", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Customer Name</Label>
                      <Input
                        value={(getHeader("vendor_name") as string) || ""}
                        onChange={(e) => setHeader("vendor_name", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Customer GST No.</Label>
                      <Input
                        value={(getHeader("gstin") as string) ?? parsed.gstin ?? ""}
                        onChange={(e) => setHeader("gstin", e.target.value)}
                        placeholder="15-char GSTIN"
                        className="h-8 text-sm mt-1 font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Delivery Date</Label>
                      <Input
                        type="date"
                        value={(getHeader("delivery_date") as string) || ""}
                        onChange={(e) => setHeader("delivery_date", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Payment Terms</Label>
                      <Input
                        value={(getHeader("payment_terms") as string) || ""}
                        onChange={(e) => setHeader("payment_terms", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Contact Person</Label>
                      <Input
                        value={(getHeader("contact_person") as string) || ""}
                        onChange={(e) => setHeader("contact_person", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Contact No.</Label>
                      <Input
                        value={(getHeader("contact_no") as string) || ""}
                        onChange={(e) => setHeader("contact_no", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Contact Email</Label>
                      <Input
                        value={(getHeader("contact_email") as string) || ""}
                        onChange={(e) => setHeader("contact_email", e.target.value)}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                  </div>
                  {parsed.delivery_address && (
                    <div className="mt-3">
                      <Label className="text-muted-foreground text-xs">Delivery Address</Label>
                      <p className="text-sm mt-0.5">{parsed.delivery_address}</p>
                    </div>
                  )}
                  {parsed.gst_extra && (
                    <div className="mt-3 flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      <span className="text-xs text-destructive font-medium">GST is EXTRA — taxes are not included in line item totals</span>
                    </div>
                  )}
                  {parsed.remarks && (
                    <div className="mt-2">
                      <Label className="text-muted-foreground text-xs">Remarks</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{parsed.remarks}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Line Items Table */}
              <Card className="shadow-card mt-4">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>📦 Line Items ({lineItems.length})</span>
                    <Button variant="outline" size="sm" onClick={addLineItem} className="h-7 text-xs">
                      <PlusCircle className="h-3.5 w-3.5 mr-1" />Add Row
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium text-muted-foreground w-8">#</th>
                          <th className="text-left p-2 font-medium text-muted-foreground min-w-[180px]">Description</th>
                          <th className="text-left p-2 font-medium text-muted-foreground w-20">HSN</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-16">Qty</th>
                          <th className="text-left p-2 font-medium text-muted-foreground w-14">UOM</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-20">Unit Price</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-24">Base Amt</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-14">CGST%</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-20">CGST</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-14">SGST%</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-20">SGST</th>
                          <th className="text-right p-2 font-medium text-muted-foreground w-24 font-bold">Total</th>
                          <th className="text-left p-2 font-medium text-muted-foreground w-28">Product Type</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((li, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td className="p-2 text-muted-foreground">{idx + 1}</td>
                            <td className="p-2">
                              <Input value={li.description} onChange={(e) => updateLineItem(idx, "description", e.target.value)} className="h-7 text-xs" />
                            </td>
                            <td className="p-2">
                              <Input value={li.hsn_code || ""} onChange={(e) => updateLineItem(idx, "hsn_code", e.target.value)} className="h-7 text-xs" />
                            </td>
                            <td className="p-2">
                              <Input type="number" value={li.qty} onChange={(e) => updateLineItem(idx, "qty", parseInt(e.target.value) || 0)} className="h-7 text-xs text-right" />
                            </td>
                            <td className="p-2">
                              <Input value={li.uom || "NOS"} onChange={(e) => updateLineItem(idx, "uom", e.target.value)} className="h-7 text-xs" />
                            </td>
                            <td className="p-2">
                              <Input type="number" step="0.01" value={li.unit_price} onChange={(e) => updateLineItem(idx, "unit_price", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right" />
                            </td>
                            <td className="p-2 text-right font-medium">₹{li.base_amount?.toLocaleString("en-IN")}</td>
                            <td className="p-2">
                              <Input type="number" step="0.5" value={li.cgst_percent} onChange={(e) => updateLineItem(idx, "cgst_percent", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-12" />
                            </td>
                            <td className="p-2 text-right text-muted-foreground">₹{li.cgst_amount?.toLocaleString("en-IN")}</td>
                            <td className="p-2">
                              <Input type="number" step="0.5" value={li.sgst_percent} onChange={(e) => updateLineItem(idx, "sgst_percent", parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right w-12" />
                            </td>
                            <td className="p-2 text-right text-muted-foreground">₹{li.sgst_amount?.toLocaleString("en-IN")}</td>
                            <td className="p-2 text-right font-bold">₹{li.total_amount?.toLocaleString("en-IN")}</td>
                            <td className="p-2">
                              <Select value={li.suggested_product_type} onValueChange={(v) => updateLineItem(idx, "suggested_product_type", v)}>
                                <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {productTypes.map((pt) => (
                                    <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>
                                  ))}
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeLineItem(idx)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="shadow-card mt-4">
                <CardHeader><CardTitle className="text-sm">💰 Summary</CardTitle></CardHeader>
                <CardContent>
                  <div className="max-w-sm ml-auto space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taxable Value</span>
                      <span className="font-medium">₹{totals.base.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    {totals.cgst > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total CGST</span>
                        <span>₹{totals.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totals.sgst > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total SGST</span>
                        <span>₹{totals.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totals.igst > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total IGST</span>
                        <span>₹{totals.igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold text-base">
                      <span>Grand Total</span>
                      <span>₹{totals.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                    {grandTotalWords && (
                      <p className="text-xs text-muted-foreground italic">
                        Rupees {grandTotalWords} Only
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-3 mt-4">
                <Button onClick={handleAutoCreate} disabled={creating || lineItems.length === 0} className="gap-2">
                  {creating ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : <><CheckCircle2 className="h-4 w-4" />Import as {lineItems.length} Order(s)</>}
                </Button>
                <Button variant="outline" onClick={() => { setFile(null); setParsed(null); setLineItems([]); setEditHeader({}); }}>
                  Cancel
                </Button>
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
              {createdOrders.length} order(s) created from PO #{(getHeader("po_number") as string) || parsed?.po_number}
            </p>
            <div className="flex flex-wrap gap-2">
              {createdOrders.map((no) => (
                <Badge key={no} variant="secondary" className="font-mono">{no}</Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigate("/orders")}>View Orders</Button>
            <Button variant="outline" onClick={() => { setShowSuccess(false); setFile(null); setParsed(null); setLineItems([]); setEditHeader({}); setCreatedOrders([]); }}>
              Import Another PO
            </Button>
            <Button onClick={() => navigate("/")}>Dashboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
