import { useMemo } from "react";
import {
  startOfWeek, endOfWeek, eachWeekOfInterval,
  format, parseISO, startOfMonth, endOfMonth, addDays
} from "date-fns";
import type { AttendanceUpload } from "./useAttendance";
import type { DetailedReportParsedData } from "./useAttendance";

// 54 hrs/week = 9 hrs/day × 6 days (includes 1hr lunch each day)
export const TARGET_WEEKLY_MINUTES = 54 * 60;
export const TARGET_DAILY_MINUTES  = 9 * 60;
export const LATE_THRESHOLD_MIN    = 5;
export const SHORT_DAY_THRESHOLD   = 8 * 60;
export const EARLY_LEAVING_MIN     = 30;

export type DayDetail = {
  date: string;
  status: string;
  workMinutes: number;
  lateByMinutes: number;
  earlyGoingMinutes: number;
  isLate: boolean;
  isEarlyLeaving: boolean;
  isShortDay: boolean;
  isWeeklyOff: boolean;
  isAbsent: boolean;
  label: string;
};

export type WeeklyHourRow = {
  code: string;
  name: string;
  department: string;
  weekStart: string;
  weekEnd: string;
  workedMinutes: number;
  targetMinutes: number;
  delta: number;
  daysWorked: number;
  lateCount: number;
  shortDayCount: number;
  days: DayDetail[];
  tier: "green" | "amber" | "orange" | "red";
};

export type WeeklySummary = {
  weekStart: string;
  weekEnd: string;
  label: string;
  rows: WeeklyHourRow[];
  totalWorkedMinutes: number;
  totalShortfallMinutes: number;
  totalLateCount: number;
  atRiskCount: number;
};

export function fmtHHMM(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, "0")}m`;
}

export function fmtHMshort(minutes: number): string {
  if (minutes === 0) return "";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function tierFromMinutes(worked: number): WeeklyHourRow["tier"] {
  if (worked >= TARGET_WEEKLY_MINUTES) return "green";
  if (worked >= 48 * 60) return "amber";
  if (worked >= 40 * 60) return "orange";
  return "red";
}

export const TIER_STYLES: Record<string, string> = {
  green:  "bg-green-50 border-green-200 text-green-800",
  amber:  "bg-amber-50 border-amber-200 text-amber-700",
  orange: "bg-orange-100 border-orange-300 text-orange-700",
  red:    "bg-red-100 border-red-300 text-red-800",
};

export const TIER_BADGE: Record<string, string> = {
  green:  "bg-green-100 text-green-800",
  amber:  "bg-amber-100 text-amber-700",
  orange: "bg-orange-200 text-orange-800",
  red:    "bg-red-200 text-red-800",
};

export const TIER_LABEL: Record<string, string> = {
  green:  "✓ On Track",
  amber:  "⚠ Slightly Short",
  orange: "⚠ Short",
  red:    "✗ Critical",
};

export function useWeeklyHours(uploads: AttendanceUpload[], monthYear: string): WeeklySummary[] {
  return useMemo(() => {
    if (!monthYear) return [];
    const detailedUploads = uploads.filter(
      u => u.month_year === monthYear && u.parsed_data?.source_type === "detailed_report"
    );
    if (detailedUploads.length === 0) return [];

    const empMap = new Map<string, {
      code: string; name: string; department: string;
      days: Map<string, { workMinutes: number; lateByMinutes: number; earlyGoingMinutes: number; status: string }>;
    }>();

    for (const u of detailedUploads) {
      const data = u.parsed_data as DetailedReportParsedData;
      for (const emp of data.employees) {
        const key = `${emp.code}||${emp.name}`;
        if (!empMap.has(key)) {
          empMap.set(key, { code: emp.code, name: emp.name, department: emp.department, days: new Map() });
        }
        const entry = empMap.get(key)!;
        for (const d of (emp.days ?? [])) {
          const dd = d as typeof d & { workMinutes?: number; lateByMinutes?: number; earlyGoingMinutes?: number };
          entry.days.set(d.date, {
            workMinutes: dd.workMinutes ?? 0,
            lateByMinutes: dd.lateByMinutes ?? 0,
            earlyGoingMinutes: dd.earlyGoingMinutes ?? 0,
            status: d.status,
          });
        }
      }
    }

    const monthStart = startOfMonth(parseISO(monthYear + "-01"));
    const monthEnd = endOfMonth(monthStart);
    const weekStarts = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });

    return weekStarts.map(ws => {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const label = `${format(ws, "dd MMM")} – ${format(we, "dd MMM yyyy")}`;

      const rows: WeeklyHourRow[] = [];
      for (const [, emp] of empMap) {
        const days: DayDetail[] = [];
        let workedMinutes = 0;
        let lateCount = 0;
        let shortDayCount = 0;
        let daysWorked = 0;

        let cursor = new Date(ws);
        while (cursor <= we) {
          const dateStr = format(cursor, "yyyy-MM-dd");
          const raw = emp.days.get(dateStr);
          const status = raw?.status ?? "";
          const isWeeklyOff = /weeklyoff/i.test(status) && !/present/i.test(status);
          const isAbsent = /absent/i.test(status) && !/present/i.test(status);
          const wm = raw?.workMinutes ?? 0;
          const late = raw?.lateByMinutes ?? 0;
          const early = raw?.earlyGoingMinutes ?? 0;
          const isLate = late > LATE_THRESHOLD_MIN;
          const isEarlyLeaving = early > EARLY_LEAVING_MIN;
          const isShortDay = !isWeeklyOff && !isAbsent && wm > 0 && wm < SHORT_DAY_THRESHOLD;

          if (!isWeeklyOff && !isAbsent && wm > 0) daysWorked++;
          if (isLate) lateCount++;
          if (isShortDay) shortDayCount++;
          workedMinutes += wm;

          let cellLabel = "";
          if (isWeeklyOff) cellLabel = "OFF";
          else if (isAbsent) cellLabel = "—";
          else if (wm > 0) cellLabel = fmtHMshort(wm);

          days.push({ date: dateStr, status, workMinutes: wm, lateByMinutes: late, earlyGoingMinutes: early, isLate, isEarlyLeaving, isShortDay, isWeeklyOff, isAbsent, label: cellLabel });
          cursor = addDays(cursor, 1);
        }

        rows.push({
          code: emp.code, name: emp.name, department: emp.department,
          weekStart: format(ws, "yyyy-MM-dd"),
          weekEnd: format(we, "yyyy-MM-dd"),
          workedMinutes, targetMinutes: TARGET_WEEKLY_MINUTES,
          delta: workedMinutes - TARGET_WEEKLY_MINUTES,
          daysWorked, lateCount, shortDayCount, days,
          tier: tierFromMinutes(workedMinutes),
        });
      }

      rows.sort((a, b) => {
        const tierOrder = { red: 0, orange: 1, amber: 2, green: 3 };
        if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
        return a.department.localeCompare(b.department) || a.name.localeCompare(b.name);
      });

      return {
        weekStart: format(ws, "yyyy-MM-dd"),
        weekEnd: format(we, "yyyy-MM-dd"),
        label,
        rows,
        totalWorkedMinutes: rows.reduce((s, r) => s + r.workedMinutes, 0),
        totalShortfallMinutes: rows.filter(r => r.delta < 0).reduce((s, r) => s + Math.abs(r.delta), 0),
        totalLateCount: rows.reduce((s, r) => s + r.lateCount, 0),
        atRiskCount: rows.filter(r => r.tier === "orange" || r.tier === "red").length,
      };
    });
  }, [uploads, monthYear]);
}
