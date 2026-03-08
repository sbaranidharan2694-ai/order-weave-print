const env = import.meta.env as Record<string, string | undefined>;
const SUPABASE_URL =
  env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? "";

/**
 * Invoke a Supabase Edge Function and return the parsed result.
 * Uses fetch so we can always read the response body on non-2xx and show the real error
 * (e.g. "LOVABLE_API_KEY not configured" instead of "Edge Function returned a non-2xx status code").
 */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
  const authHeader = SUPABASE_KEY ? { Authorization: `Bearer ${SUPABASE_KEY}` } : {};

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("Content-Type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      if (isJson) {
        const parsed = await response.json();
        if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
          message = parsed.error;
        }
      } else {
        const text = await response.text();
        if (text && text.trim()) message = text.trim().slice(0, 300);
      }
    } catch {
      // use default message
    }
    return { data: null, error: message };
  }

  try {
    const data = isJson ? await response.json() : await response.text();
    return { data: data as T, error: null };
  } catch (e) {
    return { data: null, error: "Invalid response from server" };
  }
}
