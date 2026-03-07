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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a Purchase Order (PO) parser for a printing press business in India. Extract structured data from PO text.

CRITICAL RULES FOR EXTRACTION:
1. **vendor_name** = The BUYER/CLIENT COMPANY NAME. This is the company that ISSUED the PO (e.g., "Wipro Enterprises Private Limited"). Look for the company name in the "To:" section, the main letterhead, or the buyer block. This is NOT the handler/contact person name.
2. **contact_person** = The individual handler or contact person named in the PO (e.g., "Janarthanan. K" from "Order Handled BY:" field). This is a person's name, NOT the company.
3. **contact_no** = A phone number (10+ digits). If no phone number exists in the PO, return null. NEVER put a person's name as contact_no.
4. **gstin** = The buyer's GSTIN (15-character alphanumeric code).

For tax extraction:
- Extract base_amount (amount before tax)
- Extract CGST %, CGST amount, SGST %, SGST amount separately
- Extract IGST % and amount if applicable
- total_amount = grand total including all taxes
- tax_amount = total of all taxes (CGST + SGST + IGST)

Parse dates as YYYY-MM-DD format. For Indian dates like "05-02-26" or "03.03.2026", interpret correctly.
For amounts, extract numeric values only.

Map HSN codes to product types:
- 3923, 4911 = Visiting Cards or Cards
- 3926 = Flex Banner
- 4910, 4901 = Brochure
- 3919 = Sticker
- 4817 = Letterhead
- 4820 = Bill Book
- 4819, 6305 = Carry Bag
- 8412 = Other/Book

If you can't determine a field, use null. Always try to extract as much as possible.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
                  vendor_name: { type: "string", description: "BUYER COMPANY NAME — the company that issued the PO, NOT a person's name" },
                  contact_no: { type: "string", description: "Phone number (10+ digits only). If no phone number found, return null. NEVER put a name here." },
                  contact_person: { type: "string", description: "Individual handler/contact person name from the PO" },
                  gstin: { type: "string", description: "Buyer GSTIN (15 characters)" },
                  delivery_address: { type: "string", description: "Full delivery address" },
                  delivery_date: { type: "string", description: "Delivery date in YYYY-MM-DD" },
                  payment_terms: { type: "string", description: "Payment terms e.g. '60 DAYS'" },
                  currency: { type: "string", description: "Currency code e.g. INR" },
                  base_amount: { type: "number", description: "Amount before tax (taxable value)" },
                  cgst_percent: { type: "number", description: "CGST percentage e.g. 9" },
                  cgst_amount: { type: "number", description: "CGST tax amount" },
                  sgst_percent: { type: "number", description: "SGST percentage e.g. 9" },
                  sgst_amount: { type: "number", description: "SGST tax amount" },
                  igst_percent: { type: "number", description: "IGST percentage e.g. 18, 0 if not applicable" },
                  igst_amount: { type: "number", description: "IGST tax amount, 0 if not applicable" },
                  tax_amount: { type: "number", description: "Total tax amount (CGST+SGST+IGST)" },
                  total_amount: { type: "number", description: "Grand total including all taxes" },
                  line_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        hsn_code: { type: "string" },
                        qty: { type: "number" },
                        uom: { type: "string" },
                        unit_price: { type: "number" },
                        amount: { type: "number" },
                        suggested_product_type: { type: "string", description: "Mapped product type name" },
                      },
                      required: ["description", "qty", "amount"],
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
