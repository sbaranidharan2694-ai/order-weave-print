import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "application/postscript", // AI, EPS
  "image/vnd.adobe.photoshop", // PSD
  "application/x-photoshop",
  "application/zip",
  "application/x-zip-compressed",
  "image/x-eps",
  "application/eps",
  "application/illustrator",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "ai", "psd", "cdr", "zip", "tiff", "tif", "eps",
]);

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

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
    const formData = await req.formData();
    const orderId = formData.get("order_id") as string | null;
    const file = formData.get("file") as File | null;

    if (!orderId || !file) {
      return new Response(
        JSON.stringify({ error: "Missing order_id or file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate file size
    if (file.size > MAX_SIZE_BYTES) {
      return new Response(
        JSON.stringify({ error: `File exceeds 25 MB limit (got ${(file.size / 1024 / 1024).toFixed(1)} MB)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate extension
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return new Response(
        JSON.stringify({ error: `File type .${ext} not allowed. Allowed: PDF, JPG, PNG, AI, PSD, CDR, ZIP, TIFF, EPS` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify order exists
    const { data: orderRow, error: orderErr } = await supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .single();

    if (orderErr || !orderRow) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build storage path
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${orderId}/${timestamp}-${safeFilename}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from("order-files")
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("order-files")
      .getPublicUrl(storagePath);

    // Create order_files record
    const { data: fileRecord, error: dbErr } = await supabase
      .from("order_files")
      .insert({
        order_id: orderId,
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size: file.size,
        storage_url: urlData.publicUrl,
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbErr) {
      console.error("order_files insert error:", dbErr);
      // Don't fail — file is already uploaded, log the error
    }

    return new Response(
      JSON.stringify({
        success: true,
        file_id: fileRecord?.id || null,
        storage_url: urlData.publicUrl,
        filename: file.name,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("upload-order-file error:", err);
    return new Response(
      JSON.stringify({ error: "File upload failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
