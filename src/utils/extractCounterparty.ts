/**
 * Extract the actual person/company name from a bank transaction description.
 * This is stored in the database `counterparty` column.
 */
export function extractCounterparty(details: string): string {
  // UPI: "UPI/CR/603345287369/LAKSHMI R/CNRB/..." → "LAKSHMI R"
  const upi = details.match(/UPI\/(?:CR|DR)\/\d+\/([^/]+)/i);
  if (upi) return upi[1].trim();

  // NEFT: "NEFT CR--HDFCH00800949110-FUJITEC INDIA PVT LTD-HD..." → "FUJITEC INDIA PVT LTD"
  const neft = details.match(/NEFT\s+(?:CR|DR)--[A-Z0-9]+-([A-Z][A-Z0-9\s&.,']+?)(?:-[A-Z]{2,4}\s*$|-[A-Z]{4}\d|$)/i);
  if (neft) return neft[1].trim().replace(/\s+/g, ' ');

  // NEFT-G: "NEFT-G G ORGANICS EXPORTS PRIVATE LREF-HDF" → "G G ORGANICS EXPORTS PRIVATE"
  const neftG = details.match(/NEFT-G\s+([A-Z][A-Z0-9\s&.,']+?)(?:\s+(?:LREF|PVT|LTD|HDF|REF)-|$)/i);
  if (neftG) return neftG[1].trim().replace(/\s+/g, ' ');

  // IMPS: "IMPS--12345-JOHN DOE" → "JOHN DOE"
  const imps = details.match(/IMPS--\d+-([A-Z][A-Z\s]+)/i);
  if (imps) return imps[1].trim();

  // Cheque: "CHQ PAID-SELF-WITHDRAW" → "SELF", "CHQ PAID-INWARD-SRI SWATHI" → "SRI SWATHI"
  const chq = details.match(/CHQ\s+(?:PAID|DEP)-(?:INWARD-|SELF-)?([A-Z][A-Z\s]*)/i);
  if (chq) return chq[1].trim();

  if (/ATW\s+using|ATM\s+(?:WDL|Fin)/i.test(details)) return "ATM Withdrawal";
  if (/GOOGLE/i.test(details)) return "Google Pay";
  if (/\bSELF\b/i.test(details)) return "Self";

  // Fallback: strip numbers and take first meaningful chunk
  const cleaned = details
    .replace(/\d{6,}/g, '')
    .replace(/[/\-|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.substring(0, 40) || "Unknown";
}

/**
 * Classify a transaction into a category for UI display/grouping.
 * This is NOT stored in the DB — used client-side only.
 */
export function classifyTransaction(details: string): string {
  const d = details.toUpperCase();
  if (d.includes("UPI/CR")) return "UPI Credit";
  if (d.includes("UPI/DR")) return "UPI Debit";
  if (d.includes("NEFT-G") || (d.includes("NEFT") && (d.includes("CR") || d.includes("CREDIT")))) return "NEFT Credit";
  if (d.includes("NEFT") && (d.includes("DR") || d.includes("DEBIT"))) return "NEFT Debit";
  if (d.includes("IMPS")) return "IMPS";
  if (d.includes("CHQ") || d.includes("CLEARING")) return "Cheque";
  if (d.includes("ATW") || d.includes("ATM")) return "ATM";
  if (d.includes("INT.PAID") || d.includes("INT.CR") || d.includes("INTEREST")) return "Interest";
  if (d.includes("CASH DEP")) return "Cash Deposit";
  if (/\bSELF\b/.test(d)) return "Self Transfer";
  if (d.includes("GOOGLE")) return "Digital Payment";
  return "Other";
}
