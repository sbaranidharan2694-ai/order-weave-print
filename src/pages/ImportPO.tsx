import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useProductTypes } from "@/hooks/useProductTypes";
import { useCustomers } from "@/hooks/useCustomers";
import { createJobForOrderItem } from "@/hooks/useProductionJobs";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/utils/invokeEdgeFunction";
import { numberToWords } from "@/lib/numberToWords";
import { normalizeNumber } from "@/lib/numberUtils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  Upload, Loader2, FileText, Trash2, CheckCircle2, X, PlusCircle,
  AlertTriangle, ChevronDown, Eye, RotateCcw, FileWarning, RefreshCw
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { extractTextFromPdf } from "@/utils/extractPdfText";
import { extractTextFromExcel } from "@/utils/extractExcelText";
import { parsePOText } from "@/utils/parsePOText";
import { learnFromParse } from "@/utils/poPatternLearning";
import { logAudit } from "@/utils/auditLog";
import { toErrorMessage } from "@/lib/errors";
import * as XLSX from "xlsx";

/* ─── Constants ─── */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = [".pdf", ".png", ".jpg", ".jpeg", ".xlsx"];
const UNITS = ["Nos", "Sets", "Packs", "Reams", "Sheets", "Sq.ft", "Running ft", "Meters", "Pieces", "Copies", "KG", "Other"];
const GST_RATES = [0, 5, 12, 18, 28];
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

/* ─── Types ─── */
type LineItem = {
  /** Stable id so sorted-table edits update the correct row (indexOf breaks on duplicate rows). */
  id: string;
  sno: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  hsn_code: string;
  gst_rate: number;
  gst_amount: number;
  line_total: number;
};

function newLineId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `row-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/** Snap AI/parser GST to a valid slab so Select always shows a value. */
function snapGstRate(r: number): number {
  const n = Math.max(0, Math.min(100, normalizeNumber(r)));
  if (GST_RATES.includes(n)) return n;
  return GST_RATES.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best));
}

type POHeader = {
  po_number: string;
  po_date: string;
  customer_name: string;
  customer_address: string;
  customer_gst: string;
  customer_phone: string;
  customer_email: string;
  customer_contact_person: string;
  payment_terms: string;
  delivery_date: string;
  shipping_address: string;
  notes: string;
  discount_amount: number;
};

type ParseState = "empty" | "loading" | "parsed" | "error";

type POHistoryItem = {
  id: string;
  po_number?: string;
  vendor_name?: string;
  total_amount?: number;
  status?: string;
  created_at?: string;
  linked_order_id?: string;
  parsed_raw?: unknown;
};

/* ─── Helpers ─── */
function formatINR(n: number): string {
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateDisplay(d: string | null): string {
  if (!d) return "";
  try {
    const dt = new Date(d + "T00:00:00");
    return format(dt, "dd-MMM-yyyy");
  } catch { return d; }
}

function isRushOrder(deliveryDate: string): boolean {
  if (!deliveryDate) return false;
  const d = new Date(deliveryDate);
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays < 3;
}

function isPastDate(d: string): boolean {
  if (!d) return false;
  return new Date(d) < new Date(new Date().toDateString());
}

function isIntrastate(gst: string): boolean {
  if (!gst || gst.length < 2) return true;
  return gst.substring(0, 2) === "33";
}

function calcLineItem(li: LineItem): LineItem {
  const qty = li.quantity == null ? 0 : normalizeNumber(li.quantity);
  const price = Math.max(0, normalizeNumber(li.unit_price));
  const rate = Math.max(0, Math.min(100, normalizeNumber(li.gst_rate)));
  const base = qty * price;
  const gstAmt = Math.round(base * rate / 100 * 100) / 100;
  return { ...li, quantity: qty, unit_price: price, gst_rate: rate, gst_amount: gstAmt, line_total: Math.round((base + gstAmt) * 100) / 100 };
}

function emptyLine(sno: number): LineItem {
  return { id: newLineId(), sno, description: "", quantity: 0, unit: "Nos", unit_price: 0, hsn_code: "", gst_rate: 0, gst_amount: 0, line_total: 0 };
}

function lineItemFromParsed(li: any, idx: number): LineItem {
  const qtyRaw = li.quantity ?? li.qty;
  const qty = qtyRaw == null || qtyRaw === "" ? 0 : normalizeNumber(qtyRaw);
  const price = Math.max(0, normalizeNumber(li.unit_price ?? 0));
  // Honor explicit 0% GST. Only fall back to 18 when gst_rate is absent.
  const gstRate = 0;
  const base = qty * price;
  const gstAmt = Math.round(base * gstRate / 100 * 100) / 100;
  return {
    id: newLineId(),
    sno: idx + 1,
    description: String(li.description || "").trim(),
    quantity: qty,
    unit: String(li.unit || li.uom || "Nos").trim(),
    unit_price: price,
    hsn_code: String(li.hsn_code || "").trim(),
    gst_rate: gstRate,
    gst_amount: gstAmt,
    line_total: Math.round((base + gstAmt) * 100) / 100,
  };
}

function emptyHeader(): POHeader {
  return {
    po_number: "", po_date: format(new Date(), "yyyy-MM-dd"),
    customer_name: "", customer_address: "", customer_gst: "",
    customer_phone: "", customer_email: "", customer_contact_person: "",
    payment_terms: "", delivery_date: "", shipping_address: "", notes: "", discount_amount: 0,
  };
}

/** Convert common PO date strings to YYYY-MM-DD for HTML date inputs */
function normalizeDateForInput(v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    let y = dmy[3];
    if (y.length === 2) y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
    return `${y}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const mon: Record<string, string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"
  };
  const m1 = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s.](\d{2,4})$/);
  if (m1) {
    const yr = m1[3].length === 2 ? (parseInt(m1[3]) < 50 ? "20"+m1[3] : "19"+m1[3]) : m1[3];
    return `${yr}-${mon[m1[2].toLowerCase()] ?? "01"}-${m1[1].padStart(2,"0")}`;
  }
  const m2 = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i);
  if (m2) {
    return `${m2[3]}-${mon[m2[2].toLowerCase().slice(0,3)] ?? "01"}-${m2[1].padStart(2,"0")}`;
  }
  return "";
}

/** Validate a date string is a real YYYY-MM-DD; return null if invalid */
function safeDate(d: string | null | undefined): string | null {
  if (!d || typeof d !== "string") return null;
  const trimmed = d.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(trimmed + "T00:00:00");
  if (isNaN(parsed.getTime())) return null;
  return trimmed;
}

