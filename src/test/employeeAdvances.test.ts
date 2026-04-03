import { describe, it, expect } from "vitest";
import {
  getAdvanceDeductionForMonth,
  getPayrollRowsForMonth,
  aggregateAttendanceByMonth,
  ADVANCE_MONTHLY_DEDUCTION,
  type PayrollEmployee,
  type EmployeeAdvance,
} from "@/hooks/usePayroll";

const makeEmployee = (code: string, salary: number): PayrollEmployee => ({
  id: `id-${code}`,
  employee_code: code,
  display_name: code,
  monthly_salary: salary,
  weekly_salary: 0,
  salary_type: "monthly_8th",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const makeAdvance = (
  code: string,
  amount: number,
  grantedOn: string,
  amountPaid = 0
): EmployeeAdvance => ({
  id: `adv-${code}-${grantedOn}`,
  employee_code: code,
  amount,
  granted_on: grantedOn,
  amount_paid: amountPaid,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const mockUploads = [
  {
    id: "u1",
    month_year: "2026-04",
    file_name: "april.pdf",
    parsed_data: {
      source_type: "absent_list",
      month_year: "2026-04",
      employees: [
        { code: "SP001", name: "Rajan Kumar", totalAbsentDays: 0, absent_dates: [] },
        { code: "SP002", name: "Priya S", totalAbsentDays: 0, absent_dates: [] },
      ],
    },
    created_at: "2026-04-30T10:00:00Z",
  },
];

const employees = [makeEmployee("SP001", 20000), makeEmployee("SP002", 15000)];

describe("getAdvanceDeductionForMonth", () => {
  it("returns 2000 when employee has an outstanding advance granted before the period", () => {
    const advances = [makeAdvance("SP001", 10000, "2026-03-15")];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(2000);
  });

  it("returns 0 when no advances exist for employee", () => {
    expect(getAdvanceDeductionForMonth([], "SP001", "2026-04")).toBe(0);
  });

  it("returns 0 when advance was granted in the same month (deduction starts next month)", () => {
    const advances = [makeAdvance("SP001", 10000, "2026-04-10")];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(0);
  });

  it("returns 0 when advance was granted in a future month", () => {
    const advances = [makeAdvance("SP001", 10000, "2026-05-01")];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(0);
  });

  it("returns 0 when advance is fully paid", () => {
    const advances = [makeAdvance("SP001", 2000, "2026-03-01", 2000)];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(0);
  });

  it("returns remaining balance when less than 2000 left", () => {
    const advances = [makeAdvance("SP001", 5000, "2026-03-01", 4500)];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(500);
  });

  it("caps deduction at 2000 even if outstanding is larger", () => {
    const advances = [makeAdvance("SP001", 50000, "2026-01-01")];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(2000);
  });

  it("does not deduct for a different employee", () => {
    const advances = [makeAdvance("SP002", 10000, "2026-03-01")];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(0);
  });

  it("is case-insensitive for employee code matching", () => {
    const advances = [makeAdvance("sp001", 10000, "2026-03-01")];
    expect(getAdvanceDeductionForMonth(advances, "SP001", "2026-04")).toBe(2000);
  });

  it("sums multiple outstanding advances but caps at 2000", () => {
    const advances = [
      makeAdvance("SP001", 3000, "2026-02-01"),
      makeAdvance("SP001", 4000, "2026-03-01"),
    ];
    const result = getAdvanceDeductionForMonth(advances, "SP001", "2026-04");
    expect(result).toBe(2000);
  });
});

describe("getPayrollRowsForMonth with advance deductions", () => {
  it("advanceDeduction is present on every payroll row", () => {
    const byMonth = aggregateAttendanceByMonth(mockUploads as never);
    const rows = getPayrollRowsForMonth(byMonth, employees, "2026-04");
    for (const row of rows) {
      expect(row).toHaveProperty("advanceDeduction");
    }
  });

  it("netPay is reduced by advance deduction", () => {
    const advances = [makeAdvance("SP001", 10000, "2026-03-15")];
    const byMonth = aggregateAttendanceByMonth(mockUploads as never);
    const rows = getPayrollRowsForMonth(byMonth, employees, "2026-04", advances);
    const rajan = rows.find((r) => r.code === "SP001");
    expect(rajan).toBeDefined();
    expect(rajan!.advanceDeduction).toBe(ADVANCE_MONTHLY_DEDUCTION);
    expect(rajan!.netPay).toBe(rajan!.monthlySalary - rajan!.lossOfPay - ADVANCE_MONTHLY_DEDUCTION);
  });

  it("employee with no advance has advanceDeduction of 0", () => {
    const byMonth = aggregateAttendanceByMonth(mockUploads as never);
    const rows = getPayrollRowsForMonth(byMonth, employees, "2026-04", []);
    const priya = rows.find((r) => r.code === "SP002");
    expect(priya).toBeDefined();
    expect(priya!.advanceDeduction).toBe(0);
    expect(priya!.netPay).toBe(priya!.monthlySalary);
  });

  it("advance granted same month does not reduce net pay", () => {
    const advances = [makeAdvance("SP001", 10000, "2026-04-05")];
    const byMonth = aggregateAttendanceByMonth(mockUploads as never);
    const rows = getPayrollRowsForMonth(byMonth, employees, "2026-04", advances);
    const rajan = rows.find((r) => r.code === "SP001");
    expect(rajan).toBeDefined();
    expect(rajan!.advanceDeduction).toBe(0);
    expect(rajan!.netPay).toBe(rajan!.monthlySalary);
  });

  it("ADVANCE_MONTHLY_DEDUCTION constant equals 2000", () => {
    expect(ADVANCE_MONTHLY_DEDUCTION).toBe(2000);
  });
});
