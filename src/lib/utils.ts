import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** User-friendly message when DB tables are missing (Supabase migrations not run). */
export function friendlyDbError(msg: string | undefined): string {
  if (!msg) return "Operation failed.";
  if (msg.includes("schema cache") || msg.includes("does not exist") || msg.toLowerCase().includes("relation"))
    return "Database tables missing. Run Supabase migrations (see README).";
  return msg;
}
