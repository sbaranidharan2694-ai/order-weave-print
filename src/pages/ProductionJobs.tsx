import { useState, useMemo, useRef } from "react";
import { useProductionJobs, useUpdateJobStatus, useUpdateJob, useOrdersWithoutJobs, useBackfillProductionJobs, type ProductionJobWithOrder } from "@/hooks/useProductionJobs";
import { useSettings } from "@/hooks/useSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "@/lib/productionJobConstants";
import { format, parseISO } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Printer, Briefcase, Filter, RefreshCw, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ProductionJobs() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get("status") || "all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [orderNoFilter, setOrderNoFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [printJob, setPrintJob] = useState<ProductionJobWithOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const filters = useMemo(() => {
    const f: { status?: string; assigned_to?: string; order_no?: string; due_date_from?: string; due_date_to?: string } = {};
    if (statusFilter && statusFilter !== "all") f.status = statusFilter;
    if (assignedFilter && assignedFilter !== "all") f.assigned_to = assignedFilter;
    if (orderNoFilter.trim()) f.order_no = orderNoFilter.trim();
    if (dueFrom) f.due_date_from = dueFrom;
    if (dueTo) f.due_date_to = dueTo;
    return f;
  }, [statusFilter, assignedFilter, orderNoFilter, dueFrom, dueTo]);

  const { data: jobs = [], isLoading } = useProductionJobs(Object.keys(filters).length ? filters : undefined);
  const { data: settings } = useSettings();
  const { data: ordersWithoutJobs = [] } = useOrdersWithoutJobs();
  const backfill = useBackfillProductionJobs();
  const updateStatus = useUpdateJobStatus();
  const updateJob = useUpdateJob();

  const operators = settings?.operator_names || [];
  const hasOrdersWithoutJobs = ordersWithoutJobs.length > 0;

  const handlePrint = (job: ProductionJobWithOrder) => {
    setPrintJob(job);
    setTimeout(() => {
      window.print();
      setPrintJob(null);
    }, 300);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full max-w-md" />
        <div className="rounded-2xl border border-border overflow-hidden">
          <Skeleton className="h-10 w-full" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none border-t border-border" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in print:hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Briefcase className="h-7 w-7 text-[#F97316]" />
          Production Jobs
        </h1>
      </div>

      {/* Validate with current data: backfill banner */}
      {hasOrdersWithoutJobs && (
        <Card className="rounded-2xl border border-amber-200 bg-amber-50/80">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">
                  {ordersWithoutJobs.length} order{ordersWithoutJobs.length !== 1 ? "s" : ""} in the system don&apos;t have a production job yet.
                </p>
                <p className="text-sm text-amber-800 mt-0.5">
                  Create jobs for existing orders to validate and use production tracking with your current data.
                </p>
              </div>
            </div>
            <Button
              onClick={() => backfill.mutate(undefined)}
              disabled={backfill.isPending}
              className="shrink-0 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {backfill.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Create jobs for existing orders
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="rounded-2xl border border-[#E5E7EB]">
        <CardHeader className="border-b border-[#F1F5F9] py-4">
          <CardTitle className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-4">
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {JOB_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Assigned To</Label>
            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Order Number</Label>
            <Input
              placeholder="e.g. SP-2026-001"
              value={orderNoFilter}
              onChange={(e) => setOrderNoFilter(e.target.value)}
              className="mt-1 h-9"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Due From</Label>
            <Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Due To</Label>
            <Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} className="mt-1 h-9" />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <CardHeader className="border-b border-[#F1F5F9]">
          <CardTitle className="text-sm font-semibold text-[#1E293B]">All Jobs ({jobs.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No production jobs yet. Jobs are created automatically when you create or import orders.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Job Number</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Order No.</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Item</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Qty</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Assigned To</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Due Date</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const order = Array.isArray(job.orders) ? job.orders[0] : job.orders;
                    const orderNo = order?.order_no ?? "—";
                    const customerName = order?.customer_name ?? "—";
                    const currentIdx = JOB_STATUSES.indexOf(job.status);
                    return (
                      <tr
                        key={job.id}
                        className="border-b table-row-hover"
                      >
                        <td className="p-3 font-mono font-semibold text-[#1E293B]">{job.job_number}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/orders/${job.order_id}`)}
                            className="text-[#3B82F6] hover:underline font-mono text-xs"
                          >
                            {orderNo}
                          </button>
                        </td>
                        <td className="p-3">{job.description}</td>
                        <td className="p-3 text-right">{job.quantity.toLocaleString("en-IN")}</td>
                        <td className="p-3">
                          <Select
                            value={job.status}
                            onValueChange={(v) => updateStatus.mutate({ id: job.id, status: v })}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs border-[#E5E7EB]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {JOB_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Select
                            value={job.assigned_to || "unassigned"}
                            onValueChange={(v) => updateJob.mutate({ id: job.id, assigned_to: v === "unassigned" ? null : v })}
                          >
                            <SelectTrigger className="h-8 w-[120px] text-xs">
                              <SelectValue placeholder="Assign" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unassigned">—</SelectItem>
                              {operators.map((op) => (
                                <SelectItem key={op} value={op}>{op}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {job.due_date ? format(parseISO(job.due_date), "dd MMM yyyy") : "—"}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handlePrint(job)}
                            title="Print job card"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Print-only job card layout (visible only when printing) */}
      {printJob && (
        <div ref={printRef} className="hidden print:block fixed inset-0 bg-white z-[9999] p-8">
          <div className="max-w-lg mx-auto border-2 border-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">JOB CARD</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Job Number</span><p className="font-semibold">{printJob.job_number}</p></div>
              <div><span className="text-gray-500">Order Number</span><p className="font-semibold">{(Array.isArray(printJob.orders) ? printJob.orders[0] : printJob.orders)?.order_no ?? "—"}</p></div>
              <div className="col-span-2"><span className="text-gray-500">Item Description</span><p className="font-semibold">{printJob.description}</p></div>
              <div><span className="text-gray-500">Quantity</span><p className="font-semibold">{printJob.quantity}</p></div>
              <div><span className="text-gray-500">Customer</span><p className="font-semibold">{(Array.isArray(printJob.orders) ? printJob.orders[0] : printJob.orders)?.customer_name ?? "—"}</p></div>
              <div><span className="text-gray-500">Due Date</span><p className="font-semibold">{printJob.due_date ? format(parseISO(printJob.due_date), "dd MMM yyyy") : "—"}</p></div>
              <div><span className="text-gray-500">Paper</span><p className="font-semibold">{(Array.isArray(printJob.orders) ? printJob.orders[0] : printJob.orders)?.paper_type ?? "—"}</p></div>
              <div><span className="text-gray-500">Color Mode</span><p className="font-semibold">{(Array.isArray(printJob.orders) ? printJob.orders[0] : printJob.orders)?.color_mode ?? "—"}</p></div>
              <div><span className="text-gray-500">Assigned Staff</span><p className="font-semibold">{printJob.assigned_to || "—"}</p></div>
              <div><span className="text-gray-500">Status</span><p className="font-semibold">{JOB_STATUS_LABELS[printJob.status] || printJob.status}</p></div>
              <div className="col-span-2"><span className="text-gray-500">Special Instructions</span><p className="font-semibold">{(Array.isArray(printJob.orders) ? printJob.orders[0] : printJob.orders)?.special_instructions ?? "—"}</p></div>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-300 text-xs text-gray-500">
              Production flow: Design Review → Plate Making → Printing → Cutting / Binding → Quality Check → Ready to Dispatch → Completed
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          .print\\:block { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
