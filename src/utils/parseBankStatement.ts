import { extractCounterparty, classifyTransaction } from "@/utils/extractCounterparty";

export interface Transaction {
  date: string;
  details: string;
  refNo: string;
  debit: number;
  credit: number;
  balance: number;
  type: "debit" | "credit";
  counterparty: string;  // Person/company name (stored in DB)
  category: string;      // Classification for UI (NOT stored in DB)
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

function normalizeAccountNumber(raw: string): string {
  return raw.replace(/\D/g, "").trim();
}

function normalizeDateToken(raw: string): string {
  const s = raw.trim().replace(/[\s/]+/g, "-");
  // DD-MM-YY → YYYY-MM-DD (assume 20xx)
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (m) {
    const [, d, mon, yy] = m;
    const y = parseInt(yy, 10) < 50 ? "20" + yy : "19" + yy;
    return `${y}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // DD-MONYYYY (no separator between month and year) → DD-MON-YYYY
  const fixed = s.replace(/^(\d{1,2})-([A-Za-z]{3})(\d{4})$/, "$1-$2-$3");
  m = fixed.match(/^(\d{1,2})-([A-Za-z]{3}|\d{1,2})-(\d{4})$/);
  if (!m) return raw.trim();
  const [, d, mon, y] = m;
  if (/^\d{1,2}$/.test(mon)) return `${y}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return `${y}-${mon.slice(0, 1).toUpperCase()}${mon.slice(1, 3).toLowerCase()}-${d.padStart(2, "0")}`;
}

function parseSummaryTotals(joined: string): {
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
} {
  const tableMatch = joined.match(
    /Opening\s+Balance[\s\S]{0,140}?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i,
  );

  if (tableMatch) {
    return {
      openingBalance: toNum(tableMatch[1]),
      totalDebits: toNum(tableMatch[2]),
      totalCredits: toNum(tableMatch[3]),
      closingBalance: toNum(tableMatch[4]),
    };
  }

  return {
    openingBalance: toNum(joined.match(/Opening\s+Balance\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"),
    totalCredits: toNum(joined.match(/Total\s+Credits\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"),
    totalDebits: toNum(joined.match(/Total\s+Debits\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"),
    closingBalance: toNum(joined.match(/Closing\s+Balance\s+INR\s+([\d,]+\.\d{2})/i)?.[1] ?? "0"),
  };
}

/** Match transaction date at start: DD-MM-YYYY, DD/MM/YYYY, DD-Mon-YYYY, DD-MM-YY */
const DATE_PREFIX = /^(\d{1,2}[-/\s](?:[A-Za-z]{3}|\d{1,2})[-/\s]?\d{2,4})/i;

/** True if line is a section/column header, not transaction content */
function isTransactionHeaderLine(line: string): boolean {
  const t = line.trim();
  if (t.length > 120) return false;
  return (
    /^(TRANS\s+DATE|VALUE\s+DATE|DEBITS?|CREDITS?|BALANCE|Date\s+Details|Ref\s+No)\s*$/i.test(t) ||
    /^CSB\s+24x7|^PAGE\s+\d+/i.test(t) ||
    (/^(SUPER\s+PRINTERS|SUPER\s+SCREENS|REVATHY|PALLAVARAM|SARASWATHI|superprntrs)\s*$/i.test(t))
  );
}

/** True if block looks like B/F (brought forward) line — skip as transaction, optionally extract opening balance */
function isBFLine(clean: string): boolean {
  return /B\/F|BROUGHT\s+FORWARD|OPENING\s+BALANCE\s+BF/i.test(clean);
}

/** Extract opening balance from a B/F line if present (e.g. "B/F ... 12345.67") */
function extractOpeningBalanceFromBF(clean: string): number {
  const amounts = [...clean.matchAll(/[\d,]+\.\d{2}/g)];
  return amounts.length > 0 ? toNum(amounts[amounts.length - 1][0]) : 0;
}

function parseTransactions(lines: string[]): { transactions: Transaction[]; openingBalanceFromBF: number } {
  const blocks: string[] = [];
  let current: string[] = [];
  let openingBalanceFromBF = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;

    if (DATE_PREFIX.test(line)) {
      if (current.length) blocks.push(current.join(" "));
      current = [line];
      continue;
    }

    if (current.length > 0 && !isTransactionHeaderLine(line)) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join(" "));

  const AMOUNT_RE = /[\d,]+\.\d{2}/g;
  const out: Transaction[] = [];

  for (const block of blocks) {
    const clean = block.replace(/\s+/g, " ").trim();
    const start = clean.match(DATE_PREFIX);
    if (!start) continue;

    // Skip B/F lines; capture opening balance from them
    if (isBFLine(clean)) {
      const ob = extractOpeningBalanceFromBF(clean);
      if (ob > 0) openingBalanceFromBF = ob;
      continue;
    }

    const date = normalizeDateToken(start[1]);
    let rest = clean.slice(start[0].length).trim();

    const valueDate = rest.match(DATE_PREFIX);
    if (valueDate) {
      rest = rest.slice(valueDate[0].length).trim();
    }

    const strictMatch = rest.match(/([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
    let debit = 0;
    let credit = 0;
    let balance = 0;
    let bodyEndIndex = rest.length;

    if (strictMatch) {
      debit = toNum(strictMatch[1]);
      credit = toNum(strictMatch[2]);
      balance = toNum(strictMatch[3]);
      bodyEndIndex = strictMatch.index ?? rest.length;
    } else {
      const allAmounts = [...rest.matchAll(AMOUNT_RE)];
      if (allAmounts.length < 3) continue;
      const lastThree = allAmounts.slice(-3);
      debit = toNum(lastThree[0][0]);
      credit = toNum(lastThree[1][0]);
      balance = toNum(lastThree[2][0]);
      bodyEndIndex = lastThree[0].index ?? rest.length;
    }

    // Skip zero-amount lines (no debit and no credit)
    if (debit === 0 && credit === 0) continue;

    let body = rest.slice(0, bodyEndIndex).trim();

    const refMatches = [...body.matchAll(/\b([A-Z0-9]{6,20})\b/g)];
    const refNo = refMatches.length ? (refMatches[refMatches.length - 1][1] ?? "") : "";
    if (refNo) {
      body = body.replace(new RegExp(`\\b${refNo}\\b`), "").replace(/\s+/g, " ").trim();
    }

    if (!body) body = "Transaction";

    const isDebit = debit > 0 && credit === 0;
    out.push({
      date,
      details: body,
      refNo,
      debit,
      credit,
      balance,
      type: isDebit ? "debit" : "credit",
      counterparty: extractCounterparty(body),
      category: classifyTransaction(body),
    });
  }

  const deduped = Array.from(
    new Map(out.map((t) => [`${t.date}|${t.refNo}|${t.debit}|${t.credit}|${t.balance}|${t.details}`, t])).values(),
  );

  return { transactions: deduped, openingBalanceFromBF };
}

/** Strip page-boundary contamination from extracted text lines. */
function cleanPageBoundary(text: string): string {
  // Remove "Page X of Y" and everything after it (header/footer text from next page)
  // Use .* instead of [\s\S]* to avoid eating valid transaction data across newlines
  return text
    .replace(/\s*Page\s+\d+\s+of\s+\d+[^\n]*/i, "")
    .replace(/\s*CSB\s+24x7[^\n]*/i, "")
    .replace(/\s*customercare@csb[^\n]*/i, "")
    .replace(/\s*CIN:\s*[A-Z0-9]+[^\n]*/i, "")
    .replace(/\s*Website:[^\n]*/i, "")
    .replace(/\s*Nominee\s+Details[^\n]*/i, "")
    .replace(/\s*Legends\s+for\s+Trans[^\n]*/i, "")
    .replace(/\s*Disclaimer:[^\n]*/i, "")
    .replace(/\s*Statement\s+Generated[^\n]*/i, "")
    .replace(/\s*END\s+OF\s+STATEMENT[^\n]*/i, "")
    .replace(/\*{3,}[^\n]*/i, "")
    .trim();
}

export function parseBankStatement(rawText: string): BankStatementData {
  // Clean each line of page-boundary contamination BEFORE parsing
  const rawLines = rawText
    .split("\n")
    .map((l) => cleanPageBoundary(l))
    .filter((l) => l.length > 0);

  const lines = rawLines.map((l) => l.replace(/[|#]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);

  const joined = lines.join(" ");
  const filteredLines = lines.filter(
    (l) => !/^(CSB\s+Bank|Trusted\s+Heritage|1800\s+266|customercare@|CIN:|www\.csb|Website:|Nominee\s+Details|Legends\s+for\s+Trans|Disclaimer:|Statement\s+Generated|END\s+OF\s+STATEMENT|\*{3,})/i.test(l)
  );

  const accountHolderMatch =
    joined.match(/\b(SUPER\s+PRINTERS|SUPER\s+SCREENS|REVATHY\s+BHARANIDHARAN)\b/i)?.[1] ?? "";

  const accountHolder = accountHolderMatch
    ? accountHolderMatch.replace(/\s+/g, " ").trim()
    : lines.find((l) => !/(^CSB\s+BANK|TRUSTED\s+HERITAGE|CUSTOMER\s+ID|ACCOUNT\s+NUMBER|HOME\s+BRANCH|STATEMENT\s+OF\s+ACCOUNT)/i.test(l)) ?? "";

  const rawAcc = joined.match(/Account\s+Number\s*[:\s]+([\d\s-]{10,24})/i)?.[1] ?? "";
  let accountNumber = normalizeAccountNumber(rawAcc);
  if (!accountNumber) {
    const known = Object.keys(ACCOUNT_TAB_MAP).find((n) => joined.includes(n));
    accountNumber = known ?? "";
  }

  const accountType = joined.match(/Type\s+of\s+Account\s*[:\s]+(SAVING|CURRENT)/i)?.[1] ?? "";
  const branch = joined.match(/Home\s+Branch\s*[:\s]+([A-Z\s]+)/i)?.[1]?.trim() ?? "";
  const ifsc = joined.match(/IFSC\s+Code\s*[:\s]+([A-Z0-9]{11})/i)?.[1] ?? "";

  const periodMatch = joined.match(
    /period\s*:?[\s]+(\d{1,2}[-/\s][A-Za-z]{3}[-/\s]?\d{4})\s+to\s+(\d{1,2}[-/\s][A-Za-z]{3}[-/\s]?\d{4})/i,
  );

  const periodFrom = periodMatch ? normalizeDateToken(periodMatch[1]) : "";
  const periodTo = periodMatch ? normalizeDateToken(periodMatch[2]) : "";

  const summary = parseSummaryTotals(joined);

  const { transactions: parsedTxns, openingBalanceFromBF } = parseTransactions(filteredLines);
  const transactions = parsedTxns;

  // Clean transaction details of any remaining page-boundary text
  for (const txn of transactions) {
    txn.details = cleanPageBoundary(txn.details);
    if (!txn.details) txn.details = "Transaction";
  }

  const parsedTotalCredits = transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const parsedTotalDebits = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const totalCredits = summary.totalCredits > 0 ? summary.totalCredits : parsedTotalCredits;
  const totalDebits = summary.totalDebits > 0 ? summary.totalDebits : parsedTotalDebits;
  const openingBalance = openingBalanceFromBF > 0
    ? openingBalanceFromBF
    : (summary.openingBalance > 0 ? summary.openingBalance : transactions[0]?.balance ?? 0);
  const closingBalance = summary.closingBalance > 0 ? summary.closingBalance : transactions[transactions.length - 1]?.balance ?? 0;

  // Validation: compare parsed totals to reported totals when available
  if (summary.totalCredits > 0 && Math.abs(parsedTotalCredits - summary.totalCredits) > 0.02) {
    console.warn(`[parseBankStatement] Credits mismatch: parsed=${parsedTotalCredits}, reported=${summary.totalCredits}`);
  }
  if (summary.totalDebits > 0 && Math.abs(parsedTotalDebits - summary.totalDebits) > 0.02) {
    console.warn(`[parseBankStatement] Debits mismatch: parsed=${parsedTotalDebits}, reported=${summary.totalDebits}`);
  }

  console.log(`[parseBankStatement] ${accountHolder} | ${accountNumber} | ${transactions.length} transactions`);

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
