import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * Invoke a Supabase Edge Function and return the parsed result.
 * On non-2xx response, reads the response body (error.message or body.error) so the UI can show the actual server error
 * (e.g. "LOVABLE_API_KEY not configured" instead of "Edge Function returned a non-2xx status code").
 */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<T & { success?: boolean; error?: string }>(name, {
    body,
  });

  if (error) {
    let message = error.message || "Unknown error";
    if (error instanceof FunctionsHttpError && error.context) {
      try {
        const res = error.context as Response;
        if (typeof res.json === "function") {
          const parsed = await res.json();
          if (parsed && typeof parsed.error === "string") message = parsed.error;
        }
      } catch {
        // ignore JSON parse failure
      }
    }
    return { data: null, error: message };
  }

  return { data: data as T, error: null };
}
