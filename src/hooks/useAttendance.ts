import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AttendanceDay = { date: string; status: string };
export type AttendanceEmployee = {
  name: string;
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  other: number;
  days: AttendanceDay[];
};

/** Absent list PDF: E. Code, Name, No of Absent, then list of dates */
export type AbsentListEmployee = {
  code: string;
  name: string;
  totalAbsentDays: number;
  halfDay?: boolean;
  absentDates: string[];
};
export type AbsentListParsedData = {
  month_year: string;
  source_type: "absent_list";
  employees: AbsentListEmployee[];
};

/** ESSL detailed report: Attendance Date, Department, rows with E. Code, Name, Status */
export type DetailedReportEmployee = {
  code: string;
  name: string;
  department: string;
  present: number;
  absent: number;
  weeklyOff: number;
  days?: { date: string; status: string }[];
};
export type DetailedReportParsedData = {
  month_year: string;
  source_type: "detailed_report";
  date_range?: string;
  employees: DetailedReportEmployee[];
};

export type AttendanceParsedData =
  | AbsentListParsedData
  | DetailedReportParsedData
  | {
      month_year: string;
      employees: AttendanceEmployee[];
      totalDays?: number;
    };

export type AttendanceUpload = {
  id: string;
  month_year: string;
  file_name: string;
  uploaded_at: string;
  parsed_data: AttendanceParsedData;
  created_at: string;
};

/** Employee code: SP001, SS002, etc. */
const EMPLOYEE_CODE = /^(SP|SS|ADMIN)\d{2,4}\s*/i;
/** "6 Days", "2 1/2 DAYS", "2 DAYS" */
const DAYS_PATTERN = /(\d+)\s*(?:1\/2)?\s*days?/i;

const DATE_PART = /\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi;

function parseAbsentListFromText(text: string, monthYear: string): AbsentListParsedData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const employees: AbsentListEmployee[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const codeMatch = line.match(EMPLOYEE_CODE);
    if (!codeMatch) {
      i++;
      continue;
    }
    const code = codeMatch[0].trim();
    const rest = line.slice(codeMatch[0].length).trim();
    const daysMatch = rest.match(DAYS_PATTERN);
    const totalAbsentDays = daysMatch ? parseInt(daysMatch[1], 10) : 0;
    const halfDay = /\d+\s*1\/2\s*days?/i.test(rest);
    const datesOnLine = rest.match(DATE_PART) ?? [];
    const namePart = rest.replace(DAYS_PATTERN, "").replace(DATE_PART, "").replace(/\s+/g, " ").trim();
    const name = namePart || code;
    const absentDates: string[] = [...datesOnLine];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (next.match(EMPLOYEE_CODE) || next.match(/^(FEB|JAN|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+MONTH/i)) break;
      const dateMatches = next.match(DATE_PART);
      if (dateMatches) dateMatches.forEach((d) => absentDates.push(d));
      i++;
    }
    if (name || code) employees.push({ code, name, totalAbsentDays, halfDay: halfDay || undefined, absentDates });
  }
  return { month_year: monthYear, source_type: "absent_list", employees };
}

/** ESSL detailed: "Attendance Date : 08-Feb-2026", "Department SP", then "1 SP001 Vasu ... Present|Absent|WeeklyOff" */
function parseDetailedReportFromText(text: string, monthYear: string): DetailedReportParsedData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const attendanceDateRe = /Attendance\s+Date\s*:\s*(\d{2})-(\w{3})-(\d{4})/i;
  const departmentRe = /Department\s+(\w+)/i;
  const empByKey = new Map<string, DetailedReportEmployee>();
  let currentDate = "";
  let currentDept = "";
  for (let i = 0; i < lines.length; i++) {
    const dateM = lines[i].match(attendanceDateRe);
    if (dateM) {
      currentDate = `${dateM[3]}-${monthNum(dateM[2])}-${dateM[1]}`;
      continue;
    }
    const deptM = lines[i].match(departmentRe);
    if (deptM) {
      currentDept = deptM[1];
      continue;
    }
    const codeMatch = lines[i].match(/^\d+\s+((?:SP|SS|ADMIN)\d{2,4})\s+(.+)/i);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    const rest = codeMatch[2];
    const hasStatus = /\b(Present|Absent|WeeklyOff)\b/i.test(lines[i]) || (lines[i + 1] && /\b(Present|Absent|WeeklyOff)\b/i.test(lines[i + 1]));
    if (!hasStatus) continue;
    const name = rest.split(/\s+(?:NS|GS)\s+/)[0]?.trim().replace(/\s+/g, " ").slice(0, 40) ?? rest.slice(0, 40);
    let status = "Other";
    const fullLine = lines[i] + " " + (lines[i + 1] ?? "");
    if (/\bPresent\s*\(No\s+OutPunch\)/i.test(fullLine)) status = "Present (No OutPunch)";
    else if (/\bPresent\b/i.test(fullLine)) status = "Present";
    else if (/\bAbsent\s*\(No\s+OutPunch\)/i.test(fullLine)) status = "Absent (No OutPunch)";
    else if (/\bAbsent\b/i.test(fullLine)) status = "Absent";
    else if (/\bWeeklyOff\b/i.test(fullLine)) status = "WeeklyOff";
    const key = `${code}-${name}`;
    if (!empByKey.has(key)) {
      empByKey.set(key, { code, name, department: currentDept, present: 0, absent: 0, weeklyOff: 0, days: [] });
    }
    const emp = empByKey.get(key)!;
    if (currentDate) {
      emp.days = emp.days ?? [];
      emp.days.push({ date: currentDate, status });
    }
    if (status === "Present" || status.startsWith("Present")) emp.present++;
    else if (status === "Absent" || status.startsWith("Absent")) emp.absent++;
    else if (status === "WeeklyOff") emp.weeklyOff++;
  }
  const employees = Array.from(empByKey.values());
  return { month_year: monthYear, source_type: "detailed_report", employees, date_range: undefined };
}

