import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BookDetails {
  book_title?: string;
  num_pages?: number;
  book_size?: string;
  binding_type?: string;
  paper_quality?: string;
  cover_type?: string;
  book_color_mode?: string;
  serial_numbering?: boolean;
  serial_start?: number;
}

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
  file_names?: string[];
  book_details?: BookDetails;
}

async function sendWhatsApp(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return dateStr;
  }
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

    // Phone number sanitisation
    const phone = String(body.contact_no).replace(/\D/g, "");
    if (phone.length < 10) {
      return new Response(
        JSON.stringify({ error: "Invalid contact number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Books-specific validation
    const isBooks = body.product_type === "Books";
    if (isBooks) {
      const bd = body.book_details || {};
      if (!bd.binding_type) {
        return new Response(
          JSON.stringify({ error: "Missing required field: binding_type for Books" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (bd.serial_numbering && !bd.serial_start) {
        return new Response(
          JSON.stringify({ error: "serial_start is required when serial_numbering is enabled" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Generate order number
    const { data: orderNo, error: noErr } = await supabase.rpc("generate_order_no");
    if (noErr) throw noErr;

    const qty = Number(body.quantity) || 1;
    const amt = Number(body.amount) || 0;

    // Build metadata
    const metadata: Record<string, unknown> = {};
    if (isBooks && body.book_details) {
      metadata.book_details = body.book_details;
    }
    if (body.file_names && body.file_names.length > 0) {
      metadata.file_names = body.file_names;
    }

    // Insert order
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
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Initial status log
    await supabase.from("status_logs").insert({
      order_id: order.id,
      old_status: null,
      new_status: "Order Received",
      changed_by: "Online Form",
      notes: "Order placed via public order form",
    });

    // Upsert customer
    await supabase.from("customers").upsert(
      {
        name: body.customer_name.trim(),
        contact_no: phone,
        email: body.email?.trim() || null,
      },
      { onConflict: "contact_no", ignoreDuplicates: false }
    );

    // WhatsApp notifications
    const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const adminNumber = Deno.env.get("ADMIN_WHATSAPP_NUMBER") || "919840199878";
    const shopPhone = "9840199878";
    const deliveryDateFmt = formatDate(body.delivery_date);

    let waStatus: "sent" | "not_configured" | "partial" = "not_configured";

    const customerMsg = `Hello ${body.customer_name}! 👋

Thank you for your order with *Super Printers*. 🙏

📋 *Order ID:* ${orderNo}
🖨️ *Product:* ${body.product_type} × ${qty}
📅 *Expected Delivery:* ${deliveryDateFmt}
${body.special_instructions ? `📝 *Notes:* ${body.special_instructions}\n` : ""}
We'll call you on ${phone} to confirm details.

*Team Super Printers* 🖨️
📞 ${shopPhone}`;

    const adminMsg = `🔔 *New Online Order — ${orderNo}*

👤 *Customer:* ${body.customer_name} (${phone})
${body.email ? `📧 ${body.email}\n` : ""}🖨️ *Product:* ${body.product_type} × ${qty}
📅 *Delivery:* ${deliveryDateFmt}
${body.special_instructions ? `📝 *Notes:* ${body.special_instructions}\n` : ""}${isBooks && body.book_details ? `📚 *Book Details:*\n  • Title: ${body.book_details.book_title || "—"}\n  • Pages: ${body.book_details.num_pages || "—"}\n  • Size: ${body.book_details.book_size || "—"}\n  • Binding: ${body.book_details.binding_type || "—"}\n  • Cover: ${body.book_details.cover_type || "—"}\n  • Serial No: ${body.book_details.serial_numbering ? `Yes (from ${body.book_details.serial_start})` : "No"}\n` : ""}${body.file_names && body.file_names.length > 0 ? `📎 *Files:* ${body.file_names.join(", ")}\n` : ""}
🔗 Check dashboard: Super Printers OMS`;

    if (waToken && waPhoneId) {
      // Normalize customer phone to international format
      const customerWaPhone = phone.length === 10 ? `91${phone}` : phone;

      const [custResult, adminResult] = await Promise.all([
        sendWhatsApp(waPhoneId, waToken, customerWaPhone, customerMsg),
        sendWhatsApp(waPhoneId, waToken, adminNumber, adminMsg),
      ]);

      const custOk = custResult.ok;
      const adminOk = adminResult.ok;

      if (!custOk) console.error("WA customer send failed:", custResult.error);
      if (!adminOk) console.error("WA admin send failed:", adminResult.error);

      waStatus = custOk && adminOk ? "sent" : "partial";

      // Log to notification_logs
      await supabase.from("notification_logs").insert([
        {
          order_id: order.id,
          channel: "whatsapp",
          status_at_send: "Order Received",
          message_preview: customerMsg.slice(0, 200),
          delivery_status: custOk ? "sent" : "failed",
          recipient_phone: customerWaPhone,
        },
        {
          order_id: order.id,
          channel: "whatsapp",
          status_at_send: "Order Received",
          message_preview: adminMsg.slice(0, 200),
          delivery_status: adminOk ? "sent" : "failed",
          recipient_phone: adminNumber,
        },
      ]);
    } else {
      // WhatsApp not configured — log as pending_manual so staff can send manually
      waStatus = "not_configured";
      await supabase.from("notification_logs").insert([
        {
          order_id: order.id,
          channel: "whatsapp",
          status_at_send: "Order Received",
          message_preview: customerMsg.slice(0, 200),
          delivery_status: "pending_manual",
          recipient_phone: phone.length === 10 ? `91${phone}` : phone,
        },
        {
          order_id: order.id,
          channel: "whatsapp",
          status_at_send: "Order Received",
          message_preview: adminMsg.slice(0, 200),
          delivery_status: "pending_manual",
          recipient_phone: adminNumber,
        },
      ]);
    }

    // Build submitted summary for frontend success panel
    const submitted = {
      customer_name: body.customer_name.trim(),
      contact_no: phone,
      email: body.email?.trim() || null,
      product_type: body.product_type,
      quantity: qty,
      delivery_date: body.delivery_date,
      special_instructions: body.special_instructions?.trim() || null,
      ...(isBooks && body.book_details ? { book_details: body.book_details } : {}),
      ...(body.file_names && body.file_names.length > 0 ? { file_names: body.file_names } : {}),
    };

    return new Response(
      JSON.stringify({
        success: true,
        order_no: orderNo,
        order_id: order.id,
        wa_status: waStatus,
        submitted,
        message: `Your order ${orderNo} has been placed successfully!`,
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
