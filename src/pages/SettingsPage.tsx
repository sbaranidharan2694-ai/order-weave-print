import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useWhatsAppTemplates, useCreateWhatsAppTemplate, useUpdateWhatsAppTemplate, useDeleteWhatsAppTemplate } from "@/hooks/useWhatsAppTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { X, Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

  if (isLoading || !form) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

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

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-sm">Business Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Business Name</Label><Input value={form.business_name} onChange={(e) => update("business_name", e.target.value)} /></div>
            <div><Label>Order No. Prefix</Label><Input value={form.order_prefix} onChange={(e) => update("order_prefix", e.target.value)} /></div>
            <div><Label>Contact Number</Label><Input value={form.contact_number} onChange={(e) => update("contact_number", e.target.value)} /></div>
            <div><Label>WhatsApp Number</Label><Input value={form.whatsapp_number} onChange={(e) => update("whatsapp_number", e.target.value)} /></div>
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
        <Card key={key} className="shadow-card">
          <CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={val} onChange={(e) => set(e.target.value)} placeholder={`Add ${label.toLowerCase()}...`}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addToList(key, val, set))} />
              <Button type="button" variant="outline" size="icon" onClick={() => addToList(key, val, set)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(form[key] || []).map((item: string, i: number) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {item}
                  <button onClick={() => removeFromList(key, i)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Invoice Settings */}
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-sm">Invoice Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
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
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            WhatsApp Templates
            <Button variant="outline" size="sm" onClick={() => openTemplateModal()}>
              <Plus className="h-3 w-3 mr-1" /> Add Template
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet</p>}
          {templates.map((t) => (
            <div key={t.id} className="flex items-start justify-between p-3 bg-muted rounded-md">
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTemplateModal(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTemplate.mutate(t.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Available placeholders: {"{{customer_name}}, {{order_no}}, {{product_type}}, {{quantity}}, {{status}}, {{delivery_date}}, {{amount}}, {{balance_due}}, {{qty_ordered}}, {{qty_fulfilled}}, {{qty_pending}}"}
          </p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updateSettings.isPending || !!gstinError} className="px-8">
        {updateSettings.isPending ? "Saving..." : "Save Settings"}
      </Button>

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
