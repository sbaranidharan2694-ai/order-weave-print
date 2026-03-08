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

function normalizeAccountNumber(raw: string): string {
  return raw.replace(/\D/g, "").trim();
}

function normalizeDateToken(raw: string): string {
  const s = raw.trim().replace(/[\s/]+/g, "-");
  // Handle DD-MONYYYY (no separator between month and year) → DD-MON-YYYY
  const fixed = s.replace(/^(\d{1,2})-([A-Za-z]{3})(\d{4})$/, "$1-$2-$3");
  const m = fixed.match(/^(\d{1,2})-([A-Za-z]{3}|\d{1,2})-(\d{4})$/);
  if (!m) return raw.trim();
  const [, d, mon, y] = m;
  if (/^\d{1,2}$/.test(mon)) return `${d.padStart(2, "0")}-${mon.padStart(2, "0")}-${y}`;
  return `${d.padStart(2, "0")}-${mon.slice(0, 1).toUpperCase()}${mon.slice(1, 3).toLowerCase()}-${y}`;
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

function parseTabularTransactions(lines: string[]): Transaction[] {
  const DATE_PREFIX = /^(\d{1,2}[-/\s](?:[A-Za-z]{3}|\d{1,2})[-/\s]?\d{4})/i;
  const blocks: string[] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;

    if (DATE_PREFIX.test(line)) {
      if (current.length) blocks.push(current.join(" "));
      current = [line];
      continue;
    }

    if (
      current.length > 0 &&
      !/^(TRANS\s+DATE|VALUE\s+DATE|DEBITS?|CREDITS?|BALANCE|CSB\s+24x7|PAGE\s+\d+|Date\s+Details|Ref\s+No|SUPER\s+PRINTERS|SUPER\s+SCREENS|REVATHY|PALLAVARAM|SARASWATHI|superprntrs)/i.test(line)
    ) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join(" "));

  const out: Transaction[] = [];

  for (const block of blocks) {
    const clean = block.replace(/\s+/g, " ").trim();
    const start = clean.match(DATE_PREFIX);
    if (!start) continue;

    const date = normalizeDateToken(start[1]);
    let rest = clean.slice(start[0].length).trim();

    const valueDate = rest.match(DATE_PREFIX);
    if (valueDate) {
      rest = rest.slice(valueDate[0].length).trim();
    }

    const endNums = rest.match(/([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
    if (!endNums) continue;

    const debit = toNum(endNums[1]);
    const credit = toNum(endNums[2]);
    const balance = toNum(endNums[3]);
    let body = rest.slice(0, endNums.index).trim();

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
      counterparty: categorise(body),
    });
  }

  const deduped = Array.from(
    new Map(out.map((t) => [`${t.date}|${t.refNo}|${t.debit}|${t.credit}|${t.balance}|${t.details}`, t])).values(),
  );

  return deduped;
}

function parsePipeTableTransactions(lines: string[]): Transaction[] {
  const DATE_PREFIX = /^(\d{1,2}[-/\s](?:[A-Za-z]{3}|\d{1,2})[-/\s]?\d{4})/i;
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

    const middleStart = cols.length >= 7 ? 2 : 1;
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

    const isDebit = debit > 0 && credit === 0;

    out.push({
      date,
      details,
      refNo,
      debit,
      credit,
      balance,
      type: isDebit ? "debit" : "credit",
      counterparty: categorise(details),
    });
  }

  return Array.from(
    new Map(out.map((t) => [`${t.date}|${t.refNo}|${t.debit}|${t.credit}|${t.balance}|${t.details}`, t])).values(),
  );
}

function parseLooseTransactions(lines: string[]): Transaction[] {
  const DATE_RE = /(\d{1,2}[-/\s](?:[A-Za-z]{3}|\d{1,2})[-/\s]\d{4})/i;
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

    let body = rest.slice(0, detailsCutIndex).replace(/\s+/g, " ").trim();

    const refMatches = [...body.matchAll(/\b([A-Z0-9]{6,20})\b/g)];
    const refNo = refMatches.length ? (refMatches[refMatches.length - 1][1] ?? "") : "";
    if (refNo) {
      body = body.replace(new RegExp(`\\b${refNo}\\b`), "").replace(/\s+/g, " ").trim();
    }

    if (!body) body = "Transaction";

    const isDebit = debit > 0 && credit === 0;
    out.push({
      date: normalizeDateToken(firstDate),
      details: body,
      refNo,
      debit,
      credit,
      balance,
      type: isDebit ? "debit" : "credit",
      counterparty: categorise(body),
    });
  }

  return Array.from(
    new Map(out.map((t) => [`${t.date}|${t.refNo}|${t.debit}|${t.credit}|${t.balance}|${t.details}`, t])).values(),
  );
}

