import { useOrders, useOrdersToday } from "@/hooks/useOrders";
import { useProductionJobs } from "@/hooks/useProductionJobs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Package, AlertCircle, Truck, AlertTriangle, CalendarDays,
  ArrowRight, MessageCircle, Activity, PlusCircle, Briefcase,
} from "lucide-react";
import { format, parseISO, isBefore, differenceInDays, isToday, subDays, formatDistanceToNow } from "date-fns";
import { ORDER_STATUSES, STATUS_EMOJIS } from "@/lib/constants";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const PIPELINE_GROUPS = [
  { label: "Received",  statuses: ["Order Received"],         color: "#3B82F6" },
  { label: "Design",    statuses: ["Design Review"],           color: "#8B5CF6" },
  { label: "Plate",     statuses: ["Plate Making"],            color: "#0EA5E9" },
  { label: "Printing",  statuses: ["Printing"],                color: "#F59E0B" },
  { label: "Finishing", statuses: ["Cutting / Binding"],       color: "#F97316" },
  { label: "QC",        statuses: ["Quality Check"],           color: "#10B981" },
  { label: "Partial",   statuses: ["Partially Fulfilled"],     color: "#6366F1" },
  { label: "Ready",     statuses: ["Ready to Dispatch"],       color: "#16A34A" },
  { label: "Payment",   statuses: ["Payment Pending"],         color: "#EF4444" },
  { label: "Done",      statuses: ["Delivered"],               color: "#6B7280" },
];

