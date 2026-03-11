import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, ClipboardList, PlusCircle, UserCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Home", icon: LayoutDashboard, path: "/" },
  { label: "Orders", icon: ClipboardList, path: "/orders" },
  { label: "New", icon: PlusCircle, path: "/orders/new" },
  { label: "Attendance", icon: UserCheck, path: "/attendance" },
  { label: "Customers", icon: Users, path: "/customers" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E5E7EB] shadow-elevated">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = tab.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative",
                isActive ? "text-[#F97316]" : "text-muted-foreground"
              )}
            >
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b bg-[#F97316]" aria-hidden />}
              <tab.icon className={cn("h-5 w-5", isActive && "text-[#F97316]")} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
