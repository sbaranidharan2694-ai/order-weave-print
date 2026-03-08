import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { QuickStatusModal } from "@/components/QuickStatusModal";
import { Bell, Zap, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrders } from "@/hooks/useOrders";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo, useState } from "react";
import { parseISO, isBefore } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { data: orders = [] } = useOrders();
  const auth = useAuth();
  const [showQuickStatus, setShowQuickStatus] = useState(false);

  const notifications = useMemo(() => {
    const now = new Date();
    const items: { type: string; message: string; orderId: string }[] = [];

    orders.forEach((o) => {
      if (isBefore(parseISO(o.delivery_date), now) && o.status !== "Delivered" && o.status !== "Cancelled") {
        items.push({ type: "overdue", message: `${o.order_no} — overdue (${o.customer_name})`, orderId: o.id });
      }
      if (o.status === "Ready to Dispatch") {
        items.push({ type: "dispatch", message: `${o.order_no} — Ready to Dispatch`, orderId: o.id });
      }
      const bal = Number(o.amount) - Number(o.advance_paid);
      if (o.status === "Delivered" && bal > 0) {
        items.push({ type: "payment", message: `${o.order_no} — Balance ₹${bal.toLocaleString("en-IN")} pending`, orderId: o.id });
      }
    });

    return items;
  }, [orders]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/80 bg-card/95 backdrop-blur px-4 shadow-sm sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hidden md:flex rounded-lg" />
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg text-primary tracking-tight">SUPER</span>
                <span className="font-bold text-lg text-secondary tracking-tight">PRINTERS</span>
                <span className="text-[10px] font-medium text-muted-foreground ml-1 hidden sm:inline">OMS</span>
                <span className="text-[9px] text-muted-foreground/80 ml-1 hidden md:inline" title="Deployment build">{new Date().getFullYear()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setShowQuickStatus(true)}
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Quick Update</span>
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative text-muted-foreground">
                    <Bell className="h-5 w-5" />
                    {notifications.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                        {notifications.length > 9 ? "9+" : notifications.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b">
                    <p className="text-sm font-semibold">Notifications ({notifications.length})</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">All clear! 🎉</p>
                    ) : (
                      notifications.slice(0, 20).map((n, i) => (
                        <NotificationItem key={i} notification={n} />
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xs font-semibold text-primary-foreground">SP</span>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 bg-muted/20">
            {children}
          </main>
        </div>
        <MobileBottomNav />
      </div>
      <QuickStatusModal open={showQuickStatus} onOpenChange={setShowQuickStatus} />
    </SidebarProvider>
  );
}

function NotificationItem({ notification }: { notification: { type: string; message: string; orderId: string } }) {
  const navigate = useNavigate();
  const colors: Record<string, string> = {
    overdue: "text-destructive",
    dispatch: "text-success",
    payment: "text-warning",
  };
  return (
    <button
      onClick={() => navigate(`/orders/${notification.orderId}`)}
      className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b text-sm transition-colors"
    >
      <span className={colors[notification.type] || "text-foreground"}>{notification.message}</span>
    </button>
  );
}
