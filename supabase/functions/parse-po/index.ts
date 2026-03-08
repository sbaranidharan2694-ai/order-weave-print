import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdfText } = await req.json();
    if (!pdfText || typeof pdfText !== "string") {
      return new Response(JSON.stringify({ error: "pdfText is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Payload size guard: reject > 200KB
    if (pdfText.length > 200_000) {
      return new Response(JSON.stringify({ error: "Payload too large. Maximum 200KB allowed." }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a Purchase Order (PO) parser for a printing press business in India. Extract structured data from PO text.

You MUST support these 3 PO formats:

=== FORMAT 1: Fujitec India (SUBCON PURCHASE ORDER) ===
- Identifier: Contains "SUBCON PURCHASE ORDER" or "FUJITEC INDIA"
- PO Number: after "Purchase Job Order No" (e.g. PO-FIN-M-26005326)
- PO Date: after "Date" near header (e.g. 24-Feb-2026)
- vendor_name: "Fujitec India Pvt Ltd" (the BUYER company)
- gstin: after "GST No." on buyer side (15-char)
- delivery_date: after "Completion Date"
- payment_terms: after "Terms of Payment in Days" (e.g. "30")
- contact_person: after "Contact Person" or order handler
- Line items: Sr No | Description | Part Number | Qty | UOM | Unit Price | Total Price | CGST Rate | CGST Amt | SGST Rate | SGST Amt

=== FORMAT 2: Guindy Machine Tools (LOC PO) ===
- Identifier: Contains "GUINDY MACHINE TOOLS" or PO starts with "LOC"
- PO Number: first line (e.g. LOC252566)
- PO Date: second line DDMMYYYY format (e.g. 04032026 → 2026-03-04)
- vendor_name: "Guindy Machine Tools Limited" (the BUYER company)
- gstin: after "GST No."
- delivery_date: after "Delivery Date" (DDMMYYYY format)
- payment_terms: after "Payment Terms" (e.g. "30 DAYS CREDIT")
- Note: "GST EXTRA" means taxes are NOT included in line amounts
- Line items: Sl.No | Item Number | Description | Qty | UOM | Unit Price | Amount
- gst_extra flag: true if "GST EXTRA" or "CGST,SGST,IGST EXTRA" appears

=== FORMAT 3: Contemporary Leather (SAP Business One PO) ===
- Identifier: Contains "Contemporary Leather" or "SAP Business One"
- PO Number: after "PO No" (e.g. 25261742)
- PO Date: after "PO Date" (e.g. 25-02-26 → 2026-02-25)
- vendor_name: "Contemporary Leather Pvt Ltd" (the BUYER company)
- gstin: after "GST" on buyer block
- delivery_date: after "Delivery Date"
- payment_terms: after "Payment terms" (e.g. "60 DAYS")
- contact_person: after "Contact Person"
- contact_no: after "Contact No"
- Line items: S.No | Description | HSN CODE | QTY | UOM | Unit Price | Base Amount | CGST Rate% | CGST Amt | SGST Rate% | SGST Amt | IGST Rate% | IGST Amt

CRITICAL RULES:
1. vendor_name = The BUYER/CLIENT COMPANY that ISSUED the PO. NOT the supplier/vendor.
2. contact_person = Individual handler name, NOT company name.
3. contact_no = Phone number only. NEVER put a name here.
4. Parse dates as YYYY-MM-DD. Handle DD-MM-YYYY, DDMMYYYY, DD-Mon-YYYY, DD-MM-YY formats.
5. For DDMMYYYY like "04032026": day=04, month=03, year=2026 → 2026-03-04
6. For DD-MM-YY like "25-02-26": assume 2000s → 2026-02-25
7. For amounts, extract numeric values only (remove commas).
8. gst_extra: set true if document says "GST EXTRA" or taxes are not included in line totals.

Map HSN codes to product types:
- 3923, 4911 = Visiting Cards/Cards
- 3926, 3921 = Flex Banner
- 4910, 4901 = Brochure
- 3919 = Sticker
- 4817 = Letterhead
- 4820 = Bill Book
- 4819, 6305 = Carry Bag
- 8412 = Other/Book

If you can't determine a field, use null. Always extract as much as possible.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this Purchase Order text:\n\n${pdfText}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_po_data",
              description: "Extract structured purchase order data",
              parameters: {
                type: "object",
                properties: {
                  po_number: { type: "string", description: "PO number" },
                  po_date: { type: "string", description: "PO date in YYYY-MM-DD" },
                  vendor_name: { type: "string", description: "BUYER COMPANY NAME that issued the PO" },
                  contact_no: { type: "string", description: "Phone number (10+ digits). null if not found." },
                  contact_person: { type: "string", description: "Individual handler/contact person name" },
                  contact_email: { type: "string", description: "Contact email if found" },
                  gstin: { type: "string", description: "Buyer GSTIN (15 characters)" },
                  vendor_gstin: { type: "string", description: "Supplier/Vendor GSTIN if found" },
                  delivery_address: { type: "string", description: "Full delivery address" },
                  buyer_address: { type: "string", description: "Buyer company full address" },
                  delivery_date: { type: "string", description: "Delivery/completion date in YYYY-MM-DD" },
                  payment_terms: { type: "string", description: "Payment terms e.g. '30 Days', '60 DAYS'" },
                  currency: { type: "string", description: "Currency code e.g. INR" },
                  gst_extra: { type: "boolean", description: "true if GST is NOT included in line item totals" },
                  base_amount: { type: "number", description: "Total amount before tax (sum of line item base amounts)" },
                  cgst_percent: { type: "number", description: "CGST percentage e.g. 9" },
                  cgst_amount: { type: "number", description: "Total CGST tax amount" },
                  sgst_percent: { type: "number", description: "SGST percentage e.g. 9" },
                  sgst_amount: { type: "number", description: "Total SGST tax amount" },
                  igst_percent: { type: "number", description: "IGST percentage, 0 if not applicable" },
                  igst_amount: { type: "number", description: "Total IGST amount, 0 if not applicable" },
                  tax_amount: { type: "number", description: "Total tax amount (CGST+SGST+IGST)" },
                  total_amount: { type: "number", description: "Grand total including all taxes" },
                  remarks: { type: "string", description: "Any remarks, PR references, or notes" },
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        item_code: { type: "string", description: "Item number/part number if any" },
                        hsn_code: { type: "string" },
                        qty: { type: "number" },
                        uom: { type: "string" },
                        unit_price: { type: "number" },
                        base_amount: { type: "number", description: "Amount before tax for this line" },
                        cgst_percent: { type: "number" },
                        cgst_amount: { type: "number" },
                        sgst_percent: { type: "number" },
                        sgst_amount: { type: "number" },
                        igst_percent: { type: "number" },
                        igst_amount: { type: "number" },
                        total_amount: { type: "number", description: "Line total including tax" },
                        suggested_product_type: { type: "string", description: "Mapped product type name" },
                      },
                      required: ["description", "qty"],
                    },
                  },
                },
                required: ["po_number", "vendor_name", "line_items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_po_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI parsing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-po error:", e);
    return new Response(JSON.stringify({ error: "PO parsing failed. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
