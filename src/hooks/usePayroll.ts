import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AttendanceUpload, AttendanceParsedData, AbsentListParsedData, DetailedReportParsedData } from "./useAttendance";

export type SalaryType = "monthly_8th" | "monthly_1st" | "weekly";

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  monthly_8th: "Monthly (paid on 8th)",
  monthly_1st: "Monthly (paid on 1st)",
  weekly: "Weekly (paid every Saturday)",
};

export type PayrollEmployee = {
  id: string;
  employee_code: string;
  display_name: string;
  monthly_salary: number;
  weekly_salary?: number;
  salary_type?: SalaryType;
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

export type EmployeeAdvance = {
  id: string;
  employee_code: string;
  amount: number;
  granted_on: string;
  amount_paid: number;
  created_at: string;
  updated_at: string;
};

const ADVANCE_MONTHLY_DEDUCTION = 2000;

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
  advanceDeduction: number;
  netPay: number;
  salaryType: SalaryType;
  payDate: string;
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
  salaryType: SalaryType;
  payDate: string;
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

/**
 * Compute the actual pay date for a given employee salary type and period.
 * - monthly_8th: paid on 8th of the SAME month (covers 8th prev → 7th current)
 * - monthly_1st: paid on 1st of the month AFTER the worked month
 * - weekly: paid on the Saturday of the worked week
 */
export function getPayDate(salaryType: SalaryType, period: string): string {
  if (salaryType === "weekly") {
    const sun = new Date(period + "T12:00:00Z");
    sun.setUTCDate(sun.getUTCDate() - 1);
    return sun.toISOString().slice(0, 10);
  }
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  // Both monthly types pay in the NEXT month after the attendance period
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const day = salaryType === "monthly_8th" ? "08" : "01";
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${day}`;
}

/**
 * Salary period description for display.
 * - monthly_8th: 8th of prev month to 7th of current month
 * - monthly_1st: 1st to last of current month
 * - weekly: Mon to Sat of that week
 */
export function getSalaryPeriodLabel(salaryType: SalaryType, period: string): string {
  if (salaryType === "weekly") return "Mon–Sat";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  if (salaryType === "monthly_8th") {
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const lastDay = new Date(y, m - 1, 0).getDate();
    return `8 ${new Date(prevYear, prevMonth - 1, 1).toLocaleString("en-IN", { month: "short" })} – 7 ${new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short" })}`;
  }
  const lastDay = new Date(y, m, 0).getDate();
  return `1 – ${lastDay} ${new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "short" })}`;
}

const FREE_HOLIDAYS_PER_MONTH = 1;

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
// Priority: detailed_report > absent_list > generic
function sourcePriority(source?: string): number {
  if (source === "detailed_report") return 2;
  if (source === "absent_list") return 1;
  return 0;
}

export function aggregateAttendanceByMonth(uploads: AttendanceUpload[]): Map<string, Map<string, AttendanceMonthSummary>> {
  const byMonth = new Map<string, Map<string, AttendanceMonthSummary>>();
  // Track which source priority was used per (monthYear, employeeCode) so a
  // higher-quality source always wins and a same-quality second upload doesn't double-count.
  const seenPriority = new Map<string, number>(); // key = `${monthYear}::${code}`

  // Sort uploads oldest→newest so newer uploads override older ones of same type
  const sorted = [...uploads].sort((a, b) =>
    (a.created_at || "").localeCompare(b.created_at || "")
  );

  for (const u of sorted) {
    const monthYear = u.month_year;
    if (!monthYear) continue;
    const data = u.parsed_data as AttendanceParsedData;
    if (!data?.employees?.length) continue;

    const uploadPriority = sourcePriority(data.source_type);

    let monthMap = byMonth.get(monthYear);
    if (!monthMap) {
      monthMap = new Map();
      byMonth.set(monthYear, monthMap);
    }

    const processEmployee = (code: string, name: string, present: number, absent: number, workingDays: number) => {
      const seenKey = `${monthYear}::${code}`;
      const prevPriority = seenPriority.get(seenKey) ?? -1;

      if (uploadPriority > prevPriority) {
        // Higher-quality source: replace existing entry entirely
        monthMap!.set(code, { code, name, present, absent, workingDays });
        seenPriority.set(seenKey, uploadPriority);
      } else if (uploadPriority === prevPriority) {
        // Same quality source but newer upload — replace (not add) to avoid double-count
        monthMap!.set(code, { code, name, present, absent, workingDays });
      }
      // Lower priority: skip — better data already present
    };

    if (data.source_type === "absent_list") {
      const absentData = data as AbsentListParsedData;
      for (const emp of absentData.employees) {
        const code = normalizeCode(emp.code);
        const absent = emp.totalAbsentDays ?? 0;
        const workingDays = DEFAULT_WORKING_DAYS;
        const present = Math.max(0, workingDays - absent);
        processEmployee(code, emp.name || emp.code, present, absent, workingDays);
      }
    } else if (data.source_type === "detailed_report") {
      const detailData = data as DetailedReportParsedData;
      for (const emp of detailData.employees) {
        const code = normalizeCode(emp.code);
        const present = emp.present ?? 0;
        const absent = emp.absent ?? 0;
        const workingDays = present + absent || DEFAULT_WORKING_DAYS;
        processEmployee(code, emp.name || emp.code, present, absent, workingDays);
      }
    } else {
      const employees = data.employees as Array<{ name: string; present?: number; absent?: number; code?: string }>;
      for (const emp of employees) {
        const code = normalizeCode(emp.code ?? emp.name ?? "");
        const present = emp.present ?? 0;
        const absent = emp.absent ?? 0;
        const workingDays = present + absent || DEFAULT_WORKING_DAYS;
        processEmployee(code, emp.code ?? emp.name ?? "", present, absent, workingDays);
      }
    }
  }

  return byMonth;
}

/**
 * Build payroll table rows for a given month: attendance + salary + loss of pay + net pay.
 */
export function getAdvanceDeductionForMonth(
  advances: EmployeeAdvance[],
  employeeCode: string,
  monthYear: string
): number {
  const code = normalizeCode(employeeCode);
  const [y, m] = monthYear.split("-").map(Number);
  if (!y || !m) return 0;
  const periodStart = new Date(y, m - 1, 1);

  const outstanding = advances
    .filter((a) => {
      if (normalizeCode(a.employee_code) !== code) return false;
      const granted = new Date(a.granted_on + "T00:00:00");
      const remaining = a.amount - a.amount_paid;
      return remaining > 0 && granted < periodStart;
    })
    .reduce((sum, a) => sum + Math.max(0, a.amount - a.amount_paid), 0);

  return Math.min(outstanding, ADVANCE_MONTHLY_DEDUCTION);
}

export function getPayrollRowsForMonth(
  byMonth: Map<string, Map<string, AttendanceMonthSummary>>,
  payrollEmployees: PayrollEmployee[],
  monthYear: string,
  advances: EmployeeAdvance[] = []
): PayrollRow[] {
  const monthMap = byMonth.get(monthYear);
  if (!monthMap || monthMap.size === 0) return [];

  const empByCode = new Map<string, PayrollEmployee>();
  for (const e of payrollEmployees) {
    empByCode.set(normalizeCode(e.employee_code), e);
  }

  const standardWD = getStandardWorkingDaysForMonth(monthYear);
  const rows: PayrollRow[] = [];
  for (const [, summary] of monthMap) {
    const code = normalizeCode(summary.code);
    const emp = empByCode.get(code);

    // Skip weekly employees — they belong in the weekly payroll table only
    if (emp?.salary_type === "weekly") continue;

    const salary = Number(emp?.monthly_salary) || 0;
    const rawSalaryType = emp?.salary_type;
    const salaryType: SalaryType = (rawSalaryType === "monthly_8th" || rawSalaryType === "monthly_1st")
      ? rawSalaryType
      : "monthly_8th";

    // Cap absent to standardWD to prevent impossible values from bad/duplicate PDF data
    const absentRaw = Math.min(Math.max(0, summary.absent), standardWD);
    // Present = working days minus absent (capped), regardless of what PDF says
    const presentCapped = Math.max(0, standardWD - absentRaw);
    // Apply 1 free holiday per month — deduct from absent count before computing LOP
    const absentAfterHoliday = Math.max(0, absentRaw - FREE_HOLIDAYS_PER_MONTH);
    const absentForLop = Math.min(absentAfterHoliday, standardWD);
    const lossOfPay =
      standardWD > 0 && absentForLop > 0
        ? Math.round((Number(salary) * absentForLop) / standardWD)
        : 0;
    const advanceDeduction = getAdvanceDeductionForMonth(advances, summary.code, monthYear);
    const netPay = Math.max(0, salary - lossOfPay - advanceDeduction);
    const payDate = getPayDate(salaryType, monthYear);

    rows.push({
      code: summary.code,
      name: summary.name,
      monthYear,
      present: presentCapped,
      absent: absentRaw,
      workingDays: standardWD,
      monthlySalary: salary,
      lossOfPay,
      advanceDeduction,
      netPay,
      salaryType,
      payDate,
    });
  }

  return rows.sort((a, b) => {
    if (a.payDate !== b.payDate) return a.payDate.localeCompare(b.payDate);
    return a.name.localeCompare(b.name);
  });
}

/** Per-employee, per-week attendance summary (same shape as month for reuse) */
export type AttendanceWeekSummary = AttendanceMonthSummary;

/**
 * Aggregate attendance by week (week ending = Sunday). Uses daily data from detailed_report;
 * for absent_list, distributes absent dates into weeks.
 */
export function aggregateAttendanceByWeek(uploads: AttendanceUpload[]): Map<string, Map<string, AttendanceWeekSummary>> {
  const byWeek = new Map<string, Map<string, AttendanceWeekSummary>>();
  // Track source priority per (weekKey, employeeCode) to avoid double-counting
  const seenPriority = new Map<string, number>(); // key = `${weekKey}::${code}`

  // Sort oldest → newest so newer uploads of same type override older ones
  const sorted = [...uploads].sort((a, b) =>
    (a.created_at || "").localeCompare(b.created_at || "")
  );

  for (const u of sorted) {
    const data = u.parsed_data as AttendanceParsedData;
    if (!data?.employees?.length) continue;

    const uploadPriority = sourcePriority(data.source_type);

    if (data.source_type === "detailed_report") {
      const detailData = data as DetailedReportParsedData;
      for (const emp of detailData.employees) {
        const days = emp.days ?? [];
        const code = normalizeCode(emp.code);

        // Group days by week first
        const weekDays = new Map<string, { present: number; absent: number; workingDays: number }>();
        for (const d of days) {
          const dateStr = d.date;
          if (!dateStr) continue;
          const weekKey = getWeekEnding(dateStr);
          const isPresent = /present/i.test(d.status);
          const isAbsent = /absent/i.test(d.status);
          const entry = weekDays.get(weekKey) ?? { present: 0, absent: 0, workingDays: 0 };
          if (isPresent) entry.present += 1;
          if (isAbsent) entry.absent += 1;
          if (isPresent || isAbsent) entry.workingDays += 1;
          weekDays.set(weekKey, entry);
        }

        for (const [weekKey, stats] of weekDays) {
          const seenKey = `${weekKey}::${code}`;
          const prevPriority = seenPriority.get(seenKey) ?? -1;
          if (uploadPriority < prevPriority) continue; // worse source, skip

          let weekMap = byWeek.get(weekKey);
          if (!weekMap) { weekMap = new Map(); byWeek.set(weekKey, weekMap); }

          // Replace (not add) to avoid double-counting
          weekMap.set(code, { code: emp.code, name: emp.name || emp.code, ...stats });
          seenPriority.set(seenKey, uploadPriority);
        }
      }
    } else if (data.source_type === "absent_list") {
      const absentData = data as AbsentListParsedData;
      const monthYear = data.month_year;
      if (!monthYear) continue;

      for (const emp of absentData.employees) {
        const code = normalizeCode(emp.code);
        const absentDates = emp.absentDates ?? [];
        const weekAbsent = new Map<string, number>();
        for (const dayMonth of absentDates) {
          const fullDate = parseAbsentDate(dayMonth.trim(), monthYear);
          if (!fullDate) continue;
          const weekKey = getWeekEnding(fullDate);
          weekAbsent.set(weekKey, (weekAbsent.get(weekKey) ?? 0) + 1);
        }

        for (const [weekKey, absent] of weekAbsent) {
          const seenKey = `${weekKey}::${code}`;
          const prevPriority = seenPriority.get(seenKey) ?? -1;
          if (uploadPriority < prevPriority) continue; // better source already present, skip

          let weekMap = byWeek.get(weekKey);
          if (!weekMap) { weekMap = new Map(); byWeek.set(weekKey, weekMap); }

          const workingDays = DEFAULT_WORKING_DAYS_PER_WEEK;
          const present = Math.max(0, workingDays - absent);
          weekMap.set(code, { code: emp.code, name: emp.name || emp.code, present, absent, workingDays });
          seenPriority.set(seenKey, uploadPriority);
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

  const empByCode = new Map<string, PayrollEmployee>();
  for (const e of payrollEmployees) {
    empByCode.set(normalizeCode(e.employee_code), e);
  }

  const standardWD = getStandardWorkingDaysForWeekEnding(weekEnding);
  const payDate = getPayDate("weekly", weekEnding);
  const rows: PayrollRowWeek[] = [];

  for (const [, summary] of weekMap) {
    const code = normalizeCode(summary.code);
    const emp = empByCode.get(code);

    // Only include weekly employees in the weekly payroll table
    // If salary_type not set but has weekly_salary, treat as weekly
    const isWeekly = emp?.salary_type === "weekly" ||
      (!emp?.salary_type && (Number(emp?.weekly_salary) > 0));
    if (emp && !isWeekly) continue;

    const weekly = Number(emp?.weekly_salary) || 0;
    const fromMonthly = Number(emp?.monthly_salary) || 0;
    const salary = weekly > 0 ? weekly : (fromMonthly > 0 ? Math.round(fromMonthly / 4.33) : 0);

    const absentRaw = Math.min(Math.max(0, summary.absent), standardWD);
    const presentCappedW = Math.max(0, standardWD - absentRaw);
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
      present: presentCappedW,
      absent: absentRaw,
      workingDays: standardWD,
      weeklySalary: salary,
      lossOfPay,
      netPay,
      salaryType: "weekly",
      payDate,
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
      salary_type?: SalaryType;
    }) => {
      const row = {
        employee_code: (payload.employee_code || "").trim(),
        display_name: (payload.display_name || "").trim(),
        monthly_salary: Number(payload.monthly_salary) || 0,
        weekly_salary: Number(payload.weekly_salary ?? 0) || 0,
        salary_type: payload.salary_type ?? "monthly_8th",
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

export function useEmployeeAdvances() {
  return useQuery({
    queryKey: ["employee_advances"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("employee_advances")
          .select("*")
          .order("granted_on", { ascending: false });
        if (error) {
          if (error.code === "42P01" || error.message?.includes("does not exist") || error.message?.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as EmployeeAdvance[];
      } catch {
        return [];
      }
    },
    retry: false,
  });
}

export function useGrantAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { employee_code: string; amount: number; granted_on: string }) => {
      const { data, error } = await supabase
        .from("employee_advances")
        .insert({
          employee_code: (payload.employee_code || "").trim().toUpperCase(),
          amount: Number(payload.amount),
          granted_on: payload.granted_on,
          amount_paid: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_advances"] });
      toast.success("Advance granted.");
    },
    onError: (e: unknown) => {
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "Failed to grant advance";
      toast.error(msg);
    },
  });
}

export function useMarkAdvancePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; amount_paid: number }) => {
      const { data, error } = await supabase
        .from("employee_advances")
        .update({ amount_paid: payload.amount_paid, updated_at: new Date().toISOString() })
        .eq("id", payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_advances"] });
      toast.success("Advance updated.");
    },
    onError: (e: unknown) => {
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "Failed to update advance";
      toast.error(msg);
    },
  });
}

export { ADVANCE_MONTHLY_DEDUCTION };

export function useBulkUpsertPayrollEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ParsedEmployeeRow[]) => {
      if (rows.length === 0) return [];
      const payload = rows.map((r) => ({
        employee_code: (r.employee_code || "").trim(),
        display_name: (r.display_name || "").trim(),
        monthly_salary: Number(r.monthly_salary) || 0,
        weekly_salary: Number(r.weekly_salary) || 0,
        salary_type: "monthly_8th",
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
