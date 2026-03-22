const env = import.meta.env as Record<string, string | undefined>;

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ??
  env.SUPABASE_URL ??
  "";

const SUPABASE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY ??
  env.SUPABASE_ANON_KEY ??
  "";
const DEBUG = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/**
 * Invoke a Supabase Edge Function and return the parsed result.
 * Uses fetch so we can always read the response body on non-2xx and show the real error
 * (e.g. "LOVABLE_API_KEY not configured" instead of "Edge Function returned a non-2xx status code").
 */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const base = SUPABASE_URL.replace(/\/$/, "").trim();
  if (!base || base.includes("placeholder")) {
    return {
      data: null,
      error:
        "Supabase URL is missing or invalid. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (Project Settings → API).",
    };
  }
  const url = `${base}/functions/v1/${name}`;
  const authHeader = SUPABASE_KEY && SUPABASE_KEY !== "placeholder" ? { Authorization: `Bearer ${SUPABASE_KEY}` } : {};

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return { data: null, error: msg.includes("Failed to fetch") ? "Cannot reach server. Check network and Supabase URL." : msg };
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (DEBUG) {
      const bodyPreview = await response.clone().text().then(t => t.slice(0, 500));
      console.warn("[invokeEdgeFunction] non-2xx:", response.status, name, bodyPreview);
    }
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