export default function Dashboard() {
  const { data: orders = [], isLoading } = useOrders();
  const { data: todayCount = 0 } = useOrdersToday();
  const { data: productionJobs = [] } = useProductionJobs();
  const navigate = useNavigate();

  const jobStats = useMemo(() => {
    const pending = productionJobs.filter(j =>
      ["design_review", "plate_making", "cutting_binding", "quality_check"].includes(j.status)
    ).length;
    const printing = productionJobs.filter(j => j.status === "printing").length;
    const ready = productionJobs.filter(j => j.status === "ready_dispatch").length;
    const completed = productionJobs.filter(j => j.status === "completed").length;
    return { pending, printing, ready, completed };
  }, [productionJobs]);

  const yesterday = subDays(new Date(), 1);
  const stats = useMemo(() => {
    const now = new Date();
    const inProduction = orders.filter(o =>
      ["Design Review", "Plate Making", "Printing", "Cutting / Binding", "Quality Check"].includes(o.status)
    ).length;
    const readyOrOut = orders.filter(o => o.status === "Ready to Dispatch").length;
    const overdue = orders.filter(o =>
      isBefore(parseISO(o.delivery_date), now) && o.status !== "Delivered" && o.status !== "Cancelled"
    ).length;
    const totalBalanceDue = orders.reduce((s, o) => {
      const bal = Number(o.amount) - (Number(o.advance_paid) || 0);
      return s + (bal > 0 ? bal : 0);
    }, 0);
    return { inProduction, readyOrOut, overdue, totalBalanceDue };
  }, [orders]);

  const yesterdayStats = useMemo(() => {
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
    const yesterdayOrders = orders.filter(o => {
      const created = parseISO(o.created_at);
      return created >= yesterdayStart && created <= yesterdayEnd;
    });
    const inProd = yesterdayOrders.filter(o =>
      ["Design Review", "Plate Making", "Printing", "Cutting / Binding", "Quality Check"].includes(o.status)
    ).length;
    const ready = yesterdayOrders.filter(o => o.status === "Ready to Dispatch").length;
    const over = yesterdayOrders.filter(o =>
      isBefore(parseISO(o.delivery_date), yesterday) && o.status !== "Delivered" && o.status !== "Cancelled"
    ).length;
    const todayOrd = yesterdayOrders.length;
    return { todayOrd, inProd, ready, over };
  }, [orders, yesterday]);

  const overdueOrders = useMemo(() => {
    const now = new Date();
    return orders
      .filter(o => isBefore(parseISO(o.delivery_date), now) && o.status !== "Delivered" && o.status !== "Cancelled")
      .map(o => ({
        ...o,
        daysOverdue: differenceInDays(now, parseISO(o.delivery_date)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [orders]);

  const todayDeliveries = useMemo(() => {
    return orders.filter(o =>
      isToday(parseISO(o.delivery_date)) && o.status !== "Delivered" && o.status !== "Cancelled"
    );
  }, [orders]);

  const pipelineCounts = useMemo(() => {
    return PIPELINE_GROUPS.map(g => ({
      ...g,
      count: orders.filter(o => g.statuses.includes(o.status)).length,
    }));
  }, [orders]);

  const recentActivity = useMemo(() => {
    return orders
      .slice(0, 10)
      .map(o => ({
        id: o.id,
        orderNo: o.order_no,
        customer: o.customer_name,
        status: o.status,
        time: o.updated_at,
      }));
  }, [orders]);

  const trend = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? "+100%" : "—";
    const pct = Math.round(((curr - prev) / prev) * 100);
    if (pct === 0) return "—";
    return pct > 0 ? `+${pct}%` : `${pct}%`;
  };
  const statCards = [
    { label: "Today's Orders", value: todayCount, icon: Package, color: "text-status-received", bgColor: "bg-status-received/10", trendKey: "todayOrd" as const },
    { label: "In Production", value: stats.inProduction, icon: Activity, color: "text-secondary", bgColor: "bg-secondary/10", trendKey: "inProd" as const },
    { label: "Ready to Dispatch", value: stats.readyOrOut, icon: Truck, color: "text-success", bgColor: "bg-success/10", trendKey: "ready" as const },
    { label: "Overdue", value: stats.overdue, icon: AlertCircle, color: "text-destructive", bgColor: "bg-destructive/10", trendKey: "over" as const },
  ];
  const navFilters = [
    { path: "/orders?date=today" },
    { path: "/orders?status=Design Review" },
    { path: "/orders?status=Ready to Dispatch" },
    { path: "/orders?overdue=1" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Order pipeline and quick actions</p>
        </div>
        <Button className="rounded-xl gap-2 shrink-0" onClick={() => navigate("/orders/new")}>
          <PlusCircle className="h-4 w-4" />
          New Order
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      )}

      {!isLoading && (
      <>

      {/* KPI Cards */}
      <section>
        <h2 className="section-label">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s, idx) => {
            const isOverdue = s.label === "Overdue";
            const isZero = s.value === 0;
            const prevVal = yesterdayStats[s.trendKey];
            const trendStr = trend(s.value, prevVal);
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => navigate(navFilters[idx]?.path ?? "/orders")}
                className="text-left rounded-2xl border border-border/80 bg-card shadow-card hover:shadow-elevated hover:border-primary/20 transition-all duration-200"
              >
                <Card className={isOverdue ? "rounded-2xl border-0 bg-[#FEF2F2] border-l-4 border-l-[#DC2626]" : "rounded-2xl border-0"}>
                  <CardContent className="p-5">
                    <div className={`h-11 w-11 rounded-xl ${s.bgColor} flex items-center justify-center mb-3`}>
                      <s.icon className={`h-5 w-5 ${s.color}`} />
                    </div>
                    <p className={`text-2xl md:text-3xl font-bold tabular-nums ${isOverdue ? "text-[#DC2626]" : isZero ? "text-[#9CA3AF]" : "text-foreground"}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">{s.label}</p>
                    {isZero && <p className="text-xs text-[#9CA3AF] mt-0.5">None today</p>}
                    {!isZero && (
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        vs yesterday {trendStr === "—" ? "—" : (s.value > prevVal ? <span className="text-green-600">▲ {trendStr}</span> : <span className="text-destructive">▼ {trendStr}</span>)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </section>

      {/* Production Jobs Summary */}
      <section>
        <h2 className="section-label">Production Jobs</h2>
        <Card className="rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button type="button" onClick={() => navigate("/production-jobs?status=design_review")} className="text-left p-3 rounded-xl border border-border/80 hover:bg-muted/50 transition-colors">
                <p className="text-xl font-bold tabular-nums text-foreground">{jobStats.pending}</p>
                <p className="text-xs text-muted-foreground font-medium">Jobs Pending</p>
              </button>
              <button type="button" onClick={() => navigate("/production-jobs?status=printing")} className="text-left p-3 rounded-xl border border-border/80 hover:bg-muted/50 transition-colors">
                <p className="text-xl font-bold tabular-nums text-[#F59E0B]">{jobStats.printing}</p>
                <p className="text-xs text-muted-foreground font-medium">Jobs Printing</p>
              </button>
              <button type="button" onClick={() => navigate("/production-jobs?status=ready_dispatch")} className="text-left p-3 rounded-xl border border-border/80 hover:bg-muted/50 transition-colors">
                <p className="text-xl font-bold tabular-nums text-[#16A34A]">{jobStats.ready}</p>
                <p className="text-xs text-muted-foreground font-medium">Ready to Dispatch</p>
              </button>
              <button type="button" onClick={() => navigate("/production-jobs?status=completed")} className="text-left p-3 rounded-xl border border-border/80 hover:bg-muted/50 transition-colors">
                <p className="text-xl font-bold tabular-nums text-[#6B7280]">{jobStats.completed}</p>
                <p className="text-xs text-muted-foreground font-medium">Jobs Completed</p>
              </button>
            </div>
            <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => navigate("/production-jobs")}>
              <Briefcase className="h-3.5 w-3.5" /> View all production jobs
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Urgent Attention - Overdue */}
      {overdueOrders.length > 0 && (
        <Card className="rounded-2xl border-2 border-destructive/20 bg-destructive/5 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {overdueOrders.length} order{overdueOrders.length > 1 ? 's' : ''} need your attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueOrders.slice(0, 5).map((o, i, arr) => {
                const showCustomerHeader = i === 0 || o.customer_name !== arr[i - 1].customer_name;
                const isLastInGroup = i === arr.length - 1 || arr[i + 1].customer_name !== o.customer_name;
                const sameCustomerCount = arr.filter(x => x.customer_name === o.customer_name).length;
                const severityStyle = o.daysOverdue >= 90 ? { fontWeight: 700, color: "#991B1B" } : o.daysOverdue >= 30 ? { color: "#B45309" } : { color: "#D97706" };
                return (
                  <div key={o.id}>
                    {showCustomerHeader && (
                      <div className="px-2 py-1.5 bg-muted/50 rounded-t border border-border/80 font-semibold text-sm text-foreground">
                        {o.customer_name} ({sameCustomerCount})
                      </div>
                    )}
                    <div className={`flex items-center justify-between p-2 bg-card border border-border/80 border-t-0 ${isLastInGroup ? "rounded-b" : ""}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-semibold whitespace-nowrap">{o.order_no}</span>
                        <span className="text-sm truncate">{o.customer_name}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">{o.product_type}</span>
                        <span className="text-xs font-semibold whitespace-nowrap" style={severityStyle}>{o.daysOverdue}d overdue</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}>
                          Update Status
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" title="Add Comment" onClick={(e) => {
                          e.stopPropagation();
                          const url = `https://wa.me/91${o.contact_no.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hi ${o.customer_name}, regarding your order ${o.order_no}...`)}`;
                          window.open(url, "_blank");
                        }}>
                          <MessageCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <a href="/orders?overdue=1" className="block text-sm text-primary hover:underline mt-2" onClick={(e) => { e.preventDefault(); navigate("/orders?overdue=1"); }}>
                View all {overdueOrders.length} overdue orders →
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Deliveries */}
      {todayDeliveries.length > 0 && (
        <Card className="rounded-2xl border-2 border-warning/20 bg-warning/5 shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-warning flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {todayDeliveries.length} delivery(ies) expected today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayDeliveries.map((o) => (
                <div key={o.id} className="flex items-center justify-between p-2 bg-card rounded-lg border table-row-hover">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-semibold">{o.order_no}</span>
                    <span className="text-sm truncate">{o.customer_name}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-7 text-xs border border-[#D1D5DB] bg-white rounded-md" onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}>
                      Mark Dispatched
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" title="View Order Details" onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}>
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Production Pipeline */}
      <section>
        <h2 className="section-label">Production Pipeline</h2>
        <Card className="rounded-2xl border border-border/80 shadow-card">
          <CardContent className="p-4">
            <div className="flex items-end gap-0 overflow-x-auto pb-2">
              {pipelineCounts.map((stage, i) => {
                const isZero = stage.count === 0;
                return (
                  <div key={stage.label} className="flex items-center flex-shrink-0">
                    {i > 0 && <span className="text-muted-foreground px-0.5 text-lg" aria-hidden>›</span>}
                    <button
                      type="button"
                      onClick={() => stage.statuses.length === 1 && navigate(`/orders?status=${encodeURIComponent(stage.statuses[0])}`)}
                      className="flex flex-col items-center w-20 min-w-[80px] h-14 rounded-lg transition-transform hover:scale-105 cursor-pointer"
                      style={{ backgroundColor: stage.color, opacity: isZero ? 0.4 : 1 }}
                    >
                      <span className="text-white font-bold text-xl" style={{ fontWeight: isZero ? 400 : 700 }}>{stage.count}</span>
                      <span className="text-[11px] text-white/90 mt-0.5">{stage.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Balance Due + Recent Activity */}
      <section>
        <h2 className="section-label">Summary</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-2xl border border-border/80 shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Payment Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">Total Balance Due</p>
                <p className="text-3xl font-bold mt-1" style={{ color: overdueOrders.length > 0 ? "#DC2626" : "#1E293B" }}>₹{stats.totalBalanceDue.toLocaleString("en-IN")}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-[13px] text-[#374151]">
                <div className="text-center p-2 bg-muted/30 rounded-lg">Collected This Month<br /><span className="font-semibold">₹0</span></div>
                <div className="text-center p-2 bg-muted/30 rounded-lg">Pending Invoices<br /><span className="font-semibold">{orders.filter(o => Number(o.amount) - (Number(o.advance_paid) || 0) > 0).length}</span></div>
                <div className="text-center p-2 bg-muted/30 rounded-lg">Overdue Payments<br /><span className="font-semibold">{overdueOrders.length}</span></div>
              </div>
              <a href="/orders" className="block text-sm text-primary hover:underline mt-3 text-right" onClick={(e) => { e.preventDefault(); navigate("/orders"); }}>
                View Payments →
              </a>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border border-border/80 shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Recent Activity</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="max-h-60 overflow-y-auto">
                {recentActivity.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No orders yet. Create one from <button type="button" onClick={() => navigate("/orders/new")} className="text-primary underline">New Order</button>.
                  </div>
                ) : (
                  recentActivity.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/orders/${a.id}`)}
                      className="w-full text-left px-4 py-2 border-b table-row-hover text-sm flex items-center gap-2"
                    >
                      <span className="text-muted-foreground truncate min-w-0 max-w-[200px]" title={a.customer}>{a.customer}</span>
                      <span className="font-mono text-xs shrink-0">· {a.orderNo} →</span>
                      <StatusBadge status={a.status} />
                      <span className="text-[11px] text-[#9CA3AF] ml-auto shrink-0">{a.time ? formatDistanceToNow(new Date(a.time), { addSuffix: true }) : ""}</span>
                    </button>
                  ))
                )}
              </div>
              <a href="/orders" className="block text-sm text-primary hover:underline py-3 px-4 text-right" onClick={(e) => { e.preventDefault(); navigate("/orders"); }}>
                View full activity log →
              </a>
            </CardContent>
          </Card>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