function monthNum(m: string): string {
  const months: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  return months[m.slice(0, 3)] ?? "01";
}

function inferMonthYearFromText(text: string): string | null {
  const m = text.match(/(\d{2})-(\w{3})-(\d{4})/);
  if (m) return `${m[3]}-${monthNum(m[2])}`;
  const mon = text.match(/(?:FEB|JAN|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+MONTH/i);
  if (mon) {
    const y = new Date().getFullYear();
    const mm = mon[0].slice(0, 3).toLowerCase();
    const map: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
    return `${y}-${map[mm] ?? "01"}`;
  }
  return null;
}

function parseAttendanceFromText(text: string, monthYear: string): AttendanceParsedData {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const employees: AttendanceEmployee[] = [];
  const statusLike = /^(P|A|L|H|W|WO|PH|OD|M|\d{1,2}|-|\.|x|X|X)$/i;

  for (const line of lines) {
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) continue;
    const statusTokens: string[] = [];
    const nameParts: string[] = [];
    let pastName = false;
    for (const t of tokens) {
      if (statusLike.test(t) && (statusTokens.length > 0 || nameParts.length > 0)) {
        pastName = true;
        statusTokens.push(t.replace(/^(\d{1,2})$/, (_, d) => String(d).padStart(2, "0")));
      } else if (!pastName) {
        nameParts.push(t);
      }
    }
    if (nameParts.length === 0 || statusTokens.length < 5) continue;
    const name = nameParts.join(" ").replace(/\s+/g, " ").trim();
    if (name.length < 2) continue;
    const days: AttendanceDay[] = statusTokens.slice(0, 31).map((status, i) => ({
      date: `${monthYear}-${String(i + 1).padStart(2, "0")}`,
      status: /^\d{2}$/.test(status) ? "?" : status,
    }));
    let present = 0, absent = 0, leave = 0, halfDay = 0, other = 0;
    days.forEach((d) => {
      const s = d.status.toUpperCase();
      if (s === "P") present++;
      else if (s === "A") absent++;
      else if (s === "L") leave++;
      else if (s === "H") halfDay++;
      else other++;
    });
    employees.push({ name, present, absent, leave, halfDay, other, days });
  }

  return { month_year: monthYear, employees, totalDays: 31 };
}

/** Auto-detect PDF format and parse. Prefer detailed report, then absent list, then generic. */
export function parseAttendancePdfText(text: string, monthYearOverride?: string): AttendanceParsedData {
  const monthYear = monthYearOverride ?? inferMonthYearFromText(text) ?? "";
  const isDetailed = /Attendance\s+Date\s*:/i.test(text) && /Department\s+\w+/i.test(text) && /\b(Present|Absent|WeeklyOff)\b/i.test(text);
  const isAbsentList = (/No\s+of\s+Absent|Absent\s+List/i.test(text) || /E\.?\s*Code\s+Name/i.test(text)) && (EMPLOYEE_CODE.test(text) || /\d+\s*Days?\s+\d{1,2}-(?:Jan|Feb|Mar)/i.test(text));
  if (isDetailed && monthYear) return parseDetailedReportFromText(text, monthYear);
  if (isAbsentList && monthYear) return parseAbsentListFromText(text, monthYear);
  if (monthYear) return parseAttendanceFromText(text, monthYear);
  return parseAttendanceFromText(text, monthYearOverride || new Date().toISOString().slice(0, 7));
}

export function useAttendanceUploads() {
  return useQuery({
    queryKey: ["attendance_uploads"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("attendance_uploads")
          .select("*")
          .order("uploaded_at", { ascending: false });
        if (error) {
          const msg = error.message ?? "";
          if (
            error.code === "42P01" ||
            msg.includes("does not exist") ||
            msg.includes("schema cache") ||
            msg.toLowerCase().includes("relation")
          )
            return [];
          throw error;
        }
        return (data ?? []).map((row) => ({
          ...row,
          parsed_data: row.parsed_data as AttendanceParsedData,
        })) as AttendanceUpload[];
      } catch {
        return [];
      }
    },
    retry: false,
  });
}

export function useSaveAttendanceUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      month_year: string;
      file_name: string;
      parsed_data: AttendanceParsedData;
    }) => {
      const { data, error } = await supabase
        .from("attendance_uploads")
        .insert({
          month_year: payload.month_year,
          file_name: payload.file_name,
          uploaded_at: new Date().toISOString(),
          parsed_data: payload.parsed_data as any,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance_uploads"] });
      toast.success("Attendance uploaded and parsed.");
    },
    onError: () => { /* Error shown by caller (e.g. Attendance page catch) */ },
  });
}

export function useDeleteAttendanceUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_uploads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance_uploads"] });
      toast.success("Attendance record removed.");
    },
    onError: (e: unknown) => {
      const msg = e != null && typeof e === "object" && "message" in e ? String((e as { message?: unknown }).message) : "Upload failed";
      toast.error(msg.includes("schema cache") || msg.includes("does not exist") ? "Database tables missing. Run Supabase migrations (see README)." : msg);
    },
  });
}

export { parseAttendanceFromText };
