import { describe, expect, it } from "vitest";
import { parseBankStatement } from "@/utils/parseBankStatement";

describe("parseBankStatement - CSB formats", () => {
  it("parses SUPER SCREENS style table rows", () => {
    const raw = `
Statement Of Account (in INR) for the period: 20-FEB-2026 to 07-MAR-2026
Account Number: 0244020080155
| Opening Balance | Total Debit Amount | Total Credit Amount | Closing Balance |
| 63,290.26       | 183,347.77         | 1,91,848.00         | 71,790.49       |
| TRANS DATE  | VALUE DATE  | DETAILS                                              | REF NO./CHEQUE NO. | DEBITS    | CREDITS   | BALANCE     |
| 20-FEB-2026 | 20-FEB-2026 | UPI/DR/605141477991/DURAI SAMY /ICIC/VDURAISAMY07@O | 605141477991       | 500.00    | 0.00      | 62,790.26   |
| 20-FEB-2026 | 20-FEB-2026 | NEFT CR-- BARBU26051096965-JS AUTOMATION-BARB0SAIDA  |                    | 0.00      | 3,280.00  | 66,070.26   |
| 21-FEB-2026 | 21-FEB-2026 | ATW USING 652188XXXXXX4872- REFERENCE 605217006905-  | 605217006905       | 10,000.00 | 0.00      | 1,17,630.48 |
`;

    const parsed = parseBankStatement(raw);

    expect(parsed.accountNumber).toBe("0244020080155");
    expect(parsed.transactions.length).toBeGreaterThanOrEqual(3);
    expect(parsed.totalCredits).toBeGreaterThan(0);
    expect(parsed.totalDebits).toBeGreaterThan(0);
  });

  it("parses REVATHY format with multi-page rows", () => {
    const raw = `
Statement Of Account (in INR) for the period : 20-FEB-2026 to 07-MAR-2026
Account Number: 0244011477662
| Opening Balance | Total Debit Amount | Total Credit Amount | Closing Balance |
| 1,12,502.80     | 70,000.00          | 89,646.00           | 132,148.80      |
| 20-FEB-2026 | 20-FEB-2026 | IMPS--605105999122- GOOGLEINDIADIGITALSERVICESPRIVA | | 0.00 | 12,640.00 | 1,25,142.80 |
| 20-FEB-2026 | 20-FEB-2026 | CHQ PAID-INWARD CLEARING 12-01-SRI SWATHI ENTERPRI  | 100015 | 50,000.00 | 0.00 | 75,142.80 |
| 21-FEB-2026 | 21-FEB-2026 | UPI/CR/605255017648/BASKARAN                        | 017648 | 0.00 | 1,000.00 | 89,422.80 |
| 07-MAR-2026 | 07-MAR-2026 | IMPS--606657432274- GOOGLEINDIADIGITALSERVICESPRICES | | 0.00 | 4,925.00 | 1,32,148.80 |
`;

    const parsed = parseBankStatement(raw);

    expect(parsed.accountNumber).toBe("0244011477662");
    expect(parsed.transactions.length).toBeGreaterThanOrEqual(4);
  });

  it("parses collapsed non-pipe tabular lines", () => {
    const raw = `
Statement Of Account (in INR) for the period: 02-FEB-2026 to 07-MAR-2026
Account Number: 0244020077280
Opening Balance INR 1,12,018.74 Total Debits INR 502,090.14 Total Credits INR 5,48,010.00 Closing Balance INR 157,938.60
02-FEB-2026 02-FEB-2026 UPI/DR/603377993451/NAZEE R 603377993451 1,160.00 0.00 1,10,858.74
02-FEB-2026 02-FEB-2026 UPI/CR/603345287369/LAKSHMI 603345287369 0.00 440.00 1,11,298.74
03-FEB-2026 03-FEB-2026 NEFT CR-- 0.00 13,617.00 1,17,703.74
`;

    const parsed = parseBankStatement(raw);

    expect(parsed.accountNumber).toBe("0244020077280");
    expect(parsed.transactions.length).toBeGreaterThanOrEqual(3);
  });
});
