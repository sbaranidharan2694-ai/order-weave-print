/**
 * Universal PO Parser Engine — Thin wrapper over parsePurchaseOrder pipeline.
 * Retains the existing RuleParsedPO export shape so callers (ImportPO, edge-fn
 * fallback) continue to work without changes.
 */

import { parsePurchaseOrder } from "./parsePurchaseOrder";

/* ─── Types (unchanged public API) ─── */
export interface RuleParsedPO {
  po_number: string | null;
  po_date: string | null;
  customer?: {
    name: string | null;
    address: string | null;
    gst_number: string | null;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
  };
  vendor_name?: string | null;
  delivery_address?: string | null;
  gstin?: string | null;
  contact_no?: string | null;
  contact_person?: string | null;
  contact_email?: string | null;
  payment_terms: string | null;
  delivery_date: string | null;
  line_items: Array<{
    sno?: number;
    description: string;
    quantity: number;
    unit?: string;
    unit_price: number;
    hsn_code?: string | null;
    gst_rate?: number;
    gst_amount?: number;
    line_total?: number;
  }>;
  subtotal?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  discount_amount?: number;
  total_amount?: number;
  amount_in_words?: string | null;
  shipping_address?: string | null;
  notes?: string | null;
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
}

/* ─── Main Parser (public API — delegates to pipeline) ─── */
export function parsePOText(text: string): RuleParsedPO {
  const result = parsePurchaseOrder(text);
  const { header: h, line_items, totals, confidence, warnings } = result;

  // Return empty line_items when none parsed so UI can show "No line items — add manually" and add one empty row
  return {
    po_number: h.po_number,
    po_date: h.po_date,
    customer: {
      name: h.customer_name,
      address: h.customer_address,
      gst_number: h.customer_gst,
      contact_person: h.contact_person,
      phone: h.phone,
      email: h.email,
    },
    vendor_name: h.customer_name,
    delivery_address: h.customer_address,
    gstin: h.customer_gst,
    contact_no: h.phone,
    contact_person: h.contact_person,
    contact_email: h.email,
    payment_terms: h.payment_terms,
    delivery_date: h.delivery_date,
    line_items: Array.isArray(line_items)
      ? line_items.filter((li) => Number(li.quantity) > 0)
      : [],
    subtotal: totals.subtotal,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    total_amount: totals.grand_total,
    confidence,
    warnings,
  };
}