function parseLegacyTransactions(lines: string[]): Transaction[] {
  const DATE_RE = /^(\d{1,2}(?:[-/\s])[A-Z]{3}(?:[-/\s])\d{4})\s+(.*)/i;
  const BAL_RE = /INR\s+([\d,]+\.\d{2})\s*Cr/i;
  const AMOUNT_RE = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;

  const transactions: Transaction[] = [];
  let i = 0;

  while (i < lines.length) {
    const dateMatch = lines[i].match(DATE_RE);
    if (!dateMatch) {
      i++;
      continue;
    }

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

    const allAmounts = [...fullText.matchAll(AMOUNT_RE)]
      .map((m) => toNum(m[1]))
      .filter((a) => a > 0 && Math.abs(a - balance) > 0.01);

    const txAmount = allAmounts.length > 0 ? Math.min(...allAmounts) : 0;

    const details = fullText
      .replace(BAL_RE, "")
      .replace(/\b\d{12,20}\b/g, "")
      .replace(AMOUNT_RE, "")
      .replace(/\s+/g, " ")
      .trim();

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

    i = j;
  }

  return transactions;
}

/** Strip page-boundary contamination from extracted text lines. */
function cleanPageBoundary(text: string): string {
  // Remove "Page X of Y" and everything after it (header/footer text from next page)
  return text
    .replace(/\s*Page\s+\d+\s+of\s+\d+\b[\s\S]*/i, "")
    .replace(/\s*CSB\s+24x7[\s\S]*/i, "")
    .replace(/\s*customercare@csb[\s\S]*/i, "")
    .replace(/\s*CIN:\s*[A-Z0-9]+[\s\S]*/i, "")
    .trim();
}

export function parseBankStatement(rawText: string): BankStatementData {
  // Clean each line of page-boundary contamination BEFORE parsing
  const rawLines = rawText
    .split("\n")
    .map((l) => cleanPageBoundary(l))
    .filter((l) => l.length > 0);

  // Keep pipe-containing lines for pipeTableTransactions
  const pipeLines = rawLines.map((l) => l.replace(/#/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  // Stripped version (no pipes) for other parsers
  const lines = rawLines.map((l) => l.replace(/[|#]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);

  const joined = lines.join(" ");
  // Also filter out lines that are just page headers/footers
  const filteredLines = lines.filter(
    (l) => !/^(CSB\s+Bank|Trusted\s+Heritage|1800\s+266|customercare@|CIN:|www\.csbbank)/i.test(l)
  );

  const rawLinesFilt = rawLines.filter(
    (l) => !/^(CSB\s+Bank|Trusted\s+Heritage|1800\s+266|customercare@|CIN:|www\.csbbank)/i.test(l.replace(/[|#]/g, " ").trim())
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
    /period\s*:?[\s]+(\d{1,2}[-/\s][A-Za-z]{3}[-/\s]\d{4})\s+to\s+(\d{1,2}[-/\s][A-Za-z]{3}[-/\s]\d{4})/i,
  );

  const periodFrom = periodMatch ? normalizeDateToken(periodMatch[1]) : "";
  const periodTo = periodMatch ? normalizeDateToken(periodMatch[2]) : "";

  const summary = parseSummaryTotals(joined);

  const tabularTransactions = parseTabularTransactions(filteredLines);
  const pipeTableTransactions = parsePipeTableTransactions(pipeLines);
  const looseTransactions = parseLooseTransactions(filteredLines);
  const legacyTransactions = parseLegacyTransactions(filteredLines);

  const allResults = [tabularTransactions, pipeTableTransactions, looseTransactions, legacyTransactions];
  const transactions = allResults.sort((a, b) => b.length - a.length)[0] ?? [];

  // Clean transaction details of any remaining page-boundary text
  for (const txn of transactions) {
    txn.details = cleanPageBoundary(txn.details);
    if (!txn.details) txn.details = "Transaction";
  }

  const totalCredits = summary.totalCredits > 0 ? summary.totalCredits : transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const totalDebits = summary.totalDebits > 0 ? summary.totalDebits : transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const openingBalance = summary.openingBalance > 0 ? summary.openingBalance : transactions[0]?.balance ?? 0;
  const closingBalance = summary.closingBalance > 0 ? summary.closingBalance : transactions[transactions.length - 1]?.balance ?? 0;

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
