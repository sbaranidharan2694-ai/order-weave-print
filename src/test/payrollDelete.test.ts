import { describe, it, expect } from "vitest";
import {
  getPayrollRowsForMonth,
  aggregateAttendanceByMonth,
  type PayrollEmployee,
} from "@/hooks/usePayroll";

const mockUploads = [
  {
    id: "u1",
    month_year: "2026-03",
    file_name: "march.pdf",
    parsed_data: {
      source_type: "absent_list",
      month_year: "2026-03",
      employees: [
        { code: "SP001", name: "Rajan Kumar", totalAbsentDays: 2, absent_dates: [] },
        { code: "SP002", name: "Priya S", totalAbsentDays: 0, absent_dates: [] },
        { code: "SP003", name: "Mohan D", totalAbsentDays: 5, absent_dates: [] },
      ],
    },
    created_at: "2026-03-31T10:00:00Z",
  },
];

const mockPayrollEmployees: PayrollEmployee[] = [
  { id: "e1", employee_code: "SP001", display_name: "Rajan Kumar", monthly_salary: 18000, weekly_salary: 4500, updated_at: "" },
  { id: "e2", employee_code: "SP002", display_name: "Priya S", monthly_salary: 20000, weekly_salary: 5000, updated_at: "" },
];

describe("Payroll delete flow", () => {
  it("payrollEmpByCode lookup finds employee by normalised code", () => {
    const map = new Map<string, PayrollEmployee>();
    for (const e of mockPayrollEmployees) {
      map.set((e.employee_code || "").trim().toUpperCase(), e);
    }
    expect(map.get("SP001")).toBeDefined();
    expect(map.get("SP001")?.id).toBe("e1");
    expect(map.get("SP002")?.id).toBe("e2");
  });

  it("returns undefined for employee not in payroll master (SP003)", () => {
    const map = new Map<string, PayrollEmployee>();
    for (const e of mockPayrollEmployees) {
      map.set((e.employee_code || "").trim().toUpperCase(), e);
    }
    expect(map.get("SP003")).toBeUndefined();
  });

  it("getPayrollRowsForMonth includes SP003 even without salary config", () => {
    const byMonth = aggregateAttendanceByMonth(mockUploads as any);
    const rows = getPayrollRowsForMonth(byMonth, mockPayrollEmployees, "2026-03");
    const codes = rows.map((r) => r.code);
    expect(codes).toContain("SP003");
  });

  it("SP001 and SP002 delete button should find existing payroll entry", () => {
    const map = new Map<string, PayrollEmployee>();
    for (const e of mockPayrollEmployees) {
      map.set((e.employee_code || "").trim().toUpperCase(), e);
    }
    const byMonth = aggregateAttendanceByMonth(mockUploads as any);
    const rows = getPayrollRowsForMonth(byMonth, mockPayrollEmployees, "2026-03");

    for (const row of rows) {
      const existing = map.get((row.code || "").trim().toUpperCase());
      if (row.code === "SP001" || row.code === "SP002") {
        expect(existing).toBeDefined();
        expect(existing?.id).toBeTruthy();
      }
      if (row.code === "SP003") {
        expect(existing).toBeUndefined();
      }
    }
  });

  it("net pay is correctly reduced for absent days", () => {
    const byMonth = aggregateAttendanceByMonth(mockUploads as any);
    const rows = getPayrollRowsForMonth(byMonth, mockPayrollEmployees, "2026-03");
    const rajan = rows.find((r) => r.code === "SP001");
    expect(rajan).toBeDefined();
    expect(rajan!.lossOfPay).toBeGreaterThan(0);
    expect(rajan!.netPay).toBeLessThan(rajan!.monthlySalary);
  });

  it("zero absent means full salary", () => {
    const byMonth = aggregateAttendanceByMonth(mockUploads as any);
    const rows = getPayrollRowsForMonth(byMonth, mockPayrollEmployees, "2026-03");
    const priya = rows.find((r) => r.code === "SP002");
    expect(priya).toBeDefined();
    expect(priya!.lossOfPay).toBe(0);
    expect(priya!.netPay).toBe(priya!.monthlySalary);
  });
});
