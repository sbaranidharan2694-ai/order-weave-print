import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PublicOrderPayload {
  customer_name: string;
  contact_no: string;
  email?: string;
  product_type: string;
  quantity: number;
  size?: string;
  color_mode?: string;
  paper_type?: string;
  special_instructions?: string;
  delivery_date: string;
  amount?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: PublicOrderPayload = await req.json();

    // Basic validation
    const required = ["customer_name", "contact_no", "product_type", "delivery_date"];
    for (const field of required) {
      if (!body[field as keyof PublicOrderPayload]) {
        return new Response(
          JSON.stringify({ error: `Missing required field: ${field}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Phone number basic sanitisation
    const phone = String(body.contact_no).replace(/\D/g, "");
    if (phone.length < 10) {
      return new Response(
        JSON.stringify({ error: "Invalid contact number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS — safe because this function owns validation
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Generate order number
    const { data: orderNo, error: noErr } = await supabase.rpc("generate_order_no");
    if (noErr) throw noErr;

    const qty = Number(body.quantity) || 1;
    const amt = Number(body.amount) || 0;

    // Insert order (created_by is NULL for public orders — RLS allows this)
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_no: orderNo,
        customer_name: body.customer_name.trim(),
        contact_no: phone,
        email: body.email?.trim() || null,
        product_type: body.product_type,
        quantity: qty,
        qty_ordered: qty,
        qty_fulfilled: 0,
        qty_pending: qty,
        size: body.size?.trim() || null,
        color_mode: (body.color_mode as "full_color" | "black_white" | "spot_color") || "full_color",
        paper_type: body.paper_type?.trim() || null,
        special_instructions: body.special_instructions?.trim() || null,
        delivery_date: body.delivery_date,
        amount: amt,
        advance_paid: 0,
        source: "online",
        status: "Order Received",
        order_date: new Date().toISOString().split("T")[0],
        created_by: null,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Insert initial status log
    await supabase.from("status_logs").insert({
      order_id: order.id,
      old_status: null,
      new_status: "Order Received",
      changed_by: "Online Form",
      notes: "Order placed via public order form",
    });

    // Upsert customer record
    await supabase.from("customers").upsert(
      {
        name: body.customer_name.trim(),
        contact_no: phone,
        email: body.email?.trim() || null,
      },
      { onConflict: "contact_no", ignoreDuplicates: false }
    );

    return new Response(
      JSON.stringify({
        success: true,
        order_no: order.order_no,
        message: `Your order ${order.order_no} has been placed successfully! We will contact you at ${phone} to confirm.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("submit-public-order error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to place order. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
