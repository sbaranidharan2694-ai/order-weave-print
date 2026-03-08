import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const systemPrompt = `You are a Purchase Order (PO) parser for a printing press business in India. Extract structured data from PO text.

You MUST support these 5 PO formats:

=== FORMAT 1: Fujitec India (SUBCON PURCHASE ORDER) ===
- Identifier: Contains "SUBCON PURCHASE ORDER" or "FUJITEC INDIA" or "PO-FIN-M-"
- PO Number: after "Purchase Job Order No" (e.g. PO-FIN-M-26005326)
- PO Date: after "Date" near header (e.g. 24-Feb-2026)
- vendor_name: "Fujitec India Pvt Ltd" (the BUYER company)
- gstin: after "GST No." on buyer side — the one starting with 33AAAC (NOT the vendor/supplier GST starting with 33AAGP)
- delivery_date: after "Completion Date"
- payment_terms: after "Terms of Payment in Days" (e.g. "30")
- contact_person: after "Approved By" field
- Line items: Sr No | Description | Part Number | Req.On Date | Cost Entity Key | Qty | UOM | Unit Price | Total Price | CGST Rate | CGST Amt | SGST Rate | SGST Amt
- IMPORTANT: Only rows starting with numeric Sr No (1, 2, 3...) are line items. Stop before "Total" row.
- IMPORTANT: Do NOT include GST No., PAN No., address footer text as line items.

=== FORMAT 2: Guindy Machine Tools (LOC PO) ===
- Identifier: Contains "GUINDY MACHINE TOOLS" or PO number starts with "LOC"
- PO Number: e.g. LOC252566
- PO Date: 8-digit date after PO number e.g. 04032026 = 04/03/2026
- vendor_name: "Guindy Machine Tools Limited" (the BUYER company)
- gstin: after "GST No." — the one starting with 33AAACG
- delivery_date: after "Delivery Date" (8-digit format)
- payment_terms: after "Payment Terms" (e.g. "30 DAYS CREDIT")
- contact_person: after "Prepared by"
- gst_extra: true — GST is NOT included in line item amounts
- Line items: Sl.No | Description | Qty | UOM | Unit Price | Amount
- Since GST is extra, line item CGST/SGST should be 0

=== FORMAT 3: Contemporary Leather (SAP Business One PO) ===
- Identifier: Contains "Contemporary Leather" or "SAP Business One"
- PO Number: after "PO No" (e.g. 25261742, 25261779, 25266682)
- PO Date: after "PO Date" (e.g. 05-03-26 → 2026-03-05)
- vendor_name: "Contemporary Leather Pvt Ltd" (the BUYER company)
- gstin: after "GST" — the one starting with 33AADC
- delivery_date: after "Delivery Date"
- payment_terms: after "Payment terms" (e.g. "60 DAYS")
- contact_person: after "Contact Person" (e.g. "Mr. Bharani")
- contact_no: after "Contact No" (e.g. "9840199878")
- Line items: S.No | Description | HSN CODE | QTY | UOM | Unit Price | Base Amount | CGST Rate% | CGST Amt | SGST Rate% | SGST Amt | IGST Rate% | IGST Amt
- CGST and SGST are typically 9% each

=== FORMAT 4: Wipro Enterprises ===
- Identifier: Contains "Wipro Enterprises Private Limited" AND "PURCHASE ORDER No"
- PO Number: after "PURCHASE ORDER No" (e.g. 94384819)
- PO Date: after "Dt" with dots (e.g. 03.03.2026)
- vendor_name: "Wipro Enterprises Private Limited" (the BUYER company)
- gstin: after "GST No" — the one starting with 33AAJCA
- delivery_date: from line item Delivery column (e.g. 31.10.2026)
- payment_terms: after "Terms of Payment" (e.g. "15 - 45 days average 30 days")
- contact_person: after "Order Handled BY" (e.g. "Janarathanan. K")
- contact_email: after "Email" — fix common OCR errors like missing @ symbol
- Line items use S.No multiples of 10 (10, 20, 30...) — treat these as valid line items
- Extract HSN from within description text (pattern "HSN XXXX")
- UOM, Qty (strip .000 suffix), Unit Price from respective columns
- Tax: look for CGST-XX-amount and SGST-XX-amount patterns below the table
- Stop parsing at "Version Page3" — ignore T&C pages

=== FORMAT 5: CGRD Chemicals (Excel format) ===
- Identifier: Contains "CGRD Chemicals" or "CGRD CHEMICALS" or "33AALCC5735C1ZW"
- PO Number: after "PO NO" (e.g. 122-02/25-26)
- PO Date: after "DATE" with dots (e.g. 26.02.26 → 2026-02-26)
- vendor_name: "CGRD Chemicals India Pvt Ltd" (the BUYER company)
- gstin: "33AALCC5735C1ZW"
- payment_terms: pattern "XX DAYS CREDIT"
- contact_person: after "APPROVED BY"
- Line items: S.No | Product Name | Batch No | Price/kg | Qty | Total in KG | Amount
- UOM is always KG for this vendor
- CGST and SGST appear as summary totals below items — back-calculate rate from amounts
- Skip subtotal rows where product name is empty/blank
- Grand Total from "TOTAL" line

CRITICAL RULES:
1. vendor_name = The BUYER/CLIENT COMPANY that ISSUED the PO. NOT the supplier/vendor receiving it.
2. contact_person = Individual handler name, NOT company name.
3. contact_no = Phone number only. NEVER put a name here.
4. Parse dates as YYYY-MM-DD. Handle DD/MM/YYYY, DD-MM-YYYY, DDMMYYYY, DD-Mon-YYYY, DD.MM.YYYY, DD-MM-YY formats.
5. For amounts, extract numeric values only (remove commas).
6. gst_extra: set true if document says "GST EXTRA" or taxes are not included in line totals.
7. NEVER include footer lines (GST No., PAN No., Vendor Code, address, AUTHORISED SIGNATORY) as line items.
8. Only create line items for rows with actual item data — not subtotals or blank rows.
9. Grand total = sum of line item totals. Recalculate, don't blindly copy.
10. For Wipro emails: if email looks like "namecompany.com", insert @ to make "name@company.com".

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

const extractTool = {
  type: "function" as const,
  function: {
    name: "extract_po_data",
    description: "Extract structured purchase order data from parsed PDF/Excel text",
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
        base_amount: { type: "number", description: "Total amount before tax" },
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
    },
  },
};

function extractJsonFromText(raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    /* continue */
  }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(clean.slice(start, end + 1));
    } catch {
      /* continue */
    }
  }
  return null;
}

function preprocessPoText(input: string): string {
  let text = input.replace(/\r/g, "\n");

  if (/Wipro Enterprises Private Limited/i.test(text)) {
    const stopMatch = text.match(/Page:\s*3\s*\/\s*\d+|DISPATCH INSTRUCTIONS/i);
    if (typeof stopMatch?.index === "number" && stopMatch.index > 0) {
      text = text.slice(0, stopMatch.index);
    }
  }

  if (text.length > 180_000) {
    const head = text.slice(0, 120_000);
    const keywordLines = text
      .split(/\n+/)
      .filter((line) =>
        /po\s*no|purchase order|s\.?no|sl\.?no|qty|quantity|uom|unit\s*price|amount|cgst|sgst|igst|total|gst|payment terms|delivery date|approved by|order handled by/i.test(line),
      )
      .slice(0, 800)
      .join("\n");
    text = `${head}\n\n[KEY_LINES]\n${keywordLines}`;
  }

  return text.slice(0, 190_000);
}

async function callGateway(payloadText: string, lovableApiKey: string, focusedLineItems = false) {
  const userPrompt = focusedLineItems
    ? `Extract ONLY structured PO data with high focus on line_items.\n\nRules:\n- Must return every actual item row\n- Ignore footer/terms/address rows\n- If at least one item row exists, line_items must not be empty\n\nPO Text:\n\n${payloadText}`
    : `Parse this Purchase Order text and extract all fields:\n\n${payloadText}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [extractTool],
      tool_choice: { type: "function", function: { name: "extract_po_data" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[parse-po] AI gateway error:", response.status, errText);
    return { ok: false as const, status: response.status, errorText: errText };
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content ?? "";

  let parsed: Record<string, unknown> | null = null;
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("[parse-po] tool_calls JSON parse failed:", e);
    }
  }

  if (!parsed && rawContent) {
    parsed = extractJsonFromText(rawContent);
  }

  return { ok: true as const, parsed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfText } = await req.json();
    if (!pdfText || typeof pdfText !== "string") {
      return new Response(JSON.stringify({ error: "pdfText is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pdfText.length > 500_000) {
      return new Response(JSON.stringify({ error: "Payload too large. Maximum 500KB allowed." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI API key not configured. Please ensure Lovable Cloud is enabled." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const preparedText = preprocessPoText(pdfText);

    const firstAttempt = await callGateway(preparedText, LOVABLE_API_KEY, false);
    if (!firstAttempt.ok) {
      if (firstAttempt.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (firstAttempt.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable → Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: `AI gateway returned ${firstAttempt.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed = firstAttempt.parsed;
    let lineItems = Array.isArray(parsed?.line_items) ? parsed?.line_items : [];

    if (!parsed || lineItems.length === 0) {
      const secondAttempt = await callGateway(preparedText, LOVABLE_API_KEY, true);
      if (secondAttempt.ok && secondAttempt.parsed) {
        parsed = secondAttempt.parsed;
        lineItems = Array.isArray(parsed?.line_items) ? parsed?.line_items : [];
      }
    }

    if (!parsed) {
      return new Response(JSON.stringify({ error: "AI did not return structured data. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(parsed.line_items)) {
      parsed.line_items = [];
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PO parsing failed";
    console.error("[parse-po] Unhandled error:", e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
