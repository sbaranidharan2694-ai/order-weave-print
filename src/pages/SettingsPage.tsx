import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useWhatsAppTemplates, useCreateWhatsAppTemplate, useUpdateWhatsAppTemplate, useDeleteWhatsAppTemplate } from "@/hooks/useWhatsAppTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { X, Plus, Pencil, Trash2, CheckCircle2, Copy, ExternalLink, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: templates = [] } = useWhatsAppTemplates();
  const createTemplate = useCreateWhatsAppTemplate();
  const updateTemplate = useUpdateWhatsAppTemplate();
  const deleteTemplate = useDeleteWhatsAppTemplate();

  const [form, setForm] = useState<any>(null);
  const [newOperator, setNewOperator] = useState("");
  const [newPaper, setNewPaper] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [gstinTouched, setGstinTouched] = useState(false);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  useEffect(() => {
    if (settings) {
      setForm({
        business_name: settings.business_name,
        business_address: settings.business_address || "",
        contact_number: settings.contact_number || "",
        whatsapp_number: settings.whatsapp_number || "",
        gstin: settings.gstin || "",
        order_prefix: settings.order_prefix,
        operator_names: settings.operator_names || [],
        paper_types: settings.paper_types || [],
        product_types: settings.product_types || [],
        bank_account_name: (settings as any).bank_account_name || "",
        bank_account_number: (settings as any).bank_account_number || "",
        bank_ifsc: (settings as any).bank_ifsc || "",
        bank_name: (settings as any).bank_name || "",
        invoice_footer: (settings as any).invoice_footer || "",
        show_gst_breakdown: (settings as any).show_gst_breakdown !== false,
      });
    }
  }, [settings]);

  if (isLoading || !form) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const gstinError = gstinTouched && form.gstin && !GSTIN_REGEX.test(form.gstin);
  const gstinValid = form.gstin && GSTIN_REGEX.test(form.gstin);
  const update = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const addToList = (key: string, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    update(key, [...(form[key] || []), value.trim()]);
    setter("");
  };

  const removeFromList = (key: string, idx: number) => {
    update(key, form[key].filter((_: any, i: number) => i !== idx));
  };

  const handleSave = () => {
    if (gstinError) return;
    updateSettings.mutate(form);
  };

  const openTemplateModal = (template?: any) => {
    setEditingTemplate(template || null);
    setTemplateName(template?.name || "");
    setTemplateBody(template?.body || "");
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateName || !templateBody) return;
    if (editingTemplate) {
      await updateTemplate.mutateAsync({ id: editingTemplate.id, name: templateName, body: templateBody });
    } else {
      await createTemplate.mutateAsync({ name: templateName, body: templateBody });
    }
    setShowTemplateModal(false);
  };

  const ORDER_FORM_URL = "https://sbaranidharan2694-ai.github.io/superprinters-order-form/";

  const copyLink = () => {
    navigator.clipboard.writeText(ORDER_FORM_URL);
    toast.success("Link copied to clipboard!");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-24">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {/* Public Order Form */}
      <Card className="shadow-card border border-[#E5E7EB] rounded-xl p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader className="p-0 pb-4 border-b border-blue-100 mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-[15px] font-semibold text-[#1E293B]">Public Order Form</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Share this link with customers so they can place orders directly — no portal access required.</p>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          <div className="flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2">
            <span className="text-sm text-blue-700 font-mono flex-1 truncate">{ORDER_FORM_URL}</span>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 flex-shrink-0" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 flex-shrink-0" onClick={() => window.open(ORDER_FORM_URL, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">💡 Share via WhatsApp, print as a QR code on receipts, or add to your website.</p>
        </CardContent>
      </Card>

      <Card className="shadow-card border border-[#E5E7EB] rounded-xl p-6 mb-6">
        <CardHeader className="p-0 pb-4 border-b border-[#F1F5F9] mb-4">
          <CardTitle className="text-[15px] font-semibold text-[#1E293B]">Business Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Business Name</Label><Input value={form.business_name} onChange={(e) => update("business_name", e.target.value)} autoComplete="off" /></div>
            <div><Label>Order No. Prefix</Label><Input value={form.order_prefix} onChange={(e) => update("order_prefix", e.target.value)} /></div>
            <div><Label>Contact Number</Label><Input value={form.contact_number} onChange={(e) => update("contact_number", e.target.value)} autoComplete="off" /></div>
            <div><Label>WhatsApp Number</Label><Input value={form.whatsapp_number} onChange={(e) => update("whatsapp_number", e.target.value)} autoComplete="off" /></div>
            <div>
              <Label>GSTIN</Label>
              <div className="relative">
                <Input
                  value={form.gstin}
                  onChange={(e) => update("gstin", e.target.value.toUpperCase())}
                  onBlur={() => setGstinTouched(true)}
                  maxLength={15}
                  className={gstinError ? "border-destructive pr-8" : gstinValid ? "border-status-delivered pr-8" : ""}
                  placeholder="e.g. 33AADCC0948F1Z1"
                />
                {gstinValid && <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-status-delivered" />}
              </div>
              {gstinError && <p className="text-xs text-destructive mt-1">Invalid GSTIN format (must be 15 chars, e.g. 33AADCC0948F1Z1)</p>}
            </div>
          </div>
          <div><Label>Business Address</Label><Input value={form.business_address} onChange={(e) => update("business_address", e.target.value)} /></div>
        </CardContent>
      </Card>

      {/* List editors */}
      {[
        { key: "operator_names", label: "Operators", val: newOperator, set: setNewOperator },
        { key: "paper_types", label: "Paper Types", val: newPaper, set: setNewPaper },
        { key: "product_types", label: "Product Types", val: newProduct, set: setNewProduct },
      ].map(({ key, label, val, set }) => (
        <Card key={key} className="shadow-card border border-[#E5E7EB] rounded-xl p-6 mb-6">
          <CardHeader className="p-0 pb-4 border-b border-[#F1F5F9] mb-4">
            <CardTitle className="text-[15px] font-semibold text-[#1E293B]">{label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="flex gap-2">
              <Input value={val} onChange={(e) => set(e.target.value)} placeholder={`Add ${label.toLowerCase()}...`}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList(key, val, set))} />
              <Button type="button" variant="outline" size="icon" onClick={() => addToList(key, val, set)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form[key] || []).map((item: string, i: number) => (
                <span key={i} className="inline-flex items-center gap-1 bg-[#F1F5F9] text-[#1E293B] rounded-md py-1 px-2.5 text-[13px]">
                  {item}
                  <button type="button" onClick={() => removeFromList(key, i)} className="text-[#9CA3AF] hover:text-foreground"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Invoice Settings */}
      <Card className="shadow-card border border-[#E5E7EB] rounded-xl p-6 mb-6">
        <CardHeader className="p-0 pb-4 border-b border-[#F1F5F9] mb-4">
          <CardTitle className="text-[15px] font-semibold text-[#1E293B]">Invoice Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Bank Account Name</Label><Input value={form.bank_account_name} onChange={(e) => update("bank_account_name", e.target.value)} /></div>
            <div><Label>Account Number</Label><Input value={form.bank_account_number} onChange={(e) => update("bank_account_number", e.target.value)} /></div>
            <div><Label>IFSC Code</Label><Input value={form.bank_ifsc} onChange={(e) => update("bank_ifsc", e.target.value)} /></div>
            <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={(e) => update("bank_name", e.target.value)} /></div>
          </div>
          <div><Label>Invoice Footer / Terms</Label><Textarea value={form.invoice_footer} onChange={(e) => update("invoice_footer", e.target.value)} placeholder="e.g. Payment due within 30 days..." /></div>
          <div className="flex items-center gap-2">
            <Switch checked={form.show_gst_breakdown} onCheckedChange={(v) => update("show_gst_breakdown", v)} />
            <Label>Show GST breakdown on invoice</Label>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Templates */}
      <Card className="shadow-card border border-[#E5E7EB] rounded-xl p-6 mb-6">
        <CardHeader className="p-0 pb-4 border-b border-[#F1F5F9] mb-4">
          <CardTitle className="text-[15px] font-semibold text-[#1E293B] flex items-center justify-between">
            WhatsApp Templates
            <Button variant="outline" size="sm" onClick={() => openTemplateModal()}>
              <Plus className="h-3 w-3 mr-1" /> Add Template
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet</p>}
          {templates.map((t) => (
            <div key={t.id} className="flex items-start justify-between p-3 bg-muted rounded-md">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">
                {t.body.split(/(\{\{[^}]+\}\})/g).map((part, i) => (/\{\{[^}]+\}\}/.test(part) ? <span key={i} style={{ color: "#7C3AED" }}>{part}</span> : part))}
              </p>
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(t.body); toast.success("Template copied"); }}>Copy Template</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTemplateModal(t)} title="Edit template">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTemplate.mutate(t.id)} title="Delete template">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2">
            Available placeholders: <span className="text-[#7C3AED]">{"{{customer_name}}, {{order_no}}, {{product_type}}, {{quantity}}, {{status}}, {{delivery_date}}, {{amount}}, {{balance_due}}, {{qty_ordered}}, {{qty_fulfilled}}, {{qty_pending}}"}</span>
          </p>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 left-0 right-0 py-4 bg-background/95 border-t border-border">
        <Button onClick={handleSave} disabled={updateSettings.isPending || !!gstinError} className="py-3 px-8 rounded-lg font-semibold bg-[#F97316] hover:bg-[#ea580c] text-white" style={{ backgroundColor: "#F97316" }}>
          {updateSettings.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Template Modal */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingTemplate ? "Edit" : "Add"} WhatsApp Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Order Status Update" />
            </div>
            <div>
              <Label>Template Body</Label>
              <Textarea
                value={templateBody}
                onChange={(e) => setTemplateBody(e.target.value)}
                placeholder="Hi {{customer_name}}, your order {{order_no}}..."
                className="min-h-[120px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateName || !templateBody}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
