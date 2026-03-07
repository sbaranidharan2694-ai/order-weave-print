export interface Transaction {
  date: string;
  details: string;
  refNo: string;
  debit: number;
  credit: number;
  balance: number;
  type: "debit" | "credit";
  category: string;
}

export interface BankStatementData {
  docType?: "bank_statement";
  accountHolder: string;
  accountNumber: string;
  accountType: string;
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
}

function toNum(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[INRCr\s,]/g, "")) || 0;
}

function categorise(detail: string): string {
  const d = detail.toUpperCase();
  if (d.includes("GOOGLE") || d.includes("IMPS")) return "Digital Receipt";
  if (d.includes("UPI/CR")) return "UPI Receipt";
  if (d.includes("UPI/DR")) return "UPI Payment";
  if (d.includes("NEFT") && d.includes("CR")) return "NEFT Receipt";
  if (d.includes("ATW") || d.includes("ATM")) return "ATM Withdrawal";
  if (d.includes("CHQ") || d.includes("CLEARING")) return "Cheque";
  if (d.includes("SWIGGY")) return "Food";
  return "Other";
}

export function parseBankStatement(rawText: string): BankStatementData {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const joined = lines.join(" ");

  const accountHolder = lines[0] || "";

  const accMatch = joined.match(/Account\s+Number\s*[:\s]+(\d{10,16})/i);
  const accountNumber = accMatch?.[1] || "";

  const typeMatch = joined.match(
    /Type\s+of\s+Account\s*[:\s]+(SAVING|CURRENT)/i
  );
  const accountType = typeMatch?.[1] || "";

  const branchMatch = joined.match(/Home\s+Branch\s*[:\s]+([A-Z]+)/i);
  const branch = branchMatch?.[1] || "";

  const ifscMatch = joined.match(/IFSC\s+Code\s*[:\s]+([A-Z0-9]{11})/i);
  const ifsc = ifscMatch?.[1] || "";

  const periodMatch = joined.match(
    /period[:\s]+(\d{2}[-\s][A-Za-z]{3}[-\s]\d{4})\s+to\s+(\d{2}[-\s][A-Za-z]{3}[-\s]\d{4})/i
  );
  const periodFrom = periodMatch?.[1] || "";
  const periodTo = periodMatch?.[2] || "";

  const obMatch = joined.match(/Opening\s+Balance\s+INR\s+([\d,]+\.\d{2})/i);
  const openingBalance = obMatch ? toNum(obMatch[1]) : 0;

  const tcMatch = joined.match(/Total\s+Credits\s+INR\s+([\d,]+\.\d{2})/i);
  const totalCredits = tcMatch ? toNum(tcMatch[1]) : 0;

  const tdMatch = joined.match(/Total\s+Debits\s+INR\s+([\d,]+\.\d{2})/i);
  const totalDebits = tdMatch ? toNum(tdMatch[1]) : 0;

  const cbMatch = joined.match(/Closing\s+Balance\s+INR\s+([\d,]+\.\d{2})/i);
  const closingBalance = cbMatch ? toNum(cbMatch[1]) : 0;

  const transactions: Transaction[] = [];
  const dateRe = /^(\d{1,2}\s+[A-Z]{3}\s+\d{4})\s+(.*)/;
  const balRe = /INR\s+([\d,]+\.\d{2})\s*Cr/i;
  const amtRe = /\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g;

  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(dateRe);
    if (!m) {
      i++;
      continue;
    }

    const date = m[1];
    const detailParts: string[] = [m[2]];
    let balance = 0;
    let j = i + 1;

    while (j < lines.length) {
      const next = lines[j];
      if (
        next.match(/^\d{1,2}\s+[A-Z]{3}\s+\d{4}\s/) ||
        next.includes("End of statement")
      )
        break;
      detailParts.push(next);
      j++;
    }

    const detailFull = detailParts.join(" ");

    const bm = detailFull.match(balRe);
    if (bm) balance = toNum(bm[1]);

    const amounts = [...detailFull.matchAll(amtRe)]
      .map((x) => toNum(x[1]))
      .filter((a) => a > 0 && Math.abs(a - balance) > 0.01);

    const isDebit = /UPI\/DR|ATW\s+using|Chq\s+Paid|Issuer\s+ATM|DEBIT/i.test(
      detailFull
    );
    const isCredit = /UPI\/CR|NEFT\s+Cr--|IMPS--|IMPS\s+Cr/i.test(detailFull);

    const txAmount =
      amounts.length > 0
        ? amounts.reduce((min, a) => (a < min ? a : min), amounts[0])
        : 0;

    const debit = isDebit ? txAmount : 0;
    const credit = isCredit ? txAmount : 0;

    const refMatch = detailFull.match(/\b(\d{12,20})\b/);
    const refNo = refMatch?.[1] || "";

    const details = detailFull
      .replace(balRe, "")
      .replace(/\b\d{12,20}\b/g, "")
      .replace(/\b\d{1,3}(?:,\d{3})*\.\d{2}\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (balance > 0 || debit > 0 || credit > 0) {
      transactions.push({
        date,
        details,
        refNo,
        debit,
        credit,
        balance,
        type: isDebit ? "debit" : "credit",
        category: categorise(detailFull),
      });
    }

    i = j;
  }

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
  };
}
