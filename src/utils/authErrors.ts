/**
 * Map Supabase auth errors to user-friendly messages.
 */
export function getAuthErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = (err as { message?: string }).message ?? err.message;
    if (typeof msg !== "string") return "Invalid email or password";
    if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) return "Invalid email or password";
    if (msg.includes("Email not confirmed")) return "Please confirm your email before signing in.";
    if (msg.includes("session") && (msg.includes("expired") || msg.includes("refresh"))) return "Session expired. Please sign in again.";
    if (msg.includes("403") || msg.includes("Forbidden") || msg.includes("permission")) return "Permission denied.";
    return msg;
  }
  if (err != null && typeof err === "object") {
    const o = err as { message?: string; error_description?: string };
    if (typeof o.message === "string" && o.message) return getAuthErrorMessage(new Error(o.message));
    if (typeof o.error_description === "string") return getAuthErrorMessage(new Error(o.error_description));
  }
  return typeof err === "string" ? err : "Invalid email or password";
}
