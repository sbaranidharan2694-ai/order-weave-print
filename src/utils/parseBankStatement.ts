import { extractCounterparty, classifyTransaction } from "@/utils/extractCounterparty";
import { logger } from "@/lib/logger";

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

// Account numbers should be configured in the Settings page and stored in the
// `settings` table, not in source code. These empty defaults are overridden at
// runtime via settings if available.
export const DEFAULT_ACCOUNT_TAB_MAP: Record<string, string> = {};
export const DEFAULT_ACCOUNT_LABEL_MAP: Record<string, string> = {};

export function getTabForAccount(accountNumber: string, tabMap: Record<string, string> = DEFAULT_ACCOUNT_TAB_MAP): string {
  const normalized = (accountNumber ?? "").replace(/\s/g, "");
  if (tabMap[normalized]) return tabMap[normalized];
  for (const [num, tab] of Object.entries(tabMap)) {
    if (normalized.includes(num)) return tab;
  }
  return "";
}

export function getLabelForAccount(accountNumber: string, labelMap: Record<string, string> = DEFAULT_ACCOUNT_LABEL_MAP): string {
  const normalized = (accountNumber ?? "").replace(/\s/g, "");
  return labelMap[normalized] ?? `Unknown (${accountNumber || "—"})`;
}

function toNum(raw: string | number): number {
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
  if (!raw) return 0;
  return parseFloat(String(raw).replace(/,/g, "").replace(/[^0-9.-]/g, "")) || 0;
}

function normalizeAccountNumber(raw: string): string {
  return raw.replace(/\D/g, "").trim();
}

