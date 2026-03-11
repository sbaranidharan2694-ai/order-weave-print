/**
 * Normalize numeric value: strip leading zeros and ensure number.
 * Use for quantity, unit_price, gst_percent, etc. so values are never stored or displayed with leading zeros.
 */
export function normalizeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value).trim().replace(/^0+(?=\d)/, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** For display: format as integer (e.g. quantity) without leading zeros. */
export function formatQuantity(value: unknown): string {
  const n = normalizeNumber(value);
  return n.toLocaleString("en-IN");
}

/** For display: format as currency (use toLocaleString for amount). */
export function formatAmount(value: unknown): string {
  const n = normalizeNumber(value);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
