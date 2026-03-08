import { useOrders, useOrdersToday } from "@/hooks/useOrders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Package, AlertCircle, Truck, AlertTriangle, CalendarDays,
  ArrowRight, MessageCircle, Activity, PlusCircle,
} from "lucide-react";
import { format, parseISO, isBefore, differenceInDays, isToday } from "date-fns";
import { ORDER_STATUSES, STATUS_EMOJIS } from "@/lib/constants";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const PIPELINE_GROUPS = [
  { label: "Received",  statuses: ["Order Received"],         color: "bg-status-received" },
  { label: "Design",    statuses: ["Design Review"],           color: "bg-status-design" },
  { label: "Plate",     statuses: ["Plate Making"],            color: "bg-secondary" },
  { label: "Printing",  statuses: ["Printing"],                color: "bg-secondary" },
  { label: "Finishing", statuses: ["Cutting / Binding"],       color: "bg-status-cutting" },
  { label: "QC",        statuses: ["Quality Check"],           color: "bg-status-quality" },
  { label: "Partial",   statuses: ["Partially Fulfilled"],     color: "bg-status-partial" },
  { label: "Ready",     statuses: ["Ready to Dispatch"],       color: "bg-success" },
  { label: "Payment",   statuses: ["Payment Pending"],         color: "bg-status-payment" },
  { label: "Done",      statuses: ["Delivered"],               color: "bg-muted-foreground" },
];

export default function Dashboard() {
  const { data: orders = [], isLoading } = useOrders();
  const { data: todayCount = 0 } = useOrdersToday();
  const navigate = useNavigate();

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

  const statCards = [
    { label: "Today's Orders", value: todayCount, icon: Package, color: "text-status-received", bgColor: "bg-status-received/10" },
    { label: "In Production", value: stats.inProduction, icon: Activity, color: "text-secondary", bgColor: "bg-secondary/10" },
    { label: "Ready to Dispatch", value: stats.readyOrOut, icon: Truck, color: "text-success", bgColor: "bg-success/10" },
    { label: "Overdue", value: stats.overdue, icon: AlertCircle, color: "text-destructive", bgColor: "bg-destructive/10" },
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

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
      <>

      {/* KPI Cards */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((s) => (
            <Card key={s.label} className="rounded-2xl border border-border/80 bg-card shadow-card hover:shadow-elevated hover:border-primary/20 transition-all duration-200">
              <CardContent className="p-5">
                <div className={`h-11 w-11 rounded-xl ${s.bgColor} flex items-center justify-center mb-3`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <p className="text-2xl md:text-3xl font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
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
              {overdueOrders.slice(0, 5).map((o) => (
                <div key={o.id} className="flex items-center justify-between p-2 bg-card rounded-lg border">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-semibold whitespace-nowrap">{o.order_no}</span>
                    <span className="text-sm truncate">{o.customer_name}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{o.product_type}</span>
                    <span className="text-xs text-destructive font-semibold whitespace-nowrap">{o.daysOverdue}d overdue</span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/orders/${o.id}`)}>
                      Update
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => {
                      const url = `https://wa.me/91${o.contact_no.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hi ${o.customer_name}, regarding your order ${o.order_no}...`)}`;
                      window.open(url, "_blank");
                    }}>
                      <MessageCircle className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
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
                <div key={o.id} className="flex items-center justify-between p-2 bg-card rounded-lg border">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-semibold">{o.order_no}</span>
                    <span className="text-sm truncate">{o.customer_name}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/orders/${o.id}`)}>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Production Pipeline */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Production Pipeline</h2>
        <Card className="rounded-2xl border border-border/80 shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Stage-wise orders</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
            {pipelineCounts.map((stage, i) => {
              const total = orders.filter(o => o.status !== "Cancelled").length || 1;
              const pct = Math.max(8, (stage.count / total) * 100);
              return (
                <button
                  key={stage.label}
                  onClick={() => {
                    if (stage.statuses.length === 1) {
                      navigate(`/orders?status=${encodeURIComponent(stage.statuses[0])}`);
                    }
                  }}
                  className="flex flex-col items-center w-[64px] flex-shrink-0 group cursor-pointer"
                >
                  <div className={`${stage.color} w-full h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg transition-transform group-hover:scale-105`}>
                    {stage.count}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 text-center">{stage.label}</span>
                </button>
              );
            })}
          </div>
          
        </CardContent>
        </Card>
      </section>

      {/* Balance Due + Recent Activity */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Summary</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-2xl border border-border/80 shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Payment Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Total Balance Due</p>
              <p className="text-3xl font-bold text-destructive mt-1">₹{stats.totalBalanceDue.toLocaleString("en-IN")}</p>
            </div>
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
                    className="w-full text-left px-4 py-2 border-b hover:bg-muted/30 text-sm transition-colors"
                  >
                    <span className="text-muted-foreground">{a.customer}</span>
                    <span className="mx-1">·</span>
                    <span className="font-mono text-xs">{a.orderNo}</span>
                    <span className="mx-1">→</span>
                    <StatusBadge status={a.status} />
                  </button>
                ))
              )}
            </div>
          </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
