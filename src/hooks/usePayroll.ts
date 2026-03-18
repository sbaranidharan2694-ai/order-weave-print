import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AttendanceUpload, AttendanceParsedData, AbsentListParsedData, DetailedReportParsedData } from "./useAttendance";

export type PayrollEmployee = {
  id: string;
  employee_code: string;
  display_name: string;
  monthly_salary: number;
  weekly_salary?: number;
  created_at: string;
  updated_at: string;
};

/** Per-employee, per-month attendance summary from uploaded PDFs */
export type AttendanceMonthSummary = {
  code: string;
  name: string;
  present: number;
  absent: number;
  workingDays: number;
};

/** One row in the payroll table (monthly): attendance + salary + computed pay */
export type PayrollRow = {
  code: string;
  name: string;
  monthYear: string;
  present: number;
  absent: number;
  workingDays: number;
  monthlySalary: number;
  lossOfPay: number;
  netPay: number;
};

/** One row in the payroll table (weekly) */
export type PayrollRowWeek = {
  code: string;
  name: string;
  weekEnding: string;
  present: number;
  absent: number;
  workingDays: number;
  weeklySalary: number;
  lossOfPay: number;
  netPay: number;
};

const DEFAULT_WORKING_DAYS = 26;
const DEFAULT_WORKING_DAYS_PER_WEEK = 6;

/**
 * Calendar Mon–Sat count in month (Sunday weekly off). Used as one consistent
 * denominator for LOP for every employee in that month.
 */
export function getStandardWorkingDaysForMonth(monthYear: string): number {
  const parts = monthYear.split("-");
  const y = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  if (!y || !m || m < 1 || m > 12) return DEFAULT_WORKING_DAYS;
  const last = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= last; d++) {
    const day = new Date(y, m - 1, d).getDay();
    if (day >= 1 && day <= 6) n++;
  }
  return Math.max(1, n);
}

/** Mon–Sat days in the week that ends on `weekEndSunday` (YYYY-MM-DD, Sunday). */
export function getStandardWorkingDaysForWeekEnding(weekEndSunday: string): number {
  const parts = weekEndSunday.split("-").map((x) => parseInt(x, 10));
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return DEFAULT_WORKING_DAYS_PER_WEEK;
  const sun = new Date(parts[0], parts[1] - 1, parts[2]);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(sun);
    d.setDate(sun.getDate() - i);
    const day = d.getDay();
    if (day >= 1 && day <= 6) n++;
  }
  return Math.max(1, n);
}

function normalizeCode(code: string): string {
  return (code || "").trim().toUpperCase();
}