/* ─── Component ─── */
export default function ImportPO() {
  const navigate = useNavigate();
  const auth = useAuth();
  const qc = useQueryClient();
  const { data: productTypes = [] } = useProductTypes();
  const { data: customers = [] } = useCustomers();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // State
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [parseState, setParseState] = useState<ParseState>("empty");
  const [parseError, setParseError] = useState<string>("");
  const [parseTime, setParseTime] = useState(0);
  const [confidence, setConfidence] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rawText, setRawText] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugAiRawJson, setDebugAiRawJson] = useState<string>("");
  const [debugAfterJson, setDebugAfterJson] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<POHistoryItem[]>([]);
  const [showParseFailureModal, setShowParseFailureModal] = useState(false);
  const [parseFailureRawText, setParseFailureRawText] = useState("");
  const [parseFailureError, setParseFailureError] = useState("");
  const [parseRetriesExhausted, setParseRetriesExhausted] = useState(false);
  const [parseOcrFailed, setParseOcrFailed] = useState(false);
  const [parseStep, setParseStep] = useState<"idle" | "extracting" | "calling_ai">("idle");
  const parseAttemptsRef = useRef(0);

  const [header, setHeader] = useState<POHeader>(emptyHeader());
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<keyof LineItem | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedLineItems = useMemo(() => {
    if (!sortCol || sortCol === "id") return lineItems;
    return [...lineItems].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [lineItems, sortCol, sortDir]);

  const handleSort = useCallback((col: keyof LineItem) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }, [sortCol]);

  // Customer matching
  const customerMatch = useMemo(() => {
    if (!header.customer_name && !header.customer_gst && !header.customer_phone) return null;
    if (header.customer_gst && header.customer_gst.length === 15) {
      const m = customers.find(c => c.gstin?.toUpperCase() === header.customer_gst.toUpperCase());
      if (m) return { type: "exact" as const, customer: m };
    }
    if (header.customer_phone && header.customer_phone.length >= 10) {
      const m = customers.find(c => c.contact_no === header.customer_phone);
      if (m) return { type: "exact" as const, customer: m };
    }
    if (header.customer_name.length >= 3) {
      const q = header.customer_name.toLowerCase();
      const m = customers.find(c => (c.name || "").toLowerCase().includes(q) || q.includes((c.name || "").toLowerCase()));
      if (m) return { type: "similar" as const, customer: m };
    }
    return null;
  }, [header.customer_name, header.customer_gst, header.customer_phone, customers]);

  // Duplicate PO check
  const [dupPO, setDupPO] = useState<{ id: string; date: string } | null>(null);
  useEffect(() => {
    if (!header.po_number) { setDupPO(null); return; }
    const check = async () => {
      const { data } = await supabase.from("purchase_orders")
        .select("id, created_at").eq("po_number", header.po_number).maybeSingle();
      setDupPO(data ? { id: data.id, date: data.created_at || "" } : null);
    };
    const t = setTimeout(check, 500);
    return () => clearTimeout(t);
  }, [header.po_number]);

  // Totals
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    const totalGst = lineItems.reduce((s, li) => s + li.gst_amount, 0);
    const intra = isIntrastate(header.customer_gst);
    const cgst = intra ? Math.round(totalGst / 2 * 100) / 100 : 0;
    const sgst = intra ? Math.round(totalGst / 2 * 100) / 100 : 0;
    const igst = intra ? 0 : Math.round(totalGst * 100) / 100;
    const grand = Math.round((subtotal + totalGst - header.discount_amount) * 100) / 100;
    return { subtotal: Math.round(subtotal * 100) / 100, cgst, sgst, igst, totalGst, grand };
  }, [lineItems, header.discount_amount, header.customer_gst]);

  const amountInWords = useMemo(() => totals.grand > 0 ? numberToWords(totals.grand) : "", [totals.grand]);

  // Load history
  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from("purchase_orders")
      .select("id, po_number, vendor_name, total_amount, status, created_at, linked_order_id")
      .order("created_at", { ascending: false }).limit(20);
    setHistory(data || []);
  }, []);

  useEffect(() => {
    if (historyOpen) loadHistory();
  }, [historyOpen, loadHistory]);

  /* ─── File handling ─── */
  const acceptFile = (f: File) => {
    if (f.size > MAX_FILE_BYTES) { toast.error("File too large. Max 10MB."); return; }
    const ext = f.name.toLowerCase().split(".").pop() || "";
    if (!ACCEPTED_TYPES.some(a => a.replace(".", "") === ext)) {
      toast.error("Unsupported format. Use PDF, PNG, JPG, or XLSX."); return;
    }
    setFile(f);
    parseAttemptsRef.current = 0;
    setParseRetriesExhausted(false);
    setParseState("empty");
    setParseError("");
    setWarnings([]);
    setLineItems([]);
    setShowParseFailureModal(false);
    if (["png", "jpg", "jpeg"].includes(ext)) {
      setFilePreviewUrl(URL.createObjectURL(f));
    } else {
      setFilePreviewUrl(null);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  /* ─── PDF rendering ─── */
  const renderPdfPreview = async (f: File) => {
    if (!canvasContainerRef.current) return;
    canvasContainerRef.current.innerHTML = "";
    try {
       const pdfjsLib = await import("pdfjs-dist");
       const pdfWorkerSrc = new URL(
         "pdfjs-dist/build/pdf.worker.min.mjs",
         import.meta.url,
       ).toString();
       pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
       const buf = await f.arrayBuffer();
       const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "w-full mb-2 border border-border rounded";
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        canvasContainerRef.current?.appendChild(canvas);
      }
    } catch (err) {
      console.error("PDF render error:", err);
    }
  };

  /* ─── Excel preview ─── */
  const renderExcelPreview = async (f: File) => {
    if (!canvasContainerRef.current) return;
    canvasContainerRef.current.innerHTML = "";
    try {
      const buf = await f.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return;
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as (string | number)[][];
      if (rows.length === 0) {
        canvasContainerRef.current.innerHTML = "<p class='text-sm text-muted-foreground p-4'>Sheet is empty.</p>";
        return;
      }
      const table = document.createElement("table");
      table.className = "w-full border-collapse text-sm border border-border rounded overflow-hidden";
      const thead = document.createElement("thead");
      const tbody = document.createElement("tbody");
      const maxRows = Math.min(rows.length, 50);
      for (let i = 0; i < maxRows; i++) {
        const row = rows[i] ?? [];
        const tr = document.createElement("tr");
        const cells = Array.isArray(row) ? row : [row];
        for (let j = 0; j < cells.length; j++) {
          const cell = document.createElement(i === 0 ? "th" : "td");
          cell.className = i === 0 ? "px-2 py-1.5 text-left font-medium bg-muted border-b border-border" : "px-2 py-1 border-b border-border";
          cell.textContent = cells[j] != null ? String(cells[j]).trim() : "";
          tr.appendChild(cell);
        }
        (i === 0 ? thead : tbody).appendChild(tr);
      }
      if (thead.rows.length > 0) table.appendChild(thead);
      table.appendChild(tbody);
      const wrap = document.createElement("div");
      wrap.className = "rounded border border-border overflow-auto max-h-[560px]";
      wrap.appendChild(table);
      canvasContainerRef.current.appendChild(wrap);
    } catch (err) {
      console.error("Excel preview error:", err);
      if (canvasContainerRef.current) {
        canvasContainerRef.current.innerHTML = `<p class="text-sm text-muted-foreground p-4">Could not preview Excel file.</p>`;
      }
    }
  };

  useEffect(() => {
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop() || "";
    if (file.type === "application/pdf") renderPdfPreview(file);
    else if (ext === "xlsx" || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") renderExcelPreview(file);
  }, [file]);

  /** Populate form from parsed PO object (AI or rule-based). */
  const applyParsedToForm = useCallback((d: any, source?: string) => {
    const cust = d.customer || {};
    setHeader({
      po_number: d.po_number || "",
      po_date: normalizeDateForInput(d.po_date) || format(new Date(), "yyyy-MM-dd"),
      customer_name: cust.name || d.vendor_name || "",
      customer_address: cust.address || d.delivery_address || "",
      customer_gst: cust.gst_number || d.gstin || "",
      customer_phone: cust.phone || d.contact_no || "",
      customer_email: cust.email || d.contact_email || "",
      customer_contact_person: cust.contact_person || d.contact_person || "",
      payment_terms: d.payment_terms || "",
      delivery_date: normalizeDateForInput(d.delivery_date),
      shipping_address: d.shipping_address || "",
      notes: d.notes || d.remarks || "",
      discount_amount: d.discount_amount || 0,
    });
    const items: LineItem[] = (d.line_items || []).map((li: any, idx: number) => lineItemFromParsed(li, idx));
    if (items.length === 0) items.push(emptyLine(1));
    setLineItems(items);
    setConfidence(d.confidence || "medium");
    setWarnings(d.warnings || []);
    setParseState("parsed");
    const msg = source ? `Parsed with ${source}. Please verify.` : `PO parsed: ${items.length} line item(s) found`;
    toast.success(msg);
  }, [debugOpen, debugAiRawJson, rawText]);

  const maybeOpenDebugOnParse = useCallback(
    (d: any, raw: string) => {
      if (!debugOpen) return;
      try {
        setDebugAiRawJson(JSON.stringify(d, null, 2));
      } catch {
        setDebugAiRawJson(String(d));
      }
      try {
        if (d && typeof d === "object") {
          const after = {
            po_number: d.po_number,
            po_date: d.po_date,
            payment_terms: d.payment_terms,
            customer: d.customer,
            line_items: d.line_items,
            subtotal: d.subtotal,
            cgst: d.cgst,
            sgst: d.sgst,
            igst: d.igst,
            total_amount: d.total_amount,
            warnings: d.warnings,
          };
          setDebugAfterJson(JSON.stringify(after, null, 2));
        }
      } catch {
        setDebugAfterJson("");
      }
      setRawText(raw);
    },
    [debugOpen],
  );

  /** Try rule-based parser; return parsed PO if it has at least one line item, else null */
  const tryRuleParserFallback = useCallback((extractedText: string): any | null => {
    if (!extractedText || extractedText.trim().length < 10) return null;
    try {
      const fallback = parsePOText(extractedText);
      if (fallback && Array.isArray(fallback.line_items) && fallback.line_items.length > 0) {
        console.log("[ImportPO] Rule parser fallback OK, line items:", fallback.line_items.length);
        return fallback;
      }
    } catch (e) {
      console.warn("[ImportPO] Rule parser error:", e);
    }
    return null;
  }, []);

  /* ─── Parse ─── */
  const handleParse = async () => {
    if (!file) return;
    setParseState("loading");
    setParseError("");
    setParseStep("extracting");
    setShowParseFailureModal(false);
    const startTime = Date.now();
    let lastExtractedText = "";

    try {
      const ext = file.name.toLowerCase().split(".").pop() || "";
      let text = "";
      setParseOcrFailed(false);

      if (["png", "jpg", "jpeg"].includes(ext)) {
        try {
          const { createWorker } = await import("tesseract.js");
          const worker = await createWorker("eng");
          const { data: { text: ocrText } } = await worker.recognize(file);
          await worker.terminate();
          text = ocrText?.trim() || "";
        } catch { text = ""; }
        if (text.length < 20) {
          setParseStep("idle");
          setParseState("error");
          setParseError("Could not extract text from this image. Please upload a clearer scan or PDF.");
          return;
        }
      } else if (ext === "xlsx") {
        const result = await extractTextFromExcel(file);
        text = result.text;
      } else {
        const result = await extractTextFromPdf(file);
        text = result.text;
        setParseOcrFailed(!!result.ocrFailed);
      }

      const minTextLen = ext === "xlsx" ? 4 : 20;
      if (!text || text.trim().length < minTextLen) {
        setParseStep("idle");
        setParseState("error");
        setParseError("Could not extract text from this file. It may be a scanned image. Try entering details manually.");
        return;
      }

      lastExtractedText = text;
      setRawText(text);
      let ruleBackup: ReturnType<typeof parsePOText> | null = null;
      try {
        ruleBackup = parsePOText(text);
      } catch (e) {
        console.warn("[ImportPO] Rule parser during extract:", e);
      }
      const ruleHasLines = !!(ruleBackup?.line_items?.length);

      setParseStep("calling_ai");
      console.log("[ImportPO] Extracted text length:", text.length, "source:", ext, "rule line items:", ruleBackup?.line_items?.length ?? 0);

      if (parseAttemptsRef.current >= 3) {
        const fallback = ruleHasLines && ruleBackup ? ruleBackup : tryRuleParserFallback(text);
        if (fallback) {
          setParseStep("idle");
          applyParsedToForm(fallback, "rule-based parser (AI retries exhausted)");
          setParseTime(Math.round((Date.now() - startTime) / 1000));
          toast.success("Parsed with Rule Parser (AI retries exhausted)");
          return;
        }

        setParseStep("idle");
        setParseRetriesExhausted(true);
        toast.error("Max parse attempts reached. Use Rule Parser or enter manually.");
        setParseState("error");
        setParseFailureError("Max retries reached");
        setParseFailureRawText("");
        setShowParseFailureModal(true);
        return;
      }
      parseAttemptsRef.current += 1;

      const aiResult = await invokeEdgeFunction<{
        success?: boolean;
        data?: any;
        error?: string;
        parse_error?: string;
        raw_ai_text?: string;
      }>("parse-po", { pdfText: text });

      const { data: body, error: aiError } = aiResult;
      console.log("[ImportPO] AI response success:", body?.success, "hasData:", !!body?.data, "error:", aiError || body?.error);

      if (aiError) {
        const fallback = ruleHasLines && ruleBackup ? ruleBackup : tryRuleParserFallback(text);
        if (fallback) {
          setParseStep("idle");
          applyParsedToForm(fallback, "rule-based parser (AI unavailable)");
          setParseTime(Math.round((Date.now() - startTime) / 1000));
          return;
        }
        setParseStep("idle");
        setParseState("error");
        setParseError(aiError);
        return;
      }

      if (body?.success === false) {
        const fallback = ruleHasLines && ruleBackup ? ruleBackup : tryRuleParserFallback(text);
        if (fallback) {
          setParseStep("idle");
          applyParsedToForm(fallback, "rule-based parser");
          setParseTime(Math.round((Date.now() - startTime) / 1000));
          console.log("[ImportPO] Used rule parser fallback after AI failure, line items:", fallback.line_items?.length);
          return;
        }
        setParseStep("idle");
        const rawPreview = (body.raw_ai_text || body.parse_error || "").slice(0, 1500);
        setParseFailureRawText(rawPreview);
        setParseFailureError(body.error || body.parse_error || "AI could not parse this PO format.");
        setParseState("error");
        setParseRetriesExhausted(parseAttemptsRef.current >= 3);
        setShowParseFailureModal(true);
        console.warn("[ImportPO] Parse failed, no fallback:", body.error, "raw length:", (body.raw_ai_text || "").length);
        return;
      }

      const d = body?.data ?? body;
      if (!d || typeof d !== "object") {
        const fallback = ruleHasLines && ruleBackup ? ruleBackup : tryRuleParserFallback(text);
        if (fallback) {
          setParseStep("idle");
          applyParsedToForm(fallback, "rule-based parser");
          setParseTime(Math.round((Date.now() - startTime) / 1000));
          return;
        }
        setParseStep("idle");
        setParseFailureRawText("");
        setParseFailureError("No parsed data returned.");
        setParseState("error");
        setShowParseFailureModal(true);
        return;
      }

      const hasLineItems = Array.isArray(d.line_items) && d.line_items.length > 0;
      if (hasLineItems) {
        setParseStep("idle");
        applyParsedToForm(d);
        maybeOpenDebugOnParse(d, text);
        setParseTime(Math.round((Date.now() - startTime) / 1000));
        toast.success(`PO parsed: ${d.line_items.length} line item(s) found`);
        console.log("[ImportPO] Populated form, line items:", d.line_items.length, "po_number:", d.po_number || "(missing)");
        try {
          await learnFromParse(text, d, d.customer?.name || d.vendor_name || null);
        } catch (e) {
          console.warn("[ImportPO] Learning failed (non-critical):", e);
        }
        return;
      }

      /* AI returned header but no lines — merge rule-based line items */
      if (ruleHasLines && ruleBackup) {
        const r = ruleBackup;
        const dc = d.customer || {};
        const merged = {
          po_number: d.po_number || r.po_number || "",
          po_date: d.po_date || r.po_date || "",
          customer: {
            name: dc.name || d.vendor_name || r.customer?.name || "",
            address: dc.address || r.customer?.address || d.delivery_address || "",
            gst_number: dc.gst_number || d.gstin || r.customer?.gst_number || "",
            contact_person: dc.contact_person || r.customer?.contact_person || d.contact_person || "",
            phone: dc.phone || d.contact_no || r.customer?.phone || "",
            email: dc.email || d.contact_email || r.customer?.email || "",
          },
          vendor_name: d.vendor_name || r.vendor_name,
          delivery_address: d.delivery_address || r.delivery_address,
          gstin: d.gstin || r.gstin,
          contact_no: d.contact_no || r.contact_no,
          payment_terms: d.payment_terms || r.payment_terms || "",
          delivery_date: d.delivery_date || r.delivery_date || "",
          line_items: r.line_items,
          subtotal: r.subtotal,
          cgst: d.cgst ?? r.cgst,
          sgst: d.sgst ?? r.sgst,
          igst: d.igst ?? r.igst,
          total_amount: d.total_amount || r.total_amount,
          discount_amount: normalizeNumber(d.discount_amount),
          shipping_address: d.shipping_address || "",
          notes: d.notes || d.remarks || "",
          confidence: "medium",
          warnings: [...(Array.isArray(d.warnings) ? d.warnings : []), "Line items from rule-based parser; AI did not return rows."],
        };
        setParseStep("idle");
        applyParsedToForm(merged, "AI header + rule-based line items");
        setParseTime(Math.round((Date.now() - startTime) / 1000));
        toast.success(`Imported ${r.line_items.length} line item(s) via rule parser (AI had no rows)`);
        return;
      }

      const fallback = ruleHasLines && ruleBackup ? ruleBackup : tryRuleParserFallback(text);
      if (fallback && fallback.line_items && fallback.line_items.length > 0) {
        setParseStep("idle");
        applyParsedToForm(fallback, "rule-based parser");
        setParseTime(Math.round((Date.now() - startTime) / 1000));
        return;
      }
      setParseStep("idle");
      setParseFailureRawText(JSON.stringify(d).slice(0, 1000));
      setParseFailureError("No line items found. You can retry or use the rule-based parser.");
      setParseState("error");
      setParseRetriesExhausted(parseAttemptsRef.current >= 3);
      setShowParseFailureModal(true);
      console.warn("[ImportPO] No line items in AI or fallback");
    } catch (err) {
      setParseStep("idle");
      const msg = toErrorMessage(err);
      const isPasswordRequired = msg === "PASSWORD_REQUIRED";
      try {
        if (lastExtractedText.trim().length >= 4) {
          const fb = parsePOText(lastExtractedText);
          if (fb.line_items?.length) {
            applyParsedToForm(fb, "rule-based parser (after error)");
            setParseTime(0);
            toast.info("Used rule-based parser — please verify.");
            return;
          }
        }
      } catch { /* ignore */ }
      setParseState("error");
      setParseError(isPasswordRequired ? "This PDF is password-protected. Please remove the password or use an unprotected copy." : (msg || "Parsing failed"));
      setParseFailureError(isPasswordRequired ? "This PDF is password-protected." : (msg || "Parsing failed"));
      setParseFailureRawText("");
      setShowParseFailureModal(true);
    }
  };

  const handleUseRuleParser = () => {
    if (!rawText || rawText.trim().length < 10) {
      toast.error("No text available for rule parser. Extract text from a PDF first.");
      return;
    }
    console.log("[ImportPO] Using rule-based fallback parser, text length:", rawText.length);
    try {
      const fallback = parsePOText(rawText);
      applyParsedToForm(fallback, "rule-based parser");
      setShowParseFailureModal(false);
      setParseFailureRawText("");
      setParseFailureError("");
    } catch (e) {
      console.error("[ImportPO] Rule parser error:", e);
      toast.error(toErrorMessage(e) || "Rule parser failed. Please enter details manually.");
    }
  };

  const debugToggle = () => setDebugOpen((v) => !v);

  const handleOpenManualEditor = () => {
    setShowParseFailureModal(false);
    setParseFailureRawText("");
    setParseFailureError("");
    setParseState("parsed");
    setLineItems([emptyLine(1)]);
    setHeader(emptyHeader());
    toast.info("Manual mode — fill in the PO details");
  };

  /* ─── Line item operations ─── */
  const updateLine = (rowId: string, field: keyof LineItem, value: unknown) => {
    if (field === "id") return;
    setLineItems(items => items.map((li) => {
      if (li.id !== rowId) return li;
      let normalized = value;
      if (field === "quantity") normalized = value === "" ? 0 : Math.max(0, Math.floor(normalizeNumber(value)));
      else if (field === "unit_price") normalized = Math.max(0, normalizeNumber(value));
      else if (field === "gst_rate") normalized = snapGstRate(normalizeNumber(value));
      else if (field === "sno") normalized = Math.max(1, Math.floor(normalizeNumber(value)));
      const updated = { ...li, [field]: normalized } as LineItem;
      return calcLineItem(updated);
    }));
  };

  const removeLine = (rowId: string) => {
    setLineItems(items => items.filter(li => li.id !== rowId).map((li, i) => ({ ...li, sno: i + 1 })));
  };

  const addLine = () => {
    setFormErrors(prev => ({ ...prev, line_items: "" }));
    setLineItems(items => [...items, emptyLine(items.length + 1)]);
  };

  /* ─── Create Order (with transaction safety) ─── */
  const handleCreate = async () => {
    const errors: Record<string, string> = {};
    if (!header.po_number) errors.po_number = "PO Number is required";
    if (!header.customer_name.trim()) errors.customer_name = "Customer name is required";
    if (lineItems.length === 0 || lineItems.every(li => li.quantity <= 0)) {
      errors.line_items = "At least one line item with qty > 0 required";
    }
    if (dupPO) {
      errors.dup = `PO #${header.po_number} already imported on ${formatDateDisplay(dupPO.date)}. Duplicates not allowed.`;
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (errors.po_number) toast.error(errors.po_number);
      else if (errors.customer_name) toast.error(errors.customer_name);
      else if (errors.line_items) toast.error(errors.line_items);
      else if (errors.dup) toast.error(errors.dup);
      return;
    }

    setCreating(true);
    let poId: string | null = null;

    try {
      // 1. Customer: find or create
      let customerId: string | null = null;
      if (customerMatch?.type === "exact") {
        customerId = customerMatch.customer.id;
      } else {
        // Search by GST first, then name
        let existing: { id: string } | null = null;
        if (header.customer_gst && header.customer_gst.length === 15) {
          const { data } = await supabase.from("customers")
            .select("id").eq("gstin", header.customer_gst.toUpperCase()).maybeSingle();
          existing = data;
        }
        if (!existing && header.customer_name.trim()) {
          const { data } = await supabase.from("customers")
            .select("id").eq("name", header.customer_name.trim()).maybeSingle();
          existing = data;
        }
        if (existing) {
          customerId = existing.id;
        } else if (header.customer_name.trim()) {
          const { data: newC, error: cErr } = await supabase.from("customers").insert({
            name: header.customer_name.trim(),
            contact_no: header.customer_phone || "",
            email: header.customer_email || null,
            gstin: header.customer_gst || null,
            address: header.customer_address || null,
            total_orders: 0, total_spend: 0,
          }).select("id").single();
          if (cErr) throw new Error("Customer creation failed: " + cErr.message);
          customerId = newC.id;
          toast.success(`New customer '${header.customer_name}' created`);
        }
      }

      // 2. Upload file (path: userId/filename for storage RLS)
      let fileUrl: string | null = null;
      if (file) {
        const userId = auth?.user?.id ?? "anon";
        const ext = file.name.split(".").pop() || "pdf";
        const path = `${userId}/po-${header.po_number.replace(/[^a-zA-Z0-9-]/g, "_")}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("po-documents").upload(path, file, { upsert: false });
        if (!upErr) {
          const { data: urlD } = supabase.storage.from("po-documents").getPublicUrl(path);
          fileUrl = urlD?.publicUrl || path;
        }
      }

      // 3. Insert PO with status "Imported"
      const deliveryDate = safeDate(header.delivery_date);
      const createdBy = auth?.user?.id ?? null;
      const { data: poRec, error: poErr } = await supabase.from("purchase_orders").insert({
        po_number: header.po_number,
        po_date: safeDate(header.po_date) || null,
        vendor_name: header.customer_name.trim(),
        created_by: createdBy,
        contact_no: header.customer_phone || null,
        contact_person: header.customer_contact_person || null,
        customer_email: header.customer_email || null,
        gstin: header.customer_gst || null,
        delivery_address: header.customer_address || null,
        delivery_date: deliveryDate,
        payment_terms: header.payment_terms || null,
        currency: "INR",
        subtotal: totals.subtotal,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        discount_amount: header.discount_amount,
        total_amount: totals.grand,
        tax_amount: totals.totalGst,
        amount_in_words: amountInWords,
        shipping_address: header.shipping_address || null,
        notes: header.notes || null,
        file_name: file?.name || null,
        po_file_url: fileUrl,
        parsed_data: { header, lineItems },
        parsed_raw: { header, lineItems, rawText },
        status: "Imported",
      } as any).select("id").single();

      if (poErr) throw new Error("PO creation failed: " + poErr.message);
      poId = poRec.id;
      await logAudit("PO imported", "purchase_order", poId);

      // 4. Insert line items
      const { error: liErr } = await supabase.from("purchase_order_line_items").insert(
    lineItems.map((li, idx) => ({
      purchase_order_id: poId,
      line_item_no: idx + 1,
      description: li.description,
      hsn_code: li.hsn_code || null,
      qty: Math.max(0, Number(normalizeNumber(li.quantity))),
      uom: li.unit,
      unit_price: Math.max(0, Number(normalizeNumber(li.unit_price))),
      amount: Number(normalizeNumber(li.line_total)),
      gst_rate: Number(normalizeNumber(li.gst_rate)),
      gst_amount: Number(normalizeNumber(li.gst_amount)),
      line_total: Number(normalizeNumber(li.line_total)),
      sort_order: idx,
      status: "pending",
    })) as any
  );
      if (liErr) throw new Error("Line items creation failed: " + liErr.message);

      // 5. Create one order per PO with one order_item per line and one production_job per item
      const validLines = lineItems.filter(li => (li.quantity || 0) > 0 && (li.description || "").trim());
      const validLineCount = validLines.length;
      let orderId: string | null = null;
      let orderNo: string | null = null;

      if (validLineCount > 0) {
        const { data: generatedOrderNo, error: rpcErr } = await supabase.rpc("generate_order_no");
        if (rpcErr || !generatedOrderNo) {
          toast.warning(`PO saved but order number generation failed: ${rpcErr?.message || "unknown"}`);
        } else {
          const totalQty = validLines.reduce((s, li) => s + (li.quantity || 0), 0);
          const orderDeliveryDate = deliveryDate || format(new Date(), "yyyy-MM-dd");

          const { data: order, error: oErr } = await supabase.from("orders").insert({
            order_no: generatedOrderNo,
            created_by: createdBy,
            customer_name: header.customer_name.trim(),
            contact_no: header.customer_phone || "",
            email: header.customer_email || null,
            source: "purchase_order",
            status: "Order Received",
            product_type: "Purchase Order",
            quantity: totalQty,
            qty_ordered: totalQty,
            qty_pending: totalQty,
            qty_fulfilled: 0,
            size: "",
            color_mode: "full_color" as any,
            paper_type: "",
            special_instructions: `PO #${header.po_number} — ${validLineCount} line item(s).`,
            order_date: safeDate(header.po_date) || format(new Date(), "yyyy-MM-dd"),
            delivery_date: orderDeliveryDate,
            amount: totals.grand,
            advance_paid: 0,
            po_id: poId,
            po_number: header.po_number,
            po_contact_person: header.customer_contact_person,
            gstin: header.customer_gst,
            hsn_code: validLines[0]?.hsn_code ?? "",
            base_amount: totals.subtotal,
            cgst_percent: isIntrastate(header.customer_gst) ? 9 : 0,
            cgst_amount: isIntrastate(header.customer_gst) ? totals.cgst : 0,
            sgst_percent: isIntrastate(header.customer_gst) ? 9 : 0,
            sgst_amount: isIntrastate(header.customer_gst) ? totals.sgst : 0,
            igst_percent: isIntrastate(header.customer_gst) ? 0 : 18,
            igst_amount: isIntrastate(header.customer_gst) ? 0 : totals.igst,
            total_tax_amount: totals.totalGst,
          } as any).select("id, order_no").single();

          if (oErr) {
            toast.warning(`PO saved but order creation failed: ${oErr.message}`);
          } else if (order) {
            orderId = order.id;
            orderNo = order.order_no;
            await logAudit("Order created", "order", order.id);
            await supabase.from("order_tags").insert({ order_id: order.id, tag_name: "From PO" } as any);

            const orderItemRows = validLines.map((li, idx) => ({
              order_id: order.id,
              item_no: idx + 1,
              description: (li.description || "").trim(),
              quantity: Math.max(0, Number(normalizeNumber(li.quantity))),
              unit_price: Math.max(0, Number(normalizeNumber(li.unit_price))),
              amount: Number(normalizeNumber(li.line_total)),
            }));
            const { data: insertedItems, error: itemsErr } = await supabase
              .from("order_items")
              .insert(orderItemRows as any)
              .select("id, description, quantity");
            if (itemsErr) {
              toast.warning(`Order created but line items failed: ${itemsErr.message}`);
            } else if (insertedItems?.length) {
              for (const item of insertedItems) {
                await createJobForOrderItem(
                  { id: item.id, description: item.description, quantity: item.quantity },
                  { id: order.id, delivery_date: orderDeliveryDate, assigned_to: null }
                );
              }
            }
          }
        }
      }

      // 6. Update PO status and link the single order
      const newStatus = orderId ? "Processed" : (validLineCount === 0 ? "Imported" : "Failed");
      const updatePayload: Record<string, any> = { status: newStatus };
      if (orderId) {
        updatePayload.linked_order_id = orderId;
      }
      await supabase.from("purchase_orders").update(updatePayload).eq("id", poId);

      qc.invalidateQueries({ queryKey: ["purchase_orders"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["customers"] });

      if (orderNo) {
        toast.success(`✅ PO #${header.po_number} imported! 1 order created: ${orderNo} (${validLineCount} line items)`);
      } else if (validLineCount === 0) {
        toast.info("PO saved but no orders created (no valid line items).");
      }

      setFormErrors({});
      navigate("/orders");
    } catch (err) {
      if (poId) {
        try {
          await supabase.from("purchase_orders").delete().eq("id", poId);
          toast.info("Import rolled back — please try again.");
        } catch {
          toast.warning("Import failed. A partial PO record may exist — check PO history before retrying.");
        }
      }
      toast.error("Import failed: " + toErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  /* ─── Retry: re-process a previously imported/failed PO ─── */
  const handleRetry = async (po: POHistoryItem) => {
    if (!po?.id || !po?.parsed_raw) {
      toast.error("No parsed data available for retry");
      return;
    }
    const raw = po.parsed_raw as any;
    if (raw.header) setHeader(raw.header);
    if (raw.lineItems) {
      const normalized = (raw.lineItems as LineItem[]).map((li, idx) => {
        const row = { ...li, id: li.id || newLineId(), sno: idx + 1 };
        return calcLineItem({
          ...row,
          quantity: Math.max(0, normalizeNumber(row.quantity)),
          unit_price: Math.max(0, normalizeNumber(row.unit_price)),
          gst_rate: snapGstRate(row.gst_rate),
        });
      });
      setLineItems(normalized);
    }
    if (raw.rawText) setRawText(raw.rawText);
    setParseState("parsed");
    setConfidence("medium");
    toast.info(`Loaded PO #${po.po_number} for retry. Review and click "Create Order from PO".`);
  };

  /* ─── Re-parse ─── */
  const handleReparse = async () => {
    if (!rawText) { toast.error("No text to re-parse"); return; }
    setParseState("loading");
    const startTime = Date.now();
    try {
      const hint = `Previous parse had issues. User corrections: customer=${header.customer_name}, po_number=${header.po_number}. Re-parse carefully:\n\n${rawText}`;
      const { data, error } = await invokeEdgeFunction<{ success?: boolean; data?: any; line_items?: any[] }>("parse-po", { pdfText: hint });
      if (error) {
        try {
          const rule = parsePOText(rawText);
          if (rule.line_items?.length) {
            applyParsedToForm(rule, "rule-based parser (AI unavailable)");
            setParseTime(Math.round((Date.now() - startTime) / 1000));
            toast.success(`Used rule parser: ${rule.line_items.length} line item(s)`);
          } else {
            toast.error(error);
          }
        } catch {
          toast.error(error);
        }
        setParseState("parsed");
        return;
      }
      const body = data as Record<string, unknown> | null;
      const d = (body?.data ?? body) as { line_items?: any[] } | null;
      const lines = Array.isArray(d?.line_items) ? d!.line_items! : [];
      if (lines.length > 0) {
        const items = lines.map((li: any, idx: number) => lineItemFromParsed(li, idx));
        setLineItems(items);
        setParseTime(Math.round((Date.now() - startTime) / 1000));
        toast.success(`Re-parsed: ${items.length} item(s) found`);
      } else {
        try {
          const rule = parsePOText(rawText);
          if (rule.line_items?.length) {
            applyParsedToForm(rule, "rule-based parser");
            setParseTime(Math.round((Date.now() - startTime) / 1000));
            toast.success(`AI returned no rows; used rule parser: ${rule.line_items.length} item(s)`);
          } else {
            toast.warning("Re-parse found no line items. Edit manually or upload a clearer PDF.");
          }
        } catch {
          toast.warning("Re-parse found no line items.");
        }
      }
      setParseState("parsed");
    } catch (e) {
      toast.error(toErrorMessage(e));
      setParseState("parsed");
    }
  };

  /* ─── Discard ─── */
  const handleDiscard = () => {
    setFile(null); setFilePreviewUrl(null); setParseState("empty"); setParseError("");
    setLineItems([]); setRawText(""); setWarnings([]); setParseOcrFailed(false);
    setHeader(emptyHeader());
    setShowDiscard(false);
  };

  /* ─── Use matched customer ─── */
  const useMatchedCustomer = () => {
    if (!customerMatch) return;
    const c = customerMatch.customer;
    setHeader(h => ({
      ...h,
      customer_name: c.name,
      customer_phone: c.contact_no || h.customer_phone,
      customer_email: c.email || h.customer_email,
      customer_gst: c.gstin || h.customer_gst,
      customer_address: c.address || h.customer_address,
    }));
  };

  const gstValid = header.customer_gst ? GST_REGEX.test(header.customer_gst) : null;

  /* ─── Render ─── */
  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-4">Import Purchase Order</h1>

      {/* Split screen layout: left 45%, right 55%, divider */}
      <div className="grid grid-cols-1 lg:grid-cols-[45%_1px_55%] gap-0 items-stretch">
        {/* LEFT PANEL — Upload & Preview */}
        <div className="space-y-4 min-w-0">
          <Card className="border border-[#E5E7EB]">
            <CardContent className="p-4">
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload purchase order document"
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                className="border-2 border-dashed border-[#CBD5E1] rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer min-h-[120px] flex flex-col items-center justify-center bg-[#F8FAFC]"
              >
                <Upload className="h-12 w-12 mx-auto text-[#F97316] mb-3" />
                <p className="font-medium text-foreground">Drop your Purchase Order here</p>
                <p className="text-sm text-muted-foreground mt-1">PDF, PNG, JPG, or XLSX — Max 10MB</p>
                <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(",")} className="hidden" aria-label="Purchase order file"
                  onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }} />
              </div>

              {file && (
                <div className="mt-3 flex items-center justify-between p-3 bg-muted rounded-md">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => { setFile(null); setFilePreviewUrl(null); setParseState("empty"); }}>
                      <X className="h-4 w-4" />
                    </Button>
                    {parseState !== "loading" && (
                      <Button onClick={handleParse} size="sm">
                        {parseState === "parsed" ? "Re-parse" : "Parse with AI"}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {file && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Document Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 max-h-[600px] overflow-y-auto">
                {filePreviewUrl ? (
                  <img src={filePreviewUrl} alt="PO Preview" className="w-full rounded" />
                ) : (
                  <div ref={canvasContainerRef} />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="hidden lg:block w-px bg-border min-h-0 self-stretch" aria-hidden />

        {/* RIGHT PANEL — Form */}
        <div className="space-y-4 min-w-0">
          {parseState === "empty" && !file && (
            <Card className="h-64 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileWarning className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Upload a Purchase Order to get started</p>
                <p className="text-sm mt-1">Supported: PDF, PNG, JPG, XLSX</p>
              </div>
            </Card>
          )}

          {parseState === "empty" && file && (
            <Card className="h-64 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <p className="font-medium">Click "Parse with AI" to extract data</p>
                <p className="text-sm mt-1">AI will analyze and extract all PO fields</p>
                {["png", "jpg", "jpeg"].includes(file.name.toLowerCase().split(".").pop() || "") && (
                  <p className="text-xs mt-2 opacity-90">For images, AI will use the preview to extract text where possible.</p>
                )}
              </div>
            </Card>
          )}

          {parseState === "loading" && (
            <Card className="h-64 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary mb-3" />
                <p className="font-medium text-foreground">{parseStep === "extracting" ? "Extracting text…" : "Calling AI…"}</p>
                <p className="text-sm text-muted-foreground mt-1">This usually takes 10-20 seconds</p>
              </div>
            </Card>
          )}

          {parseState === "error" && (
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium text-red-800">Parse Failed</p>
                  <p className="text-sm text-red-600">{parseError}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleParse} disabled={!file}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry
                </Button>
                <Button variant="outline" onClick={() => handleUseRuleParser()} disabled={!rawText?.trim()}>
                  <FileText className="mr-2 h-4 w-4" /> Use Rule Parser
                </Button>
                <Button variant="outline" onClick={debugToggle}>
                  <Eye className="mr-2 h-4 w-4" /> {debugOpen ? "Hide Debug" : "Debug"}
                </Button>
                <Button variant="secondary" onClick={handleOpenManualEditor}>
                  <FileText className="mr-2 h-4 w-4" /> Open Manual Editor
                </Button>
              </div>
            </div>
          )}

          <AlertDialog open={showParseFailureModal} onOpenChange={setShowParseFailureModal}>
            <AlertDialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
              <AlertDialogHeader>
                <AlertDialogTitle>AI could not fully parse this PO</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>You can retry, use the rule-based parser, or edit the form manually.</p>
                    {parseFailureError && (
                      <p className="text-sm text-muted-foreground font-mono bg-muted/50 p-2 rounded truncate" title={parseFailureError}>
                        {parseFailureError}
                      </p>
                    )}
                    {parseFailureRawText && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Raw AI output (truncated):</p>
                        <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-32 font-mono whitespace-pre-wrap break-words">
                          {parseFailureRawText.slice(0, 800)}
                          {parseFailureRawText.length > 800 ? "…" : ""}
                        </pre>
                      </div>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-shrink-0">
                <AlertDialogCancel>Close</AlertDialogCancel>
                <Button variant="outline" onClick={handleParse} disabled={!file || parseRetriesExhausted}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Retry Parse
                </Button>
                <Button variant="outline" onClick={handleUseRuleParser} disabled={!rawText?.trim()}>
                  Use Rule Parser
                </Button>
                <Button onClick={handleOpenManualEditor}>
                  Open Manual Editor
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {parseState === "parsed" && (
            <>
              {debugOpen && (
                <div className="mt-4 p-4 border rounded-md bg-muted/30">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Debug</p>
                      <p className="text-xs text-muted-foreground">AI raw JSON and extracted text snippet</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={debugToggle}>
                      Close
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Extracted text (first 2000 chars)</p>
                      <pre className="mt-1 text-xs bg-background/50 border rounded p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap">{rawText?.slice(0, 2000)}</pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">AI JSON</p>
                      <pre className="mt-1 text-xs bg-background/50 border rounded p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap">{debugAiRawJson}</pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">After reconcile/post-process</p>
                      <pre className="mt-1 text-xs bg-background/50 border rounded p-2 overflow-auto max-h-64 font-mono whitespace-pre-wrap">{debugAfterJson}</pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Accuracy report</p>
                      <div className="mt-1 text-xs bg-background/50 border rounded p-2 space-y-1">
                        <p>PO Number: {header.po_number ? "OK" : "Missing"}</p>
                        <p>Customer: {header.customer_name ? "OK" : "Missing"}</p>
                        <p>Line items: {lineItems.length}</p>
                        <p>Total: {lineItems.reduce((s, li) => s + (Number(li.line_total) || 0), 0).toLocaleString("en-IN")}</p>
                        <p>Warnings: {warnings.length}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Parse status bar */}
              <div className="flex flex-wrap items-center gap-2">
                {confidence && (
                  <Badge variant={confidence === "high" ? "default" : confidence === "medium" ? "secondary" : "destructive"}>
                    {confidence === "high" ? "✅ High Confidence" : confidence === "medium" ? "⚠️ Medium" : "❌ Low"}
                  </Badge>
                )}
                {parseTime > 0 && <span className="text-xs text-muted-foreground">Parsed in {parseTime}s</span>}
                {dupPO && (
                  <Badge variant="destructive" className="text-xs">
                    ⚠️ PO already imported on {formatDateDisplay(dupPO.date)} — duplicate blocked
                  </Badge>
                )}
              </div>

              {parseOcrFailed && (
                <div className="p-3 bg-muted/50 border border-border rounded-md">
                  <p className="text-xs text-muted-foreground">Partial extraction (OCR was attempted but failed). You may need to enter some details manually.</p>
                </div>
              )}
              {warnings.length > 0 && (
                <div className="p-3 bg-warning/10 border border-warning/30 rounded-md">
                  <p className="text-xs font-medium text-warning mb-1">Warnings:</p>
                  {warnings.map((w, i) => <p key={i} className="text-xs text-muted-foreground">• {w}</p>)}
                </div>
              )}

              {/* PO Header */}
              <Card>
                <CardHeader className="py-4 px-5"><CardTitle className="text-lg font-semibold">📋 PO Header</CardTitle></CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
                    <div className="min-w-0">
                      <Label htmlFor="import-po-number" className="text-sm font-medium text-foreground">PO Number *</Label>
                      <Input id="import-po-number" value={header.po_number} onChange={e => { setHeader(h => ({ ...h, po_number: e.target.value })); setFormErrors(prev => ({ ...prev, po_number: "" })); }} className="h-11 text-base mt-1.5 min-h-[44px]" aria-invalid={!!formErrors.po_number} />
                      {formErrors.po_number && <p className="text-sm text-destructive mt-1">{formErrors.po_number}</p>}
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="import-po-date" className="text-sm font-medium text-foreground">PO Date</Label>
                      <Input id="import-po-date" type="date" value={header.po_date} onChange={e => setHeader(h => ({ ...h, po_date: e.target.value }))} className="h-11 text-base mt-1.5 min-h-[44px]" />
                    </div>
                    <div className="min-w-0 md:col-span-2">
                      <Label htmlFor="import-po-payment-terms" className="text-sm font-medium text-foreground">Payment Terms</Label>
                      <Input id="import-po-payment-terms" value={header.payment_terms} onChange={e => setHeader(h => ({ ...h, payment_terms: e.target.value }))} className="h-11 text-base mt-1.5 min-h-[44px]" placeholder="e.g. 30 days" />
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="import-po-delivery-date" className="text-sm font-medium text-foreground">Delivery Date</Label>
                      <Input id="import-po-delivery-date" type="date" value={header.delivery_date} onChange={e => setHeader(h => ({ ...h, delivery_date: e.target.value }))} className="h-11 text-base mt-1.5 min-h-[44px]" />
                      {header.delivery_date && isRushOrder(header.delivery_date) && (
                        <Badge className="mt-1 bg-warning/20 text-warning text-xs">⚡ Rush Order</Badge>
                      )}
                      {header.delivery_date && isPastDate(header.delivery_date) && (
                        <Badge variant="destructive" className="mt-1 text-xs">⚠️ Past Date</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Customer */}
              <Card>
                <CardHeader className="py-4 px-5"><CardTitle className="text-lg font-semibold">👤 Customer</CardTitle></CardHeader>
                <CardContent className="px-5 pb-5">
                  {customerMatch?.type === "exact" && (
                    <div className="mb-3 p-2 bg-success/10 border border-success/30 rounded-md flex items-center justify-between">
                      <span className="text-xs text-success font-medium">✅ Existing Customer: {customerMatch.customer.name}</span>
                    </div>
                  )}
                  {customerMatch?.type === "similar" && (
                    <div className="mb-3 p-2 bg-warning/10 border border-warning/30 rounded-md flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs text-warning font-medium">⚠️ Similar to: {customerMatch.customer.name} ({customerMatch.customer.contact_no})</span>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={useMatchedCustomer}>Use This</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs">Create New</Button>
                      </div>
                    </div>
                  )}
                  {!customerMatch && header.customer_name && (
                    <div className="mb-3 p-2 bg-accent/10 border border-accent/30 rounded-md">
                      <span className="text-xs font-medium">🆕 New Customer — will be created on import</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
                    <div className="md:col-span-2 min-w-0">
                      <Label htmlFor="import-customer-name" className="text-sm font-medium text-foreground">Company/Customer Name *</Label>
                      <Input id="import-customer-name" value={header.customer_name} onChange={e => { setHeader(h => ({ ...h, customer_name: e.target.value })); setFormErrors(prev => ({ ...prev, customer_name: "" })); }} className="h-11 text-base mt-1.5 min-h-[44px]" aria-invalid={!!formErrors.customer_name} />
                      {formErrors.customer_name && <p className="text-sm text-destructive mt-1">{formErrors.customer_name}</p>}
                    </div>
                    <div className="md:col-span-2 min-w-0">
                      <Label htmlFor="import-customer-address" className="text-sm font-medium text-foreground">Address</Label>
                      <Textarea id="import-customer-address" value={header.customer_address} onChange={e => setHeader(h => ({ ...h, customer_address: e.target.value }))} className="text-base mt-1.5 min-h-[88px] leading-relaxed resize-y" rows={3} />
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="import-customer-gst" className="text-sm font-medium text-foreground">GST Number</Label>
                      <div className="relative mt-1.5">
                        <Input id="import-customer-gst" value={header.customer_gst} onChange={e => setHeader(h => ({ ...h, customer_gst: e.target.value.toUpperCase() }))} className="h-11 text-base font-mono pr-10 min-h-[44px] tracking-wide" maxLength={15} placeholder="15-character GSTIN" aria-invalid={gstValid === false} aria-describedby={gstValid === false ? "import-gst-error" : undefined} />
                        {gstValid !== null && (
                          <span id="import-gst-error" className={`absolute right-3 top-1/2 -translate-y-1/2 text-lg ${gstValid ? "text-success" : "text-destructive"}`} aria-label={gstValid ? "Valid GSTIN" : "Invalid GSTIN format"}>{gstValid ? "✓" : "✗"}</span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="import-customer-contact-person" className="text-sm font-medium text-foreground">Contact Person</Label>
                      <Input id="import-customer-contact-person" value={header.customer_contact_person} onChange={e => setHeader(h => ({ ...h, customer_contact_person: e.target.value }))} className="h-11 text-base mt-1.5 min-h-[44px]" />
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="import-customer-phone" className="text-sm font-medium text-foreground">Phone</Label>
                      <Input id="import-customer-phone" value={header.customer_phone} onChange={e => setHeader(h => ({ ...h, customer_phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} className="h-11 text-base mt-1.5 min-h-[44px] font-mono tracking-wide" placeholder="10 digits" inputMode="numeric" />
                    </div>
                    <div className="min-w-0">
                      <Label htmlFor="import-customer-email" className="text-sm font-medium text-foreground">Email</Label>
                      <Input id="import-customer-email" type="email" value={header.customer_email} onChange={e => setHeader(h => ({ ...h, customer_email: e.target.value }))} className="h-11 text-base mt-1.5 min-h-[44px]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Full-width Line Items section (below the two-column grid) */}
      {parseState === "parsed" && (
        <div className="mt-4 space-y-4 relative">
          {creating && (
            <div className="absolute inset-0 bg-background/70 z-20 flex items-center justify-center rounded-lg" aria-busy="true">
              <div className="text-center">
                <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary mb-2" />
                <p className="text-sm font-medium">Creating order…</p>
              </div>
            </div>
          )}
          <Card>
            <CardHeader className="py-4 px-5">
              <CardTitle className="text-lg font-semibold flex flex-wrap items-center justify-between gap-2">
                <span>📦 Line Items ({lineItems.length})</span>
                <Button variant="outline" size="default" onClick={addLine} className="h-10 text-sm shrink-0">
                  <PlusCircle className="h-4 w-4 mr-1.5" />Add Row
                </Button>
              </CardTitle>
              {formErrors.line_items && <p className="text-sm text-destructive mt-2">{formErrors.line_items}</p>}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full border-t">
                <table className="w-full min-w-[920px] text-sm border-collapse table-fixed">
                  <colgroup>
                    <col className="w-12" />
                    <col className="min-w-[220px]" />
                    <col className="w-24" />
                    <col className="w-[7.5rem]" />
                    <col className="w-28" />
                    <col className="w-24" />
                    <col className="w-28" />
                    <col className="w-32" />
                    <col className="w-12" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-muted shadow-sm">
                    <tr className="border-b">
                      <th scope="col" aria-sort={sortCol === "sno" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="text-left p-3 text-sm font-semibold text-foreground align-bottom cursor-pointer select-none" onClick={() => handleSort("sno")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("sno"); } }} tabIndex={0}>
                        #{sortCol === "sno" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                      <th scope="col" aria-sort={sortCol === "description" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="text-left p-3 text-sm font-semibold text-foreground align-bottom cursor-pointer select-none" onClick={() => handleSort("description")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("description"); } }} tabIndex={0}>
                        Description{sortCol === "description" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                      <th scope="col" aria-sort={sortCol === "quantity" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="text-right p-3 text-sm font-semibold text-foreground align-bottom cursor-pointer select-none" onClick={() => handleSort("quantity")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("quantity"); } }} tabIndex={0}>
                        Qty{sortCol === "quantity" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                      <th scope="col" className="text-left p-3 text-sm font-semibold text-foreground align-bottom">Unit</th>
                      <th scope="col" aria-sort={sortCol === "unit_price" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="text-right p-3 text-sm font-semibold text-foreground align-bottom cursor-pointer select-none" onClick={() => handleSort("unit_price")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("unit_price"); } }} tabIndex={0}>
                        Price ₹{sortCol === "unit_price" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                      <th scope="col" className="text-center p-3 text-sm font-semibold text-foreground align-bottom">GST %</th>
                      <th scope="col" className="text-right p-3 text-sm font-semibold text-foreground align-bottom">GST ₹</th>
                      <th scope="col" aria-sort={sortCol === "line_total" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className="text-right p-3 text-sm font-semibold text-foreground align-bottom cursor-pointer select-none" onClick={() => handleSort("line_total")} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort("line_total"); } }} tabIndex={0}>
                        Total ₹{sortCol === "line_total" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                      <th scope="col" className="p-3 w-12" aria-label="Remove row" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLineItems.map((li, idx) => (
                        <tr key={li.id} className={`border-b align-top ${idx % 2 === 0 ? "bg-background" : "bg-muted/15"}`}>
                          <td className="p-2.5 text-muted-foreground text-base font-medium align-middle">{li.sno}</td>
                          <td className="p-2 align-middle">
                            <textarea
                              value={li.description}
                              onChange={e => updateLine(li.id, "description", e.target.value)}
                              className="w-full min-h-[52px] text-base leading-normal rounded-md border border-input bg-background px-3 py-2 resize-y block"
                              placeholder="Item description"
                              rows={Math.min(6, Math.max(2, Math.ceil((li.description.length || 1) / 45)))}
                            />
                          </td>
                          <td className="p-2 align-middle">
                            <Input type="text" inputMode="numeric" value={li.quantity === 0 ? "" : String(li.quantity)} onChange={e => {
                              const v = e.target.value.replace(/\D/g, "");
                              if (v === "") updateLine(li.id, "quantity", 1);
                              else updateLine(li.id, "quantity", parseInt(v, 10) || 1);
                            }} className="h-11 text-base text-right font-medium min-w-0" />
                          </td>
                          <td className="p-2 align-middle">
                            {(() => {
                              const unitOpts = UNITS.includes(li.unit) || !li.unit.trim()
                                ? UNITS
                                : [li.unit.trim(), ...UNITS.filter(u => u !== li.unit.trim())];
                              const uval = li.unit.trim() && unitOpts.includes(li.unit.trim()) ? li.unit.trim() : "Nos";
                              return (
                            <Select value={uval} onValueChange={v => updateLine(li.id, "unit", v)}>
                              <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Unit" /></SelectTrigger>
                              <SelectContent>{unitOpts.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                            </Select>
                              );
                            })()}
                          </td>
                          <td className="p-2 align-middle">
                            <Input type="text" inputMode="decimal" value={li.unit_price === 0 && !Number.isNaN(li.unit_price) ? "" : String(li.unit_price)} onChange={e => {
                              const raw = e.target.value.replace(/[^\d.]/g, "");
                              if (raw === "" || raw === ".") updateLine(li.id, "unit_price", 0);
                              else updateLine(li.id, "unit_price", raw);
                            }} className="h-11 text-base text-right font-medium font-mono min-w-0" placeholder="0" />
                          </td>
                          <td className="p-2 align-middle">
                            <Select value={String(snapGstRate(li.gst_rate))} onValueChange={v => updateLine(li.id, "gst_rate", Number(v))}>
                              <SelectTrigger className="h-11 text-base min-w-[4.5rem]"><SelectValue /></SelectTrigger>
                              <SelectContent>{GST_RATES.map(r => <SelectItem key={r} value={String(r)}>{r}%</SelectItem>)}</SelectContent>
                            </Select>
                          </td>
                          <td className="p-2.5 text-right text-base text-muted-foreground bg-muted/20 font-mono align-middle tabular-nums">{Number(li.gst_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right text-base font-semibold bg-muted/20 font-mono align-middle tabular-nums">{Number(li.line_total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 align-middle">
                            <Button type="button" variant="ghost" size="sm" className="h-10 w-10 p-0 text-destructive shrink-0" onClick={() => removeLine(li.id)} aria-label="Remove line">
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="p-5 border-t space-y-2 text-base max-w-lg ml-auto bg-muted/10">
                <div className="flex justify-between gap-4"><span className="text-muted-foreground">Subtotal</span><span className="font-mono font-medium">{formatINR(totals.subtotal)}</span></div>
                {isIntrastate(header.customer_gst) ? (
                  <>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">CGST</span><span className="font-mono">{formatINR(totals.cgst)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">SGST</span><span className="font-mono">{formatINR(totals.sgst)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between gap-4"><span className="text-muted-foreground">IGST</span><span className="font-mono">{formatINR(totals.igst)}</span></div>
                )}
                <div className="flex justify-between items-center gap-4 flex-wrap">
                  <Label htmlFor="import-discount" className="text-foreground font-medium shrink-0">Discount ₹</Label>
                  <Input id="import-discount" type="text" inputMode="decimal" min={0} className="h-11 w-36 text-base text-right font-mono font-medium"
                    value={header.discount_amount === 0 ? "" : String(header.discount_amount)}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^\d.]/g, "");
                      setHeader(h => ({ ...h, discount_amount: raw === "" ? 0 : Math.max(0, normalizeNumber(raw)) }));
                    }}
                    placeholder="0" />
                </div>
                <div className="flex justify-between font-bold text-xl pt-3 border-t gap-4">
                  <span>Grand Total</span><span className="text-primary font-mono">{formatINR(totals.grand)}</span>
                </div>
                {amountInWords && <p className="text-sm text-muted-foreground italic leading-snug">{amountInWords}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card>
            <CardHeader className="py-4 px-5"><CardTitle className="text-lg font-semibold">📝 Additional Info</CardTitle></CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              <div className="min-w-0">
                <Label htmlFor="import-shipping-address" className="text-sm font-medium text-foreground">Shipping Address</Label>
                <Textarea id="import-shipping-address" value={header.shipping_address} onChange={e => setHeader(h => ({ ...h, shipping_address: e.target.value }))} className="text-base mt-1.5 min-h-[80px]" rows={3} />
              </div>
              <div className="min-w-0">
                <Label htmlFor="import-notes" className="text-sm font-medium text-foreground">Notes</Label>
                <Textarea id="import-notes" value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} className="text-base mt-1.5 min-h-[80px]" rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background py-3 border-t">
            <Button onClick={handleCreate} disabled={creating || !header.po_number || !header.customer_name.trim() || !!dupPO} className="flex-1 sm:flex-none">
              {creating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creating...</> : "✅ Create Order from PO"}
            </Button>
            <Button variant="outline" onClick={handleReparse} disabled={!rawText}>
              <RotateCcw className="h-4 w-4 mr-1" />Re-Parse
            </Button>
            <Button variant="outline" className="text-destructive border-destructive/30" onClick={() => setShowDiscard(true)}>
              <X className="h-4 w-4 mr-1" />Discard
            </Button>
          </div>
        </div>
      )}

      {/* PO Import History */}
      <div className="mt-8">
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between bg-white border border-[#E5E7EB] rounded-lg py-3.5 px-4 hover:bg-muted/50">
              <span className="text-sm font-medium">Previously Imported POs{history.length === 0 ? " (none yet)" : ""}</span>
              <ChevronDown className={`h-4 w-4 transition-transform shrink-0 ${historyOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {history.length > 0 ? (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">PO Number</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-right p-2">Amount (₹)</th>
                      <th className="text-center p-2">Status</th>
                      <th className="text-center p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(po => (
                      <tr key={po.id} className="border-b hover:bg-muted/20">
                        <td className="p-2">{formatDateDisplay(po.created_at?.split("T")[0])}</td>
                        <td className="p-2 font-medium">{po.po_number}</td>
                        <td className="p-2">{po.vendor_name || "—"}</td>
                        <td className="p-2 text-right">{formatINR(po.total_amount || 0)}</td>
                        <td className="p-2 text-center">
                          <Badge
                            variant={po.status === "Processed" ? "default" : po.status === "Failed" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {po.status || "Imported"}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          {(po.status === "Imported" || po.status === "Failed") && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleRetry(po)}>
                              <RefreshCw className="h-3 w-3 mr-1" />Retry
                            </Button>
                          )}
                          {po.status === "Processed" && po.linked_order_id && (
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate(`/orders/${po.linked_order_id}`)}>
                              View Order
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-4 text-center">No imported POs yet.</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Discard confirmation */}
      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this PO import?</AlertDialogTitle>
            <AlertDialogDescription>All extracted data will be cleared. The uploaded file will not be saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} className="bg-destructive text-destructive-foreground">Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