const MONTH_NAMES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Normalize to YYYY-MM-DD for consistent sorting and display */
function normalizeDateToken(raw: string): string {
  const s = raw.trim().replace(/[\s/]+/g, "-");
  // YYYY-Mon-DD (e.g. 2025-Mar-29) → YYYY-MM-DD
  let m = s.match(/^(\d{4})-([A-Za-z]{3})-(\d{1,2})$/i);
  if (m) {
    const [, y, mon, d] = m;
    const mm = MONTH_NAMES[mon.slice(0, 3).toLowerCase()] ?? "01";
    return `${y}-${mm}-${d.padStart(2, "0")}`;
  }
  // DD-MM-YY → YYYY-MM-DD (assume 20xx)
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (m) {
    const [, d, mon, yy] = m;
    const y = parseInt(yy, 10) < 50 ? "20" + yy : "19" + yy;
    return `${y}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // DD-MON-YYYY or DD-Mon-YYYY
  const fixed = s.replace(/^(\d{1,2})-([A-Za-z]{3})(\d{4})$/, "$1-$2-$3");
  m = fixed.match(/^(\d{1,2})-([A-Za-z]{3}|\d{1,2})-(\d{4})$/);
  if (!m) return raw.trim();
  const [, d, mon, y] = m;
  if (/^\d{1,2}$/.test(mon)) return `${y}-${mon.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const mm = MONTH_NAMES[mon.slice(0, 3).toLowerCase()] ?? "01";
  return `${y}-${mm}-${d.padStart(2, "0")}`;
}

/** Fix debit/credit when description clearly indicates type (e.g. "NEFT Credit" → credit only; avoid same amount in both) */
function correctDebitCreditFromDescription(details: string, debit: number, credit: number): { debit: number; credit: number } {
  const d = details.toUpperCase();
  const isCredit = /NEFT[\s-]*(?:G\s|CR|CREDIT)|UPI\/CR|IMPS.*CR|CREDIT\b|CR\s*--|CASH\s+DEP/i.test(d);
  const isDebit = /NEFT[\s-]*(?:DR|DEBIT)|UPI\/DR|CHQ\s+PAID|ATW|ATM\s+WDL|DEBIT\b|DR\s*--/i.test(d);
  const amount = debit || credit;
  if (amount === 0) return { debit: 0, credit: 0 };
  if (debit > 0 && credit > 0) {
    if (isCredit && !isDebit) return { debit: 0, credit: Math.max(debit, credit) };
    if (isDebit && !isCredit) return { debit: Math.max(debit, credit), credit: 0 };
  }
  return { debit, credit };
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

/** Match transaction date at start: DD-MM-YYYY, DD-Mon-YYYY, DD-MM-YY, or YYYY-Mon-DD (e.g. 2025-Mar-29) */
const DATE_PREFIX = /^(\d{1,2}[-/\s](?:[A-Za-z]{3}|\d{1,2})[-/\s]?\d{2,4}|\d{4}[-/\s][A-Za-z]{3}[-/\s]\d{1,2})/i;

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

    const { debit: d, credit: c } = correctDebitCreditFromDescription(body, debit, credit);
    const isDebit = d > 0 && c === 0;
    out.push({
      date,
      details: body,
      refNo,
      debit: d,
      credit: c,
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

function parsePipeTableTransactions(lines: string[]): Transaction[] {
  const out: Transaction[] = [];
  for (const rawLine of lines) {
    if (!rawLine.includes("|")) continue;
    const cols = rawLine
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cols.length < 5) continue;
    if (!DATE_PREFIX.test(cols[0])) continue;
    const date = normalizeDateToken(cols[0]);
    const amountCols = cols.filter((c) => /^(?:[\d,]+\.\d{2}|-|)$/i.test(c));
    const debit = toNum(amountCols.at(-3) ?? "0");
    const credit = toNum(amountCols.at(-2) ?? "0");
    const balance = toNum(amountCols.at(-1) ?? "0");
    if (debit === 0 && credit === 0) continue;
    const dataStart = (cols[1] && DATE_PREFIX.test(cols[1])) ? 2 : 1;
    const middleStart = cols.length >= 7 ? Math.max(dataStart, 2) : dataStart;
    const middleEnd = Math.max(middleStart, cols.length - 3);
    const middle = cols.slice(middleStart, middleEnd).filter(Boolean);
    let refNo = "";
    if (middle.length > 1) {
      const tail = middle[middle.length - 1] ?? "";
      if (/^[A-Z0-9]{5,20}$/i.test(tail)) {
        refNo = tail;
        middle.pop();
      }
    }
    const details = middle.join(" ").replace(/\s+/g, " ").trim() || "Transaction";
    if (/^(TRANS\s+DATE|VALUE\s+DATE|DEBITS?|CREDITS?|BALANCE)$/i.test(details)) continue;
    let d = debit;
    let c = credit;
    const corrected = correctDebitCreditFromDescription(details, debit, credit);

    const hasDebitSignal = /NEFT[\s-]*(?:DR|DEBIT)|UPI\/DR|CHQ\s+PAID|ATW\s+USING|ATM\s+WDL|DEBIT\b|DR\s*--/i.test(
      details,
    );
    const hasCreditSignal = /NEFT[\s-]*(?:G\s|CR|CREDIT)|UPI\/CR|IMPS--|CREDIT\b|CR\s*--/i.test(
      details,
    );

    if (hasDebitSignal || hasCreditSignal) {
      d = corrected.debit;
      c = corrected.credit;
    } else {
      // Ambiguous details: if both debit and credit are populated, trust only one side.
      // Prefer the larger non-zero side, but never keep both non-zero.
      if (debit > 0 && credit > 0) {
        if (debit >= credit) {
          d = Math.max(debit, credit);
          c = 0;
        } else {
          d = 0;
          c = Math.max(debit, credit);
        }
      } else {
        d = corrected.debit;
        c = corrected.credit;
      }
    }

    const isDebit = d > 0 && c === 0;
    out.push({
      date,
      details,
      refNo,
      debit: d,
      credit: c,
      balance,
      type: isDebit ? "debit" : "credit",
      counterparty: extractCounterparty(details),
      category: classifyTransaction(details),
    });
  }
  return Array.from(new Map(out.map((t) => [`${t.date}|${t.refNo}|${t.debit}|${t.credit}|${t.balance}|${t.details}`, t])).values());
}

function parseLooseTransactions(lines: string[]): Transaction[] {
  const DATE_RE = /(\d{1,2}[-/\s](?:[A-Za-z]{3}|\d{1,2})[-/\s]?\d{2,4}|\d{4}[-/\s][A-Za-z]{3}[-/\s]\d{1,2})/i;
  const MONEY_RE = /[\d,]+\.\d{2}/g;
  const out: Transaction[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;
    if (/^(TRANS\s+DATE|VALUE\s+DATE|DEBITS?|CREDITS?|BALANCE|PAGE\s+\d+)/i.test(line)) continue;
    let rest = line;
    const firstDate = dateMatch[1];
    const secondDate = rest.slice(rest.indexOf(firstDate) + firstDate.length).match(DATE_RE)?.[1];
    rest = rest.replace(firstDate, "").trim();
    if (secondDate) rest = rest.replace(secondDate, "").trim();
    const amountMatches = [...rest.matchAll(MONEY_RE)];
    if (amountMatches.length < 2) continue;
    const balance = toNum(amountMatches[amountMatches.length - 1][0]);
    let debit = 0;
    let credit = 0;
    let detailsCutIndex = amountMatches[amountMatches.length - 2].index ?? rest.length;
    if (amountMatches.length >= 3) {
      debit = toNum(amountMatches[amountMatches.length - 3][0]);
      credit = toNum(amountMatches[amountMatches.length - 2][0]);
      detailsCutIndex = amountMatches[amountMatches.length - 3].index ?? rest.length;
    } else {
      const txAmount = toNum(amountMatches[amountMatches.length - 2][0]);
      const upper = rest.toUpperCase();
      if (/\b(UPI\/DR|DEBIT|CHQ\s+PAID|ATW|ATM|CHARGE|CHRG|GST|TAX)\b/.test(upper)) debit = txAmount;
      else credit = txAmount;
    }
    if (debit === 0 && credit === 0) continue;
    let body = rest.slice(0, detailsCutIndex).replace(/\s+/g, " ").trim();
    const refMatches = [...body.matchAll(/\b([A-Z0-9]{6,20})\b/g)];
    const refNo = refMatches.length ? (refMatches[refMatches.length - 1][1] ?? "") : "";
    if (refNo) body = body.replace(new RegExp(`\\b${refNo}\\b`), "").replace(/\s+/g, " ").trim();
    if (!body) body = "Transaction";
    const { debit: d, credit: c } = correctDebitCreditFromDescription(body, debit, credit);
    const isDebit = d > 0 && c === 0;
    out.push({
      date: normalizeDateToken(firstDate),
      details: body,
      refNo,
      debit: d,
      credit: c,
      balance,
      type: isDebit ? "debit" : "credit",
      counterparty: extractCounterparty(body),
      category: classifyTransaction(body),
    });
  }
  return Array.from(new Map(out.map((t) => [`${t.date}|${t.refNo}|${t.debit}|${t.credit}|${t.balance}|${t.details}`, t])).values());
}

function parseLegacyTransactions(lines: string[]): Transaction[] {
  const DATE_RE = /^(\d{1,2}(?:[-/\s])[A-Z]{3}(?:[-/\s])?\d{4})\s*(.*)/i;
  const BAL_RE = /INR\s+([\d,]+\.\d{2})\s*Cr/i;
  const AMOUNT_RE = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;
  const transactions: Transaction[] = [];
  let i = 0;
  while (i < lines.length) {
    const dateMatch = lines[i].match(DATE_RE);
    if (!dateMatch) { i++; continue; }
    const date = normalizeDateToken(dateMatch[1]);
    const detailParts: string[] = [dateMatch[2]];
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (DATE_RE.test(nextLine)) break;
      if (/end\s+of\s+statement/i.test(nextLine)) break;
      detailParts.push(nextLine);
      j++;
    }
    const fullText = detailParts.join(" ");
    const balMatch = fullText.match(BAL_RE);
    const balance = balMatch ? toNum(balMatch[1]) : 0;
    const refMatch = fullText.match(/\b(\d{12,20})\b/);
    const refNo = refMatch?.[1] ?? "";
    const isDebit = /UPI\/DR|ATW\s+using|Chq\s+Paid|Issuer\s+ATM\s+Fin|DEBIT/i.test(fullText);
    const isCredit = /UPI\/CR|NEFT\s+Cr--|IMPS--|NEFT\s+Cr\b|CREDIT/i.test(fullText);
    const allAmounts = [...fullText.matchAll(AMOUNT_RE)].map((m) => toNum(m[1])).filter((a) => a > 0 && Math.abs(a - balance) > 0.01);
    const txAmount = allAmounts.length > 0 ? Math.min(...allAmounts) : 0;
    const details = fullText.replace(BAL_RE, "").replace(/\b\d{12,20}\b/g, "").replace(AMOUNT_RE, "").replace(/\s+/g, " ").trim();
    if (balance > 0 || txAmount > 0) {
      const debitVal = isDebit ? txAmount : 0;
      const creditVal = isCredit ? txAmount : 0;
      const { debit: d, credit: c } = correctDebitCreditFromDescription(fullText, debitVal, creditVal);
      transactions.push({
        date,
        details: details || "Transaction",
        refNo,
        debit: d,
        credit: c,
        balance,
        type: d > 0 ? "debit" : "credit",
        counterparty: extractCounterparty(fullText),
        category: classifyTransaction(fullText),
      });
    }
    i = j;
  }
  return transactions;
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
  const pipeLines = rawLines.map((l) => l.replace(/#/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);

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
    const known = Object.keys(DEFAULT_ACCOUNT_TAB_MAP).find((n) => joined.includes(n));
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

  // Run multiple parsers and use the one that finds the most transactions (restores reliability across PDF formats)
  const { transactions: tabularTxns, openingBalanceFromBF } = parseTransactions(filteredLines);
  const pipeTxns = parsePipeTableTransactions(pipeLines);
  const looseTxns = parseLooseTransactions(filteredLines);
  const legacyTxns = parseLegacyTransactions(filteredLines);

  const candidates: { transactions: Transaction[]; openingBalanceFromBF: number }[] = [
    { transactions: tabularTxns, openingBalanceFromBF },
    { transactions: pipeTxns, openingBalanceFromBF: 0 },
    { transactions: looseTxns, openingBalanceFromBF: 0 },
    { transactions: legacyTxns, openingBalanceFromBF: 0 },
  ];
  const best = candidates.sort((a, b) => b.transactions.length - a.transactions.length)[0];
  const transactions = best.transactions;
  const effectiveOpeningFromBF = best.openingBalanceFromBF;

  // Clean transaction details of any remaining page-boundary text
  for (const txn of transactions) {
    txn.details = cleanPageBoundary(txn.details);
    if (!txn.details) txn.details = "Transaction";
  }

  const openingBalance = effectiveOpeningFromBF > 0
    ? effectiveOpeningFromBF
    : (summary.openingBalance > 0 ? summary.openingBalance : transactions[0]?.balance ?? 0);

  // Running balance (ledger): balance = previousBalance + credit - debit, in chronological order
  const chrono = [...transactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let running = openingBalance;
  for (const t of chrono) {
    t.balance = Math.round(running * 100) / 100;
    running += (t.credit || 0) - (t.debit || 0);
  }

  // Sort by date descending (YYYY-MM-DD: newest first)
  transactions.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const parsedTotalCredits = transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const parsedTotalDebits = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const totalCredits = summary.totalCredits > 0 ? summary.totalCredits : parsedTotalCredits;
  const totalDebits = summary.totalDebits > 0 ? summary.totalDebits : parsedTotalDebits;
  const closingBalance = summary.closingBalance > 0 ? summary.closingBalance : transactions[transactions.length - 1]?.balance ?? 0;

  // Validation: compare parsed totals to reported totals when available
  if (summary.totalCredits > 0 && Math.abs(parsedTotalCredits - summary.totalCredits) > 0.02) {
    logger.warn(`[parseBankStatement] Credits mismatch: parsed=${parsedTotalCredits}, reported=${summary.totalCredits}`);
  }
  if (summary.totalDebits > 0 && Math.abs(parsedTotalDebits - summary.totalDebits) > 0.02) {
    logger.warn(`[parseBankStatement] Debits mismatch: parsed=${parsedTotalDebits}, reported=${summary.totalDebits}`);
  }

  logger.log(`[parseBankStatement] ${accountHolder} | ${accountNumber} | ${transactions.length} transactions`);

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
