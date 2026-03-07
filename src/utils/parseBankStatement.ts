export interface Transaction {
  date: string;
  details: string;
  refNo: string;
  debit: number;
  credit: number;
  balance: number;
  type: "debit" | "credit";
  counterparty: string;
}

export interface BankStatementData {
  docType?: "bank_statement";
  accountHolder: string;
  accountNumber: string;
  accountType: "SAVING" | "CURRENT" | string;
  bankName: string;
  branch: string;
  ifsc: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: number;
  totalCredits: number;
  totalDebits: number;
  closingBalance: number;
  transactions: Transaction[];
  rawText?: string;
}

/** Account number → tab value (matches BankAnalyser ACCOUNTS[].key) */
export const ACCOUNT_TAB_MAP: Record<string, string> = {
  "0244020077280": "superprinters",
  "0244020080155": "superscreens",
  "0244011477662": "revathy",
};

export const ACCOUNT_LABEL_MAP: Record<string, string> = {
  "0244020077280": "Super Printers",
  "0244020080155": "Super Screens",
  "0244011477662": "Revathy B.",
};

export function getTabForAccount(accountNumber: string): string {
  const normalized = (accountNumber ?? "").replace(/\s/g, "");
  if (ACCOUNT_TAB_MAP[normalized]) return ACCOUNT_TAB_MAP[normalized];
  for (const [num, tab] of Object.entries(ACCOUNT_TAB_MAP)) {
    if (normalized.includes(num)) return tab;
  }
  return "";
}

export function getLabelForAccount(accountNumber: string): string {
  const normalized = (accountNumber ?? "").replace(/\s/g, "");
  return ACCOUNT_LABEL_MAP[normalized] ?? `Unknown (${accountNumber || "—"})`;
}

function toNum(raw: string | number): number {
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  return parseFloat(String(raw).replace(/[^0-9.]/g, "")) || 0;
}

function categorise(detail: string): string {
  const d = detail.toUpperCase();
  if (d.includes("GOOGLE") || d.includes("IMPS")) return "Digital Receipt";
  if (d.includes("UPI/CR")) return "UPI Receipt";
  if (d.includes("UPI/DR")) return "UPI Payment";
  if (d.includes("NEFT") && (d.includes("CR") || d.includes("CREDIT"))) return "NEFT Receipt";
  if (d.includes("ATW") || d.includes("ATM")) return "ATM Withdrawal";
  if (d.includes("CHQ") || d.includes("CLEARING")) return "Cheque";
  if (d.includes("SWIGGY") || d.includes("ZOMATO")) return "Food";
  return "Other";
}

export function parseBankStatement(rawText: string): BankStatementData {
  // Split into lines, remove blanks (CSB Bank format)
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const joined = lines.join(" ");

  // ── Header fields ─────────────────────────────────────────────
  const accountHolder = lines[0] ?? "";

  const accountNumber =
    joined.match(/Account\s+Number\s*[:\s]+(\d{10,16})/i)?.[1] ?? "";

  const accountType =
    joined.match(/Type\s+of\s+Account\s*[:\s]+(SAVING|CURRENT)/i)?.[1] ?? "";

  const branch =
    joined.match(/Home\s+Branch\s*[:\s]+([A-Z]+)/i)?.[1] ?? "";

  const ifsc =
    joined.match(/IFSC\s+Code\s*[:\s]+([A-Z0-9]{11})/i)?.[1] ?? "";

  const pm = joined.match(
    /period[:\s]+(\d{2}[-\s][A-Za-z]{3}[-\s]\d{4})\s+to\s+(\d{2}[-\s][A-Za-z]{3}[-\s]\d{4})/i
  );
  const periodFrom = pm?.[1] ?? "";
  const periodTo = pm?.[2] ?? "";

  const openingBalance = toNum(
    joined.match(/Opening\s+Balance\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"
  );
  const totalCredits = toNum(
    joined.match(/Total\s+Credits\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"
  );
  const totalDebits = toNum(
    joined.match(/Total\s+Debits\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"
  );
  const closingBalance = toNum(
    joined.match(/Closing\s+Balance\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"
  );

  // ── Transaction parsing ───────────────────────────────────────
  // CSB date format: "20 FEB 2026"
  const DATE_RE = /^(\d{1,2}\s+[A-Z]{3}\s+\d{4})\s+(.*)/;
  const BAL_RE = /INR\s+([\d,]+\.\d{2})\s*Cr/i;
  const AMOUNT_RE = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;

  const transactions: Transaction[] = [];

  let i = 0;

  while (i < lines.length) {
    const dateMatch = lines[i].match(DATE_RE);

    // Skip lines that don't start with a date
    if (!dateMatch) {
      i++;
      continue;
    }

    const date = dateMatch[1];
    const detailParts: string[] = [dateMatch[2]];

    // Advance and collect continuation lines
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      // Stop if next line starts a new transaction date
      if (DATE_RE.test(nextLine)) break;
      // Stop at end of statement
      if (/end\s+of\s+statement/i.test(nextLine)) break;
      detailParts.push(nextLine);
      j++;
    }

    const fullText = detailParts.join(" ");

    // Extract running balance
    const balMatch = fullText.match(BAL_RE);
    const balance = balMatch ? toNum(balMatch[1]) : 0;

    // Extract reference number (long digit string 12–20 digits)
    const refMatch = fullText.match(/\b(\d{12,20})\b/);
    const refNo = refMatch?.[1] ?? "";

    // Classify direction
    const isDebit = /UPI\/DR|ATW\s+using|Chq\s+Paid|Issuer\s+ATM\s+Fin|DEBIT/i.test(fullText);
    const isCredit = /UPI\/CR|NEFT\s+Cr--|IMPS--|NEFT\s+Cr\b|CREDIT/i.test(fullText);

    // Find smallest amount (that isn't the balance) as the transaction amount
    const allAmounts = [...fullText.matchAll(AMOUNT_RE)]
      .map((m) => toNum(m[1]))
      .filter((a) => a > 0 && Math.abs(a - balance) > 0.01);

    const txAmount = allAmounts.length > 0 ? Math.min(...allAmounts) : 0;

    // Clean up details text
    const details = fullText
      .replace(BAL_RE, "")
      .replace(/\b\d{12,20}\b/g, "")
      .replace(AMOUNT_RE, "")
      .replace(/\s+/g, " ")
      .trim();

    // Only push if we have a meaningful balance or amount
    if (balance > 0 || txAmount > 0) {
      transactions.push({
        date,
        details,
        refNo,
        debit: isDebit ? txAmount : 0,
        credit: isCredit ? txAmount : 0,
        balance,
        type: isDebit ? "debit" : "credit",
        counterparty: categorise(fullText),
      });
    }

    // Move to the next date line
    i = j;
  }

  console.log(
    `[parseBankStatement] ${accountHolder} | ${accountNumber} | ${transactions.length} transactions`
  );

  return {
    docType: "bank_statement",
    accountHolder,
    accountNumber,
    accountType,
    bankName: "CSB Bank",
    branch,
    ifsc,
    periodFrom,
    periodTo,
    openingBalance,
    totalCredits,
    totalDebits,
    closingBalance,
    transactions,
    rawText,
  };
}
