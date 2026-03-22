/** Always get a readable string from any thrown or Supabase error. */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err != null && typeof err === "object") {
    const o = err as { message?: string; details?: string };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.details === "string" && o.details) return o.details;
  }
  return typeof err === "string" ? err : String(err);
}
