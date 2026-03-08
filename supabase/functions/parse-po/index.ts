import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

If you can't determine a field, use null. Always extract as much as possible.

Return ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "po_number": "",
  "po_date": "",
  "vendor_name": "",
  "contact_no": "",
  "contact_person": "",
  "contact_email": "",
  "gstin": "",
  "vendor_gstin": "",
  "delivery_address": "",
  "buyer_address": "",
  "delivery_date": "",
  "payment_terms": "",
  "currency": "INR",
  "gst_extra": false,
  "base_amount": 0,
  "cgst_percent": 0,
  "cgst_amount": 0,
  "sgst_percent": 0,
  "sgst_amount": 0,
  "igst_percent": 0,
  "igst_amount": 0,
  "tax_amount": 0,
  "total_amount": 0,
  "remarks": "",
  "line_items": [
    {
      "description": "",
      "item_code": "",
      "hsn_code": "",
      "qty": 0,
      "uom": "",
      "unit_price": 0,
      "base_amount": 0,
      "cgst_percent": 0,
      "cgst_amount": 0,
      "sgst_percent": 0,
      "sgst_amount": 0,
      "igst_percent": 0,
      "igst_amount": 0,
      "total_amount": 0,
      "suggested_product_type": ""
    }
  ]
}`;

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

    if (pdfText.length > 200_000) {
      return new Response(JSON.stringify({ error: "Payload too large. Maximum 200KB allowed." }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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
          { role: "user", content: "Parse this Purchase Order text:\n\n" + pdfText },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Lovable AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds to your Lovable workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI parsing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content ?? "";

    const cleanText = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      console.error("Failed to parse AI response as JSON:", rawText.substring(0, 500));
      return new Response(JSON.stringify({ error: "AI did not return valid JSON" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
