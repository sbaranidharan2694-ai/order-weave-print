import { useState, useMemo, useEffect, useRef } from "react";
import {
  Upload,
  Calendar,
  Users,
  FileText,
  ChevronRight,
  Trash2,
  Loader2,
  DollarSign,
  Calculator,
  UserPlus,
  Edit2,
  FileUp,
  Clock,
  Printer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAttendanceUploads, useSaveAttendanceUpload, useDeleteAttendanceUpload, useRemoveEmployeeEverywhere, parseAttendancePdfText } from "@/hooks/useAttendance";
import {
  usePayrollEmployees,
  useUpsertPayrollEmployee,
  useDeletePayrollEmployee,
  useBulkUpsertPayrollEmployees,
  parseEmployeesFromPdfText,
  aggregateAttendanceByMonth,
  getPayrollRowsForMonth,
  aggregateAttendanceByWeek,
  getPayrollRowsForWeek,
  getStandardWorkingDaysForMonth,
  getStandardWorkingDaysForWeekEnding,
  getSalaryPeriodLabel,
  SALARY_TYPE_LABELS,
  type PayrollEmployee,
  type SalaryType,
} from "@/hooks/usePayroll";
import { useStorageMode } from "@/hooks/useStorageMode";
import { SharedDataBanner } from "@/components/SharedDataBanner";
import { extractTextFromPdf } from "@/lib/pdfText";
import { toast } from "sonner";
import { cn, friendlyDbError } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { useWeeklyHours, fmtHHMM, TARGET_WEEKLY_MINUTES, TIER_STYLES, TIER_BADGE } from "@/hooks/useWeeklyHours";
import { WeeklyHoursReport } from "@/components/WeeklyHoursReport";