/** Get week-ending date (Sunday) as YYYY-MM-DD for the week containing the given date */
function getWeekEnding(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Parse "10-Feb" with year from month "2026-02" -> "2026-02-10" */
function parseAbsentDate(dayMonth: string, monthYear: string): string | null {
  const match = dayMonth.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
  if (!match) return null;
  const [y] = monthYear.split("-");
  const months: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
  const mm = months[match[2].slice(0, 3).toLowerCase()] ?? "01";
  const dd = match[1].padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * Aggregate all attendance uploads into per-month, per-employee stats.
 * Handles absent_list (totalAbsentDays only) and detailed_report (present/absent/weeklyOff).
 */
export function aggregateAttendanceByMonth(uploads: AttendanceUpload[]): Map<string, Map<string, AttendanceMonthSummary>> {
  const byMonth = new Map<string, Map<string, AttendanceMonthSummary>>();

  for (const u of uploads) {
    const monthYear = u.month_year;
    if (!monthYear) continue;
    const data = u.parsed_data as AttendanceParsedData;
    if (!data?.employees?.length) continue;

    let monthMap = byMonth.get(monthYear);
    if (!monthMap) {
      monthMap = new Map();
      byMonth.set(monthYear, monthMap);
    }

    if (data.source_type === "absent_list") {
      const absentData = data as AbsentListParsedData;
      for (const emp of absentData.employees) {
        const code = normalizeCode(emp.code);
        const absent = emp.totalAbsentDays ?? 0;
        const workingDays = DEFAULT_WORKING_DAYS;
        const present = Math.max(0, workingDays - absent);
        const existing = monthMap.get(code);
        if (existing) {
          existing.present += present;
          existing.absent += absent;
          existing.workingDays = Math.max(existing.workingDays, workingDays);
        } else {
          monthMap.set(code, { code: emp.code, name: emp.name || emp.code, present, absent, workingDays });
        }
      }
    } else if (data.source_type === "detailed_report") {
      const detailData = data as DetailedReportParsedData;
      for (const emp of detailData.employees) {
        const code = normalizeCode(emp.code);
        const present = emp.present ?? 0;
        const absent = emp.absent ?? 0;
        const workingDays = present + absent || DEFAULT_WORKING_DAYS;
        const existing = monthMap.get(code);
        if (existing) {
          existing.present += present;
          existing.absent += absent;
          existing.workingDays = Math.max(existing.workingDays, workingDays);
        } else {
          monthMap.set(code, {
            code: emp.code,
            name: emp.name || emp.code,
            present,
            absent,
            workingDays,
          });
        }
      }
    } else {
      const employees = data.employees as Array<{ name: string; present?: number; absent?: number; code?: string }>;
      for (const emp of employees) {
        const code = normalizeCode(emp.code ?? emp.name ?? "");
        const present = emp.present ?? 0;
        const absent = emp.absent ?? 0;
        const workingDays = present + absent || DEFAULT_WORKING_DAYS;
        const existing = monthMap.get(code);
        if (existing) {
          existing.present += present;
          existing.absent += absent;
          existing.workingDays = Math.max(existing.workingDays, workingDays);
        } else {
          monthMap.set(code, {
            code: emp.code ?? "",
            name: emp.name || code,
            present,
            absent,
            workingDays,
          });
        }
      }
    }
  }

  return byMonth;
}

/**
 * Build payroll table rows for a given month: attendance + salary + loss of pay + net pay.
 */
export function getPayrollRowsForMonth(
  byMonth: Map<string, Map<string, AttendanceMonthSummary>>,
  payrollEmployees: PayrollEmployee[],
  monthYear: string
): PayrollRow[] {
  const monthMap = byMonth.get(monthYear);
  if (!monthMap || monthMap.size === 0) return [];

  const salaryByCode = new Map<string, number>();
  for (const e of payrollEmployees) {
    salaryByCode.set(normalizeCode(e.employee_code), Number(e.monthly_salary) || 0);
  }

  const standardWD = getStandardWorkingDaysForMonth(monthYear);
  const rows: PayrollRow[] = [];
  for (const [, summary] of monthMap) {
    const code = normalizeCode(summary.code);
    const salary = salaryByCode.get(code) ?? 0;
    const absentRaw = Math.max(0, summary.absent);
    const absentForLop = Math.min(absentRaw, standardWD);
    const lossOfPay =
      standardWD > 0 && absentForLop > 0
        ? Math.round((Number(salary) * absentForLop) / standardWD)
        : 0;
    const netPay = Math.max(0, salary - lossOfPay);

    rows.push({
      code: summary.code,
      name: summary.name,
      monthYear,
      present: summary.present,
      absent: absentRaw,
      workingDays: standardWD,
      monthlySalary: salary,
      lossOfPay,
      netPay,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Per-employee, per-week attendance summary (same shape as month for reuse) */
export type AttendanceWeekSummary = AttendanceMonthSummary;

/**
 * Aggregate attendance by week (week ending = Sunday). Uses daily data from detailed_report;
 * for absent_list, distributes absent dates into weeks.
 */
export function aggregateAttendanceByWeek(uploads: AttendanceUpload[]): Map<string, Map<string, AttendanceWeekSummary>> {
  const byWeek = new Map<string, Map<string, AttendanceWeekSummary>>();

  for (const u of uploads) {
    const data = u.parsed_data as AttendanceParsedData;
    if (!data?.employees?.length) continue;

    if (data.source_type === "detailed_report") {
      const detailData = data as DetailedReportParsedData;
      for (const emp of detailData.employees) {
        const days = emp.days ?? [];
        for (const d of days) {
          const dateStr = d.date;
          if (!dateStr) continue;
          const weekKey = getWeekEnding(dateStr);
          let weekMap = byWeek.get(weekKey);
          if (!weekMap) {
            weekMap = new Map();
            byWeek.set(weekKey, weekMap);
          }
          const code = normalizeCode(emp.code);
          const isPresent = /present/i.test(d.status);
          const isAbsent = /absent/i.test(d.status);
          const existing = weekMap.get(code);
          if (!existing) {
            weekMap.set(code, {
              code: emp.code,
              name: emp.name || emp.code,
              present: isPresent ? 1 : 0,
              absent: isAbsent ? 1 : 0,
              workingDays: (isPresent || isAbsent) ? 1 : 0,
            });
          } else {
            if (isPresent) existing.present += 1;
            if (isAbsent) existing.absent += 1;
            if (isPresent || isAbsent) existing.workingDays += 1;
          }
        }
      }
    } else if (data.source_type === "absent_list") {
      const absentData = data as AbsentListParsedData;
      const monthYear = data.month_year;
      if (!monthYear) continue;
      for (const emp of absentData.employees) {
        const absentDates = emp.absentDates ?? [];
        const weekAbsent = new Map<string, number>();
        for (const dayMonth of absentDates) {
          const fullDate = parseAbsentDate(dayMonth.trim(), monthYear);
          if (!fullDate) continue;
          const weekKey = getWeekEnding(fullDate);
          weekAbsent.set(weekKey, (weekAbsent.get(weekKey) ?? 0) + 1);
        }
        for (const [weekKey, absent] of weekAbsent) {
          let weekMap = byWeek.get(weekKey);
          if (!weekMap) {
            weekMap = new Map();
            byWeek.set(weekKey, weekMap);
          }
          const code = normalizeCode(emp.code);
          const workingDays = DEFAULT_WORKING_DAYS_PER_WEEK;
          const present = Math.max(0, workingDays - absent);
          const existing = weekMap.get(code);
          if (existing) {
            existing.present += present;
            existing.absent += absent;
            existing.workingDays = Math.max(existing.workingDays, workingDays);
          } else {
            weekMap.set(code, { code: emp.code, name: emp.name || emp.code, present, absent, workingDays });
          }
        }
      }
    }
  }

  return byWeek;
}

/**
 * Build payroll table rows for a given week. Uses weekly_salary if set, else monthly_salary / 4.33.
 */
export function getPayrollRowsForWeek(
  byWeek: Map<string, Map<string, AttendanceWeekSummary>>,
  payrollEmployees: PayrollEmployee[],
  weekEnding: string
): PayrollRowWeek[] {
  const weekMap = byWeek.get(weekEnding);
  if (!weekMap || weekMap.size === 0) return [];

  const salaryByCode = new Map<string, number>();
  for (const e of payrollEmployees) {
    const weekly = Number(e.weekly_salary) || 0;
    const fromMonthly = Number(e.monthly_salary) || 0;
    const effectiveWeekly = weekly > 0 ? weekly : (fromMonthly > 0 ? Math.round(fromMonthly / 4.33) : 0);
    salaryByCode.set(normalizeCode(e.employee_code), effectiveWeekly);
  }

  const standardWD = getStandardWorkingDaysForWeekEnding(weekEnding);
  const rows: PayrollRowWeek[] = [];
  for (const [, summary] of weekMap) {
    const code = normalizeCode(summary.code);
    const salary = salaryByCode.get(code) ?? 0;
    const absentRaw = Math.max(0, summary.absent);
    const absentForLop = Math.min(absentRaw, standardWD);
    const lossOfPay =
      standardWD > 0 && absentForLop > 0
        ? Math.round((Number(salary) * absentForLop) / standardWD)
        : 0;
    const netPay = Math.max(0, salary - lossOfPay);

    rows.push({
      code: summary.code,
      name: summary.name,
      weekEnding,
      present: summary.present,
      absent: absentRaw,
      workingDays: standardWD,
      weeklySalary: salary,
      lossOfPay,
      netPay,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function usePayrollEmployees() {
  return useQuery({
    queryKey: ["payroll_employees"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("payroll_employees")
          .select("*")
          .order("employee_code");
        if (error) {
          if (error.code === "42P01" || error.message?.includes("does not exist") || error.message?.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as PayrollEmployee[];
      } catch {
        return [];
      }
    },
    retry: false,
  });
}

export function useUpsertPayrollEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      employee_code: string;
      display_name: string;
      monthly_salary: number;
      weekly_salary?: number;
    }) => {
      const row = {
        employee_code: payload.employee_code.trim(),
        display_name: payload.display_name.trim(),
        monthly_salary: Number(payload.monthly_salary) || 0,
        weekly_salary: Number(payload.weekly_salary ?? 0) || 0,
        updated_at: new Date().toISOString(),
      };
      if (payload.id) {
        const { data, error } = await supabase.from("payroll_employees").update(row).eq("id", payload.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("payroll_employees").insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_employees"] });
      toast.success("Employee salary saved.");
    },
    onError: (e: unknown) => {
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "Save failed";
      toast.error(msg.includes("schema cache") || msg.includes("does not exist") ? "Database tables missing. Run Supabase migrations." : msg);
    },
  });
}

export function useDeletePayrollEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll_employees"] });
      toast.success("Employee removed from payroll.");
    },
    onError: (e: unknown) => {
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "Delete failed";
      toast.error(msg.includes("schema cache") || msg.includes("does not exist") ? "Database tables missing. Run Supabase migrations." : msg);
    },
  });
}

/** Parsed row from PDF for import */
export type ParsedEmployeeRow = {
  employee_code: string;
  display_name: string;
  monthly_salary: number;
  weekly_salary: number;
};

const EMPLOYEE_CODE_RE = /(SP|SS|ADMIN)\d{2,4}\b/i;

/**
 * Parse PDF text for employee list: lines with code (SP/SS/ADMIN + digits), name, optional salary.
 * Handles "Code Name [Salary]", "1. Code Name", or table with code anywhere in the line.
 */
export function parseEmployeesFromPdfText(text: string): ParsedEmployeeRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: ParsedEmployeeRow[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const codeMatch = line.match(EMPLOYEE_CODE_RE);
    if (!codeMatch) continue;
    const code = codeMatch[0].trim().toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);

    const idx = line.indexOf(codeMatch[0]);
    const before = line.slice(0, idx).replace(/\s+/g, " ").trim().replace(/^[\d.]+\s*/, "");
    const after = line.slice(idx + codeMatch[0].length).replace(/\s+/g, " ").trim();
    const numAtEnd = after.match(/\s+(\d{1,10}(?:,\d{3})*(?:\.\d{2})?)\s*$/);
    let monthlySalary = 0;
    let weeklySalary = 0;
    let namePart = after;
    if (numAtEnd) {
      monthlySalary = Math.round(parseFloat(numAtEnd[1].replace(/,/g, "")) || 0);
      weeklySalary = monthlySalary > 0 ? Math.round(monthlySalary / 4.33) : 0;
      namePart = after.slice(0, numAtEnd.index).trim();
    }
    const name = (before ? before + " " : "") + namePart || code;
    const displayName = name.replace(/\s+/g, " ").trim() || code;
    result.push({
      employee_code: code,
      display_name: displayName,
      monthly_salary: monthlySalary,
      weekly_salary: weeklySalary,
    });
  }

  return result;
}

export function useBulkUpsertPayrollEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ParsedEmployeeRow[]) => {
      if (rows.length === 0) return [];
      const payload = rows.map((r) => ({
        employee_code: r.employee_code.trim(),
        display_name: r.display_name.trim(),
        monthly_salary: Number(r.monthly_salary) || 0,
        weekly_salary: Number(r.weekly_salary) || 0,
        updated_at: new Date().toISOString(),
      }));
      const { data, error } = await supabase.from("payroll_employees").upsert(payload, { onConflict: "employee_code" }).select();
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["payroll_employees"] });
      toast.success(`${variables.length} employee(s) added or updated.`);
    },
    onError: (e: unknown) => {
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "Import failed";
      toast.error(msg.includes("schema cache") || msg.includes("does not exist") ? "Database tables missing. Run Supabase migrations." : msg);
    },
  });
}
