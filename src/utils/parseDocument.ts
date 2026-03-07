/**
 * Parse PDF/image via Supabase Edge Function (Deno) → Anthropic Claude.
 * Use this in Lovable; the Edge Function handles API key and document type.
 */

export type ParseMode = "auto" | "purchase_order" | "bank_statement";

export interface ParseResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? "");
    reader.onerror = () =>
      reject(new Error(`FileReader failed for: ${file.name}`));
    reader.readAsDataURL(file);
  });

export async function parseDocument(
  file: File,
  mode: ParseMode = "auto"
): Promise<ParseResult> {
  if (file.size > 4.5 * 1024 * 1024) {
    return {
      success: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum is 4MB.`,
    };
  }

  const allowed = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
  ];
  if (
    !allowed.includes(file.type) &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return {
      success: false,
      error: `Unsupported file type: ${file.type || "unknown"}`,
    };
  }

  try {
    const fileBase64 = await fileToBase64(file);

    const supabaseUrl =
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_SUPABASE_URL ?? "";
    const anonKey =
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_SUPABASE_ANON_KEY ??
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_SUPABASE_PUBLISHABLE_KEY ??
      "";

    if (!supabaseUrl || !anonKey) {
      return {
        success: false,
        error: "Supabase URL or anon key not configured.",
      };
    }

    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/parse-document`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          fileBase64,
          fileName: file.name,
          parseMode: mode,
        }),
      }
    );

    const result = (await response.json()) as {
      success?: boolean;
      data?: Record<string, unknown>;
      error?: string;
    };

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error ?? `Server error: ${response.status}`,
      };
    }

    return { success: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { success: false, error: message };
  }
}