export default function Attendance() {
  const storageMode = useStorageMode();
  const { data: uploads = [], isLoading } = useAttendanceUploads();
  const saveUpload = useSaveAttendanceUpload();
  const deleteUpload = useDeleteAttendanceUpload();
  const { data: payrollEmployees = [], isLoading: payrollLoading } = usePayrollEmployees();
  const upsertPayroll = useUpsertPayrollEmployee();
  const deletePayrollEmployee = useDeletePayrollEmployee();
  const removeEmployeeEverywhere = useRemoveEmployeeEverywhere();
  const bulkUpsertPayroll = useBulkUpsertPayrollEmployees();
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteEmployeeId, setDeleteEmployeeId] = useState<string | null>(null);
  const [importPdfPreview, setImportPdfPreview] = useState<{ name: string; rows: { employee_code: string; display_name: string; monthly_salary: number; weekly_salary: number }[] } | null>(null);
  const [importingPdf, setImportingPdf] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payrollPeriod, setPayrollPeriod] = useState<"monthly" | "weekly">("monthly");
  const [payrollMonth, setPayrollMonth] = useState<string>("");
  const [payrollWeek, setPayrollWeek] = useState<string>("");
  const [employeeDialog, setEmployeeDialog] = useState<{ open: boolean; edit?: PayrollEmployee }>({ open: false });
  const [empCode, setEmpCode] = useState("");
  const [empName, setEmpName] = useState("");
  const [empSalary, setEmpSalary] = useState("");
  const [empWeeklySalary, setEmpWeeklySalary] = useState("");
  const [empSalaryType, setEmpSalaryType] = useState<SalaryType>("monthly_8th");

  const byMonth = useMemo(() => aggregateAttendanceByMonth(uploads), [uploads]);
  const byWeek = useMemo(() => aggregateAttendanceByWeek(uploads), [uploads]);
  const availableMonths = useMemo(() => Array.from(byMonth.keys()).sort().reverse(), [byMonth]);
  const availableWeeks = useMemo(() => Array.from(byWeek.keys()).sort().reverse(), [byWeek]);
  const selectedMonth = payrollMonth || availableMonths[0] || "";
  const selectedWeek = payrollWeek || availableWeeks[0] || "";

  // Weekly hours tracker state
  const [hoursMonth, setHoursMonth] = useState("");
  const selectedHoursMonth = hoursMonth || availableMonths[0] || "";
  const weeklySummaries = useWeeklyHours(uploads, selectedHoursMonth);

  const payrollRows = useMemo(
    () => getPayrollRowsForMonth(byMonth, payrollEmployees, selectedMonth),
    [byMonth, payrollEmployees, selectedMonth]
  );
  const payrollRowsWeekly = useMemo(
    () => getPayrollRowsForWeek(byWeek, payrollEmployees, selectedWeek),
    [byWeek, payrollEmployees, selectedWeek]
  );

  const totalNetPay = useMemo(() => payrollRows.reduce((s, r) => s + r.netPay, 0), [payrollRows]);
  const totalLossOfPay = useMemo(() => payrollRows.reduce((s, r) => s + r.lossOfPay, 0), [payrollRows]);
  const totalNetPayWeekly = useMemo(() => payrollRowsWeekly.reduce((s, r) => s + r.netPay, 0), [payrollRowsWeekly]);
  const totalLossOfPayWeekly = useMemo(() => payrollRowsWeekly.reduce((s, r) => s + r.lossOfPay, 0), [payrollRowsWeekly]);

  const payrollEmpByCode = useMemo(() => {
    const m = new Map<string, PayrollEmployee>();
    for (const e of payrollEmployees) {
      m.set((e.employee_code || "").trim().toUpperCase(), e);
    }
    return m;
  }, [payrollEmployees]);

  const [deleteEmployeeName, setDeleteEmployeeName] = useState<string>("");
  const [deleteEmployeeCode, setDeleteEmployeeCode] = useState<string>("");
  const [uploadReminderOpen, setUploadReminderOpen] = useState(false);
  const [uploadReminderReason, setUploadReminderReason] = useState<"saturday" | "month_end">("saturday");
  const reminderShownRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (reminderShownRef.current) return;
    const today = new Date();
    const day = today.getDate();
    const weekday = today.getDay(); // 0=Sun,6=Sat
    if (weekday === 6) {
      setUploadReminderReason("saturday");
      setUploadReminderOpen(true);
      reminderShownRef.current = true;
    } else if (day === 31) {
      setUploadReminderReason("month_end");
      setUploadReminderOpen(true);
      reminderShownRef.current = true;
    }
  }, []);

  const standardDaysMonth = selectedMonth ? getStandardWorkingDaysForMonth(selectedMonth) : 0;
  const standardDaysWeek = selectedWeek ? getStandardWorkingDaysForWeekEnding(selectedWeek) : 0;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please select a PDF file");
      return;
    }
    setUploading(true);
    try {
      const text = await extractTextFromPdf(file);
      if (!text || text.trim().length < 50) {
        toast.error("Could not extract text from PDF. Try a digital (non-scanned) PDF.");
        return;
      }
      const parsed = parseAttendancePdfText(text, undefined);
      const empCount = "employees" in parsed ? parsed.employees.length : 0;
      if (empCount === 0) {
        toast.error("No employee rows detected. Supported: Absent List (E. Code, Name, No of Absent, dates) or ESSL Daily Detailed Report.");
        return;
      }
      const resolvedMonth = parsed.month_year || new Date().toISOString().slice(0, 7);

      // Check for duplicate uploads of the same month + source type
      const newSourceType = (parsed as any).source_type ?? "unknown";
      const existingDupe = uploads.find(
        (u) =>
          u.month_year === resolvedMonth &&
          (u.parsed_data as any)?.source_type === newSourceType
      );
      if (existingDupe) {
        // Delete old upload before inserting new one to avoid duplication
        await deleteUpload.mutateAsync(existingDupe.id);
        toast.info(`Replaced previous ${newSourceType === "detailed_report" ? "detailed report" : "absent list"} for ${resolvedMonth}.`);
      }

      await saveUpload.mutateAsync({
        month_year: resolvedMonth,
        file_name: file.name,
        parsed_data: parsed,
      });
      setExpandedId(null);
    } catch (err) {
      const msg =
        err != null && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : err != null
            ? String(err)
            : "Upload failed";
      toast.error(friendlyDbError(msg || undefined));
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={uploadReminderOpen} onOpenChange={setUploadReminderOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <FileUp className="h-5 w-5 text-orange-500" />
              {uploadReminderReason === "saturday"
                ? "📋 Saturday Attendance Upload Reminder"
                : "📋 Month-End Attendance Upload Reminder"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground space-y-2">
              <span className="block">
                {uploadReminderReason === "saturday"
                  ? "It's Saturday! Please upload the weekly attendance PDF from your external attendance system (ESSL / biometric device)."
                  : "It's the 31st! Please upload the monthly attendance PDF from your external attendance system before closing the month."}
              </span>
              <span className="block font-medium text-foreground">
                Steps:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Export the attendance PDF from your ESSL / biometric system</li>
                <li>Click <strong>"Upload Now"</strong> below to select and upload it</li>
                <li>Verify the employee rows are detected correctly</li>
              </ol>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="flex-1">Remind Me Later</AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-orange-500 hover:bg-orange-600 gap-2"
              onClick={() => {
                setUploadReminderOpen(false);
                setTimeout(() => {
                  uploadInputRef.current?.click();
                }, 200);
              }}
            >
              <Upload className="h-4 w-4" /> Upload Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SharedDataBanner useLocalStorage={storageMode.attendance === "local"} feature="Attendance" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Attendance & Payroll</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload attendance PDFs, then use Payroll to compute salary and loss of pay</p>
        </div>
      </div>

      <Tabs defaultValue="upload" className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-3 bg-white border border-[#E5E7EB] rounded-lg p-1">
          <TabsTrigger value="upload" className="gap-1.5 data-[state=active]:bg-[#1E293B] data-[state=active]:text-white rounded-md text-xs sm:text-sm">
            <Upload className="h-4 w-4" />
            Upload & History
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5 data-[state=active]:bg-[#1E293B] data-[state=active]:text-white rounded-md text-xs sm:text-sm">
            <Calculator className="h-4 w-4" />
            Payroll
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-1.5 data-[state=active]:bg-[#1E293B] data-[state=active]:text-white rounded-md text-xs sm:text-sm">
            <Clock className="h-4 w-4" />
            Weekly Hours
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6 mt-0">
      <Card className="rounded-xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-8">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Upload monthly attendance PDF
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            Upload <strong>Absent List</strong> (E. Code, Name, No of Absent, dates) or <strong>ESSL Daily Detailed Report</strong>. Month is inferred from the PDF.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-center gap-4 p-0">
          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept=".pdf"
              className="hidden"
              id="att-pdf"
              ref={uploadInputRef}
              onChange={handleFile}
              disabled={uploading}
            />
            <Button
              onClick={() => document.getElementById("att-pdf")?.click()}
              disabled={uploading}
              className="rounded-xl gap-2 bg-[#F97316] hover:bg-[#ea580c] text-white"
              style={{ backgroundColor: "#F97316" }}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {uploading ? "Processing…" : "Choose PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Uploaded months
        </h2>
        {uploads.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground text-sm">No attendance uploaded yet. Upload a PDF above.</p>
              <p className="text-xs text-muted-foreground mt-2">To save data permanently, run the migration in Supabase SQL Editor: <code className="bg-muted px-1 rounded">attendance_uploads</code> table.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {uploads.map((u) => (
              <Card key={u.id} className="rounded-2xl overflow-hidden">
                <Collapsible open={expandedId === u.id} onOpenChange={(o) => setExpandedId(o ? u.id : null)}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", expandedId === u.id && "rotate-90")} />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {format(parseISO(u.month_year + "-01"), "MMMM yyyy")}
                          </p>
                          <p className="text-xs text-[#6B7280] truncate">{u.file_name}</p>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 shrink-0">
                          {u.parsed_data?.employees?.length ?? 0} employees
                        </span>
                        <button
                          type="button"
                          className="text-primary hover:underline text-sm shrink-0"
                          onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === u.id ? null : u.id); }}
                        >
                          View Details ›
                        </button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive shrink-0"
                        title="Delete upload"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(u.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t bg-muted/20">
                      <div className="overflow-x-auto">
                        {u.parsed_data?.source_type === "absent_list" ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-semibold">Code</th>
                                <th className="text-left p-3 font-semibold">Name</th>
                                <th className="text-center p-3 font-semibold text-red-600">Absent days</th>
                                <th className="text-left p-3 font-semibold">Absent dates</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(u.parsed_data as { employees: Array<{ code: string; name: string; totalAbsentDays: number; halfDay?: boolean; absentDates: string[] }> }).employees?.map((emp, i) => (
                                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="p-3 font-mono text-xs">{emp.code}</td>
                                  <td className="p-3 font-medium">{emp.name}</td>
                                  <td className="p-3 text-center text-red-600">{emp.totalAbsentDays}{emp.halfDay ? " (½)" : ""}</td>
                                  <td className="p-3 text-muted-foreground">{emp.absentDates?.join(", ") || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : u.parsed_data?.source_type === "detailed_report" ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-semibold">Code</th>
                                <th className="text-left p-3 font-semibold">Name</th>
                                <th className="text-left p-3 font-semibold">Dept</th>
                                <th className="text-center p-3 font-semibold text-green-600">Present</th>
                                <th className="text-center p-3 font-semibold text-red-600">Absent</th>
                                <th className="text-center p-3 font-semibold text-muted-foreground">Weekly off</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(u.parsed_data as { employees: Array<{ code: string; name: string; department: string; present: number; absent: number; weeklyOff: number }> }).employees?.map((emp, i) => (
                                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="p-3 font-mono text-xs">{emp.code}</td>
                                  <td className="p-3 font-medium">{emp.name}</td>
                                  <td className="p-3">{emp.department}</td>
                                  <td className="p-3 text-center text-green-600">{emp.present}</td>
                                  <td className="p-3 text-center text-red-600">{emp.absent}</td>
                                  <td className="p-3 text-center text-muted-foreground">{emp.weeklyOff}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-left p-3 font-semibold">Employee</th>
                                <th className="text-center p-3 font-semibold text-green-600">P</th>
                                <th className="text-center p-3 font-semibold text-red-600">A</th>
                                <th className="text-center p-3 font-semibold text-amber-600">L</th>
                                <th className="text-center p-3 font-semibold text-blue-600">H</th>
                                <th className="text-center p-3 font-semibold">Other</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(u.parsed_data?.employees as any[])?.map((emp: any, i: number) => (
                                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                                  <td className="p-3 font-medium">{emp.name}</td>
                                  <td className="p-3 text-center text-green-600">{emp.present}</td>
                                  <td className="p-3 text-center text-red-600">{emp.absent}</td>
                                  <td className="p-3 text-center text-amber-600">{emp.leave}</td>
                                  <td className="p-3 text-center text-blue-600">{emp.halfDay}</td>
                                  <td className="p-3 text-center text-muted-foreground">{emp.other}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6 mt-0">
          {/* Employee master: all employees with names and salary info */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Employee master
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                All employees with salary information. Add manually, or import from a PDF that lists employees (e.g. code + name, optional salary).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5"
                  onClick={() => {
                    setEmployeeDialog({ open: true });
                    setEmpCode("");
                    setEmpName("");
                    setEmpSalary("");
                    setEmpWeeklySalary("");
                  }}
                >
                  <UserPlus className="h-4 w-4" />
                  Add employee
                </Button>
                <Input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  id="payroll-import-pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file?.name.toLowerCase().endsWith(".pdf")) return;
                    setImportingPdf(true);
                    try {
                      const text = await extractTextFromPdf(file);
                      if (!text || text.trim().length < 20) {
                        toast.error("Could not extract text from PDF.");
                        return;
                      }
                      const rows = parseEmployeesFromPdfText(text);
                      if (rows.length === 0) {
                        toast.error("No employee rows found. PDF should contain lines with employee code (e.g. SP001, SS002) and name.");
                        return;
                      }
                      setImportPdfPreview({ name: file.name, rows });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to read PDF");
                    } finally {
                      setImportingPdf(false);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5"
                  disabled={importingPdf}
                  onClick={() => document.getElementById("payroll-import-pdf")?.click()}
                >
                  {importingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  {importingPdf ? "Reading…" : "Import from PDF"}
                </Button>
              </div>
              {payrollLoading ? (
                <Skeleton className="h-32 w-full rounded-xl" />
              ) : payrollEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No employees yet. Add manually or import from a PDF.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-semibold">Code</th>
                        <th className="text-left p-3 font-semibold">Name</th>
                        <th className="text-right p-3 font-semibold">Monthly salary (₹)</th>
                        <th className="text-right p-3 font-semibold">Weekly salary (₹)</th>
                        <th className="w-20 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {payrollEmployees.map((emp) => (
                        <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{emp.employee_code}</td>
                          <td className="p-3 font-medium">{emp.display_name}</td>
                          <td className="p-3 text-right">{emp.monthly_salary > 0 ? emp.monthly_salary.toLocaleString("en-IN") : "—"}</td>
                          <td className="p-3 text-right">{emp.weekly_salary ? emp.weekly_salary.toLocaleString("en-IN") : "—"}</td>
                          <td className="p-2 flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEmployeeDialog({ open: true, edit: emp });
                                setEmpCode(emp.employee_code);
                                setEmpName(emp.display_name);
                                setEmpSalary(String(emp.monthly_salary));
                                setEmpWeeklySalary(emp.weekly_salary != null ? String(emp.weekly_salary) : "");
                              }}
                            >
                              <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteEmployeeId(emp.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Payroll by period
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Analyzes uploaded attendance. <strong className="text-foreground">Working days</strong> are the same for everyone: Mon–Sat in that period (Sunday off). LOP = (absent ÷ working days) × salary. Present/absent columns come from your PDFs.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(payrollPeriod === "monthly" ? availableMonths.length === 0 : availableWeeks.length === 0) ? (
                <p className="text-muted-foreground text-sm py-6 text-center">
                  Upload attendance PDFs in the Upload &amp; History tab first. Detailed reports give best weekly data.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="space-y-1.5">
                      <Label>Period</Label>
                      <Select value={payrollPeriod} onValueChange={(v: "monthly" | "weekly") => setPayrollPeriod(v)}>
                        <SelectTrigger className="w-[140px] rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {payrollPeriod === "monthly" ? (
                      <div className="space-y-1.5">
                        <Label>Month</Label>
                        <Select value={selectedMonth} onValueChange={setPayrollMonth}>
                          <SelectTrigger className="w-[180px] rounded-xl">
                            <SelectValue placeholder="Select month" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableMonths.map((m) => (
                              <SelectItem key={m} value={m}>
                                {format(parseISO(m + "-01"), "MMMM yyyy")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label>Week ending (Sun)</Label>
                        <Select value={selectedWeek} onValueChange={setPayrollWeek}>
                          <SelectTrigger className="w-[180px] rounded-xl">
                            <SelectValue placeholder="Select week" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableWeeks.map((w) => (
                              <SelectItem key={w} value={w}>
                                {format(parseISO(w), "dd MMM yyyy")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl gap-1.5 mt-6"
                      onClick={() => {
                        setEmployeeDialog({ open: true });
                        setEmpCode("");
                        setEmpName("");
                        setEmpSalary("");
                        setEmpWeeklySalary("");
                        setEmpSalaryType("monthly_8th");
                      }}
                    >
                      <UserPlus className="h-4 w-4" />
                      Add employee / Set salary
                    </Button>
                  </div>

                  {payrollLoading ? (
                    <Skeleton className="h-64 w-full rounded-xl" />
                  ) : payrollPeriod === "monthly" ? (
                    <div className="space-y-2">
                      {selectedMonth && (
                        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border">
                          <span className="font-medium text-foreground">{standardDaysMonth} working days</span> in {format(parseISO(selectedMonth + "-01"), "MMMM yyyy")} (Mon–Sat). <span className="text-foreground font-medium">1 free holiday/month</span> applied — LOP calculated on absences minus 1. Rows sorted by pay date.
                        </p>
                      )}
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-semibold">Code</th>
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-center p-3 font-semibold text-green-600">Present</th>
                            <th className="text-center p-3 font-semibold text-red-600">Absent</th>
                            <th className="text-center p-3 font-semibold" title="Mon–Sat count in month">Working days</th>
                            <th className="text-right p-3 font-semibold">Monthly salary (₹)</th>
                            <th className="text-right p-3 font-semibold text-red-600">Loss of pay (₹)</th>
                            <th className="text-right p-3 font-semibold text-primary">Net pay (₹)</th>
                            <th className="text-center p-3 font-semibold text-orange-600">Pay Date</th>
                             <th className="w-20 p-2" />
                           </tr>
                         </thead>
                         <tbody>
                           {payrollRows.map((row, i) => (
                             <tr key={`${row.code}-${row.monthYear}-${i}`} className="border-b last:border-0 hover:bg-muted/30">
                               <td className="p-3 font-mono text-xs">{row.code}</td>
                               <td className="p-3 font-medium">
                                 <div>{row.name}</div>
                                 <div className="text-xs text-muted-foreground">{getSalaryPeriodLabel(row.salaryType, row.monthYear)}</div>
                               </td>
                               <td className="p-3 text-center text-green-600">{row.present}</td>
                               <td className="p-3 text-center text-red-600">{row.absent}</td>
                               <td className="p-3 text-center">{row.workingDays}</td>
                               <td className="p-3 text-right font-medium">{row.monthlySalary > 0 ? row.monthlySalary.toLocaleString("en-IN") : "—"}</td>
                               <td className="p-3 text-right text-red-600">{row.lossOfPay > 0 ? row.lossOfPay.toLocaleString("en-IN") : "—"}</td>
                               <td className="p-3 text-right font-semibold text-primary">{row.netPay.toLocaleString("en-IN")}</td>
                               <td className="p-3 text-center">
                                 <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 border border-orange-200">
                                   {row.payDate ? format(parseISO(row.payDate), "dd MMM") : "—"}
                                 </span>
                               </td>
                               <td className="p-2">
                                 <div className="flex items-center gap-1">
                                   <Button
                                     variant="ghost"
                                     size="icon"
                                     className="h-8 w-8"
                                     onClick={() => {
                                       const existing = payrollEmpByCode.get((row.code || "").trim().toUpperCase());
                                       setEmployeeDialog({ open: true, edit: existing ?? undefined });
                                       setEmpCode(existing?.employee_code ?? row.code);
                                       setEmpName(existing?.display_name ?? row.name);
                                       setEmpSalary(existing ? String(existing.monthly_salary) : "");
                                       setEmpWeeklySalary(existing?.weekly_salary != null ? String(existing.weekly_salary) : "");
                                       setEmpSalaryType(existing?.salary_type ?? "monthly_8th");
                                     }}
                                   >
                                     <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                   </Button>
                                   <Button
                                     variant="ghost"
                                     size="icon"
                                     className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                     onClick={() => {
                                       const existing = payrollEmpByCode.get((row.code || "").trim().toUpperCase());
                                       setDeleteEmployeeName(existing?.display_name || row.name || row.code);
                                       setDeleteEmployeeCode(row.code || "");
                                       setDeleteEmployeeId(existing?.id ?? `attendance-only::${row.code}`);
                                     }}
                                   >
                                     <Trash2 className="h-3.5 w-3.5" />
                                   </Button>
                                 </div>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                     </div>
                   ) : (
                    <div className="space-y-2">
                      {selectedWeek && (
                        <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border">
                          <span className="font-medium text-foreground">{standardDaysWeek} working days</span> in week ending {format(parseISO(selectedWeek), "dd MMM yyyy")} (Mon–Sat) — same for everyone.
                        </p>
                      )}
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-semibold">Code</th>
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-center p-3 font-semibold text-green-600">Present</th>
                            <th className="text-center p-3 font-semibold text-red-600">Absent</th>
                            <th className="text-center p-3 font-semibold" title="Mon–Sat in that week">Working days</th>
                            <th className="text-right p-3 font-semibold">Weekly salary (₹)</th>
                            <th className="text-right p-3 font-semibold text-red-600">Loss of pay (₹)</th>
                            <th className="text-right p-3 font-semibold text-primary">Net pay (₹)</th>
                            <th className="text-center p-3 font-semibold text-orange-600">Pay Date</th>
                             <th className="w-20 p-2" />
                           </tr>
                         </thead>
                         <tbody>
                           {payrollRowsWeekly.length === 0 ? (
                             <tr><td colSpan={10} className="p-6 text-center text-muted-foreground text-sm">No weekly employees found for this week. Set employees as "Weekly" in the payroll master.</td></tr>
                           ) : payrollRowsWeekly.map((row, i) => (
                             <tr key={`${row.code}-${row.weekEnding}-${i}`} className="border-b last:border-0 hover:bg-muted/30">
                               <td className="p-3 font-mono text-xs">{row.code}</td>
                               <td className="p-3 font-medium">{row.name}</td>
                               <td className="p-3 text-center text-green-600">{row.present}</td>
                               <td className="p-3 text-center text-red-600">{row.absent}</td>
                               <td className="p-3 text-center">{row.workingDays}</td>
                               <td className="p-3 text-right font-medium">{row.weeklySalary > 0 ? row.weeklySalary.toLocaleString("en-IN") : "—"}</td>
                               <td className="p-3 text-right text-red-600">{row.lossOfPay > 0 ? row.lossOfPay.toLocaleString("en-IN") : "—"}</td>
                               <td className="p-3 text-right font-semibold text-primary">{row.netPay.toLocaleString("en-IN")}</td>
                               <td className="p-3 text-center">
                                 <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 border border-orange-200">
                                   {row.payDate ? format(parseISO(row.payDate), "dd MMM") : "—"}
                                 </span>
                               </td>
                               <td className="p-2">
                                 <div className="flex items-center gap-1">
                                   <Button
                                     variant="ghost"
                                     size="icon"
                                     className="h-8 w-8"
                                     onClick={() => {
                                       const existing = payrollEmpByCode.get((row.code || "").trim().toUpperCase());
                                       setEmployeeDialog({ open: true, edit: existing ?? undefined });
                                       setEmpCode(existing?.employee_code ?? row.code);
                                       setEmpName(existing?.display_name ?? row.name);
                                        setEmpSalary(existing ? String(existing.monthly_salary) : "");
                                        setEmpWeeklySalary(existing?.weekly_salary != null ? String(existing.weekly_salary) : "");
                                        setEmpSalaryType(existing?.salary_type ?? "weekly");
                                      }}
                                    >
                                      <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => {
                                        const existing = payrollEmpByCode.get((row.code || "").trim().toUpperCase());
                                        setDeleteEmployeeName(existing?.display_name || row.name || row.code);
                                        setDeleteEmployeeCode(row.code || "");
                                        setDeleteEmployeeId(existing?.id ?? `attendance-only::${row.code}`);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                           ))}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  )}

                  {payrollPeriod === "monthly" && payrollRows.length > 0 && (
                    <div className="flex flex-wrap gap-6 pt-2 border-t text-sm">
                      <span className="text-muted-foreground">
                        Total loss of pay: <strong className="text-red-600">₹{totalLossOfPay.toLocaleString("en-IN")}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        Total to pay: <strong className="text-primary">₹{totalNetPay.toLocaleString("en-IN")}</strong>
                      </span>
                    </div>
                  )}
                  {payrollPeriod === "weekly" && payrollRowsWeekly.length > 0 && (
                    <div className="flex flex-wrap gap-6 pt-2 border-t text-sm">
                      <span className="text-muted-foreground">
                        Total loss of pay: <strong className="text-red-600">₹{totalLossOfPayWeekly.toLocaleString("en-IN")}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        Total to pay: <strong className="text-primary">₹{totalNetPayWeekly.toLocaleString("en-IN")}</strong>
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hours" className="space-y-6 mt-0">
          {/* Controls row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={selectedHoursMonth} onValueChange={setHoursMonth}>
                <SelectTrigger className="w-[180px] rounded-xl">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map(m => (
                    <SelectItem key={m} value={m}>
                      {format(parseISO(m + "-01"), "MMMM yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {weeklySummaries.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl gap-1.5 no-print"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Print / Export
              </Button>
            )}
          </div>

          {/* No detailed data state */}
          {uploads.filter(u => u.parsed_data?.source_type === "detailed_report").length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-foreground font-medium">Upload an ESSL Daily Detailed Report PDF first.</p>
                <p className="text-sm text-muted-foreground mt-1">Go to Upload & History tab → Choose PDF</p>
              </CardContent>
            </Card>
          ) : weeklySummaries.length === 0 || weeklySummaries.every(w => w.rows.every(r => r.workedMinutes === 0)) ? (
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center space-y-2">
                <p className="text-foreground font-medium">Work duration data not found in this upload.</p>
                <p className="text-sm text-muted-foreground">
                  Please delete the existing upload and re-upload the same PDF — the parser now captures work hours.
                </p>
              </CardContent>
            </Card>
          ) : (
            <WeeklyHoursReport summaries={weeklySummaries} monthYear={selectedHoursMonth} />
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={employeeDialog.open}
        onOpenChange={(o) => setEmployeeDialog((p) => ({ ...p, open: o }))}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{employeeDialog.edit ? "Edit salary" : "Add employee / Set salary"}</DialogTitle>
            <DialogDescription>
              Set monthly salary for payroll. Loss of pay is calculated as (absent days / working days) × salary.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Employee code</Label>
              <Input
                value={empCode}
                onChange={(e) => setEmpCode(e.target.value)}
                placeholder="e.g. SP001"
                className="rounded-xl"
                disabled={!!employeeDialog.edit?.id}
              />
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                placeholder="Employee name"
                className="rounded-xl"
              />
            </div>
            <div className="grid gap-2">
              <Label>Salary Type</Label>
              <Select value={empSalaryType} onValueChange={(v) => setEmpSalaryType(v as SalaryType)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly_8th">Monthly — paid on 8th (period: 8th prev → 7th current)</SelectItem>
                  <SelectItem value="monthly_1st">Monthly — paid on 1st (period: 1st → last of month)</SelectItem>
                  <SelectItem value="weekly">Weekly — paid every Saturday</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {empSalaryType !== "weekly" ? (
              <div className="grid gap-2">
                <Label>Monthly salary (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={empSalary}
                  onChange={(e) => setEmpSalary(e.target.value)}
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Weekly salary (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={empWeeklySalary}
                  onChange={(e) => setEmpWeeklySalary(e.target.value)}
                  placeholder="e.g. 3000"
                  className="rounded-xl"
                />
                <p className="text-xs text-muted-foreground">If blank, calculated as monthly ÷ 4.33</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmployeeDialog({ open: false })}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl"
              onClick={async () => {
                if (!(empCode || "").trim() || !(empName || "").trim()) {
                  toast.error("Code and name are required");
                  return;
                }
                await upsertPayroll.mutateAsync({
                  id: employeeDialog.edit?.id,
                  employee_code: (empCode || "").trim(),
                  display_name: (empName || "").trim(),
                  monthly_salary: empSalaryType !== "weekly" ? Number(empSalary) || 0 : 0,
                  weekly_salary: empSalaryType === "weekly" ? Number(empWeeklySalary) || 0 : 0,
                  salary_type: empSalaryType,
                });
                setEmployeeDialog({ open: false });
              }}
              disabled={upsertPayroll.isPending}
            >
              {upsertPayroll.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!importPdfPreview} onOpenChange={(open) => !open && setImportPdfPreview(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Import employees from PDF</DialogTitle>
            <DialogDescription>
              Found {importPdfPreview?.rows.length ?? 0} employee(s) in {importPdfPreview?.name}. Add them to the employee master. You can edit salary later.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 border rounded-lg p-2 space-y-1">
            {importPdfPreview?.rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <span className="font-mono text-xs">{r.employee_code}</span>
                <span className="font-medium truncate flex-1 mx-2">{r.display_name}</span>
                <span className="text-muted-foreground shrink-0">
                  {r.monthly_salary > 0 ? `₹${r.monthly_salary.toLocaleString("en-IN")}` : "—"}
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPdfPreview(null)}>Cancel</Button>
            <Button
              className="rounded-xl"
              disabled={bulkUpsertPayroll.isPending}
              onClick={async () => {
                if (!importPdfPreview?.rows.length) return;
                await bulkUpsertPayroll.mutateAsync(importPdfPreview.rows);
                setImportPdfPreview(null);
              }}
            >
              {bulkUpsertPayroll.isPending ? "Adding…" : `Add ${importPdfPreview?.rows.length ?? 0} to master`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteEmployeeId} onOpenChange={(open) => { if (!open) { setDeleteEmployeeId(null); setDeleteEmployeeName(""); setDeleteEmployeeCode(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteEmployeeName ? `"${deleteEmployeeName}"` : "employee"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteEmployeeName || "this employee"}</strong> from all uploaded attendance records and the payroll master list. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const isAttendanceOnly = deleteEmployeeId?.startsWith("attendance-only::");
                const payrollId = isAttendanceOnly ? undefined : (deleteEmployeeId ?? undefined);
                await removeEmployeeEverywhere.mutateAsync({
                  employeeCode: deleteEmployeeCode,
                  employeeName: deleteEmployeeName,
                  payrollMasterId: payrollId,
                });
                setDeleteEmployeeId(null);
                setDeleteEmployeeName("");
                setDeleteEmployeeCode("");
              }}
            >
              Remove Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove attendance record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the uploaded attendance data for this month. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteId) {
                  await deleteUpload.mutateAsync(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
