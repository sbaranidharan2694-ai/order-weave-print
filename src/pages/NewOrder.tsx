import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateOrder } from "@/hooks/useOrders";
import { useCustomerByContact } from "@/hooks/useCustomers";
import { useProductTypes } from "@/hooks/useProductTypes";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COLOR_MODES, ORDER_SOURCES } from "@/lib/constants";
import { AVAILABLE_TAGS, TAG_COLORS } from "@/hooks/useOrderTags";
import { format, addDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { UserCheck, Upload, X, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ImportPO from "./ImportPO";

const INSTRUCTION_TEMPLATES = [
  "Urgent job - call before print",
  "Client to approve proof",
  "Include sample in box",
  "VIP customer - priority",
  "Rush delivery",
];

export default function NewOrder() {
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const { data: productTypes = [] } = useProductTypes();
  const { data: settings } = useSettings();

  const [form, setForm] = useState({
    customer_name: "",
    contact_no: "",
    email: "",
    gstin: "",
    source: "manual" as string,
    product_type: "Visiting Cards",
    quantity: "",
    size: "",
    color_mode: "full_color" as string,
    paper_type: "",
    hsn_code: "",
    po_number: "",
    special_instructions: "",
    order_date: format(new Date(), "yyyy-MM-dd"),
    delivery_date: format(addDays(new Date(), 3), "yyyy-MM-dd"),
    amount: "",
    advance_paid: "",
    assigned_to: "",
  });

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [emailTouched, setEmailTouched] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const prevCustomerRef = useRef<string | null>(null);

  const { data: existingCustomer } = useCustomerByContact(form.contact_no);
  const operators = settings?.operator_names || [];

  useEffect(() => {
    if (existingCustomer) {
      const customerId = existingCustomer.id;
      if (prevCustomerRef.current !== customerId) {
        prevCustomerRef.current = customerId;
        setForm((f) => ({
          ...f,
          customer_name: existingCustomer.name,
          email: existingCustomer.email || "",
        }));
      }
    } else {
      prevCustomerRef.current = null;
    }
  }, [existingCustomer]);

  const handleProductTypeChange = (name: string) => {
    const pt = productTypes.find((p) => p.name === name);
    setForm((f) => ({
      ...f,
      product_type: name,
      size: pt?.default_size || f.size,
      color_mode: pt?.default_color_mode || f.color_mode,
      paper_type: pt?.default_paper_type || f.paper_type,
      hsn_code: pt?.hsn_code || f.hsn_code,
    }));
  };

  const amt = parseFloat(form.amount as string) || 0;
  const adv = parseFloat(form.advance_paid as string) || 0;
  const hasAmount = form.amount !== "" && !isNaN(parseFloat(form.amount));
  const balanceDue = amt - adv;
  const advanceError = hasAmount && adv > amt;
  const emailInvalid = emailTouched && form.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  const canSubmit =
    form.contact_no.length >= 10 &&
    form.customer_name &&
    form.product_type &&
    (parseInt(form.quantity as string) || 0) > 0 &&
    form.delivery_date &&
    !advanceError &&
    !emailInvalid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.customer_name?.trim()) errors.customer_name = "Customer name is required";
    if (!form.contact_no?.trim()) errors.contact_no = "Contact number is required";
    if (!form.product_type?.trim()) errors.product_type = "Product type is required";
    if (!form.delivery_date) errors.delivery_date = "Delivery date is required";
    if (!form.quantity || Number(form.quantity) < 1) errors.quantity = "Quantity must be at least 1";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    try {
      const order = await createOrder.mutateAsync({
        ...form,
        quantity: parseInt(form.quantity as string) || 1,
        amount: amt,
        advance_paid: adv,
      } as any);

      if (selectedTags.length > 0) {
        await supabase.from("order_tags").insert(
          selectedTags.map((t) => ({ order_id: order.id, tag_name: t })) as any
        );
      }

      for (const file of files) {
        const filePath = `${order.id}/${Date.now()}-${file.name}`;
        await supabase.storage.from("order-files").upload(filePath, file);
        const { data: { publicUrl } } = supabase.storage.from("order-files").getPublicUrl(filePath);
        await supabase.from("order_files").insert({
          order_id: order.id,
          filename: file.name,
          mime_type: file.type,
          file_size: file.size,
          storage_url: publicUrl,
        } as any);
      }

      navigate("/orders");
    } catch (err) {
      // Error handled by mutation
    }
  };

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const appendInstruction = (text: string) => {
    setForm((f) => ({
      ...f,
      special_instructions: f.special_instructions ? f.special_instructions + "\n" + text : text,
    }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">New Order</h1>

      <Tabs defaultValue="manual">
        <TabsList>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="import">Import from PO</TabsTrigger>
        </TabsList>

        <TabsContent value="import">
          <ImportPO />
        </TabsContent>

        <TabsContent value="manual">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Info */}
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-sm">Customer Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Contact No. *</Label>
                    <Input
                      type="tel"
                      value={form.contact_no}
                      onChange={(e) => update("contact_no", e.target.value.replace(/\D/g, "").slice(0, 10))}
                      required
                      placeholder="9876543210"
                    />
                    {formErrors.contact_no && <p className="text-xs text-destructive mt-1">{formErrors.contact_no}</p>}
                    {existingCustomer && (
                      <Badge variant="secondary" className="mt-1 gap-1 bg-status-delivered/10 text-status-delivered">
                        <UserCheck className="h-3 w-3" /> Returning Customer ({existingCustomer.total_orders} orders)
                      </Badge>
                    )}
                  </div>
                  <div>
                    <Label>Customer Name *</Label>
                    <Input value={form.customer_name} onChange={(e) => update("customer_name", e.target.value)} required />
                    {formErrors.customer_name && <p className="text-xs text-destructive mt-1">{formErrors.customer_name}</p>}
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      onBlur={() => { if (form.email.length > 0) setEmailTouched(true); else setEmailTouched(false); }}
                      autoComplete="off"
                    />
                    {emailInvalid && <p className="text-xs text-destructive mt-1">Invalid email format</p>}
                  </div>
                  <div>
                    <Label>GSTIN</Label>
                    <Input value={form.gstin} onChange={(e) => update("gstin", e.target.value)} placeholder="15-char GSTIN" maxLength={15} />
                  </div>
                  <div>
                    <Label>Source</Label>
                    <Select value={form.source} onValueChange={(v) => update("source", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORDER_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Details */}
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-sm">Order Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Product Type *</Label>
                    <Select value={form.product_type} onValueChange={handleProductTypeChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {productTypes.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {formErrors.product_type && <p className="text-xs text-destructive mt-1">{formErrors.product_type}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Defaults loaded from product type</p>
                  </div>
                  <div>
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(e) => update("quantity", e.target.value)}
                      placeholder="e.g. 100"
                    />
                    {formErrors.quantity && <p className="text-xs text-destructive mt-1">{formErrors.quantity}</p>}
                  </div>
                  <div>
                    <Label>Size</Label>
                    <Input value={form.size} onChange={(e) => update("size", e.target.value)} placeholder="e.g. 3.5 x 2 inches" />
                  </div>
                  <div>
                    <Label>Color Mode</Label>
                    <Select value={form.color_mode} onValueChange={(v) => update("color_mode", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COLOR_MODES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Paper Type</Label>
                    <Input value={form.paper_type} onChange={(e) => update("paper_type", e.target.value)} placeholder="e.g. 130gsm Art Paper" />
                  </div>
                  <div>
                    <Label>HSN Code</Label>
                    <Input value={form.hsn_code} onChange={(e) => update("hsn_code", e.target.value)} placeholder="Auto-filled from product type" />
                  </div>
                  <div>
                    <Label>PO Reference No.</Label>
                    <Input value={form.po_number} onChange={(e) => update("po_number", e.target.value)} placeholder="e.g. 94384819" />
                  </div>
                  <div>
                    <Label>Assigned To</Label>
                    {operators.length > 0 ? (
                      <Select value={form.assigned_to} onValueChange={(v) => update("assigned_to", v)}>
                        <SelectTrigger><SelectValue placeholder="Select operator" /></SelectTrigger>
                        <SelectContent>
                          {operators.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1 p-2 bg-muted rounded">No operators added — go to Settings</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Special Instructions & Tags */}
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-sm">Special Instructions & Tags</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {INSTRUCTION_TEMPLATES.map((t) => (
                      <Button key={t} type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => appendInstruction(t)}>
                        {t}
                      </Button>
                    ))}
                  </div>
                  <Textarea
                    value={form.special_instructions}
                    onChange={(e) => update("special_instructions", e.target.value.slice(0, 500))}
                    placeholder="Add print details, finishing, packing, delivery notes..."
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground text-right">{form.special_instructions.length}/500</p>
                </div>
                <div>
                  <Label className="mb-2 block">Order Tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                          selectedTags.includes(tag)
                            ? TAG_COLORS[tag]
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Artwork / Files */}
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-sm">Artwork / Files</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => document.getElementById("order-files-input")?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Drag files here or click to browse</p>
                  <p className="text-xs text-muted-foreground">.pdf, .ai, .psd, .jpg, .png, .zip — Max 50MB per file</p>
                  <input
                    id="order-files-input"
                    type="file"
                    multiple
                    accept=".pdf,.ai,.psd,.jpg,.jpeg,.png,.zip"
                    className="hidden"
                    onChange={handleFileAdd}
                  />
                </div>
                {files.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{files.length} file(s)</p>
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{f.name}</span>
                          <span className="text-xs text-muted-foreground">({(f.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dates & Payment */}
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-sm">Dates & Payment</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Order Date</Label>
                    <Input type="date" value={form.order_date} onChange={(e) => update("order_date", e.target.value)} />
                  </div>
                  <div>
                    <Label>Delivery Date *</Label>
                    <Input
                      type="date"
                      value={form.delivery_date}
                      onChange={(e) => update("delivery_date", e.target.value)}
                      min={form.order_date}
                      required
                    />
                    {formErrors.delivery_date && <p className="text-xs text-destructive mt-1">{formErrors.delivery_date}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Must be same or after order date</p>
                  </div>
                  <div>
                    <Label>Amount (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.amount}
                      onChange={(e) => update("amount", e.target.value)}
                      placeholder="e.g. 1500"
                    />
                  </div>
                  <div>
                    <Label>Advance Paid (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.advance_paid}
                      onChange={(e) => update("advance_paid", e.target.value)}
                      placeholder="e.g. 500"
                      className={advanceError ? "border-destructive" : ""}
                    />
                    {advanceError && <p className="text-xs text-destructive mt-1">Advance exceeds order amount</p>}
                  </div>
                  <div>
                    <Label>Balance Due (₹)</Label>
                    <Input
                      value={hasAmount ? `₹${Math.max(0, balanceDue).toLocaleString("en-IN")}` : "—"}
                      disabled
                      className="bg-muted font-semibold"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" disabled={createOrder.isPending || !canSubmit} className="px-8">
                {createOrder.isPending ? "Creating..." : "Create Order"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/")}>Cancel</Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
