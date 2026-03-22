import {
  LayoutDashboard, ClipboardList, PlusCircle, Users, Settings, FileUp, Building2, UserCheck, Briefcase, IndianRupee, Printer,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const group1 = [{ title: "Dashboard", url: "/", icon: LayoutDashboard }];
const group2Label = "ORDERS";
const group2 = [
  { title: "Order History", url: "/orders", icon: ClipboardList },
  { title: "New Order", url: "/orders/new", icon: PlusCircle },
  { title: "Import PO", url: "/import-po", icon: FileUp },
  { title: "Production Jobs", url: "/production-jobs", icon: Briefcase },
];
const group3Label = "FINANCE";
const group3 = [
  { title: "Expenses", url: "/expenses", icon: IndianRupee },
  { title: "Bank Analyser", url: "/bank-analyser", icon: Building2 },
];
const group4Label = "OPERATIONS";
const group4 = [
  { title: "Attendance", url: "/attendance", icon: UserCheck },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Settings", url: "/settings", icon: Settings },
];

const groupLabelClass = "text-[9px] text-[#94A3B8] tracking-[0.1em] pt-3 px-4 pb-1";
const activeLinkClass = "border-l-[3px] border-l-[#F97316] bg-[#1E3A5F] text-sidebar-primary font-semibold";

function NavItem({ item, collapsed }: { item: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }; collapsed: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={item.url === "/"}
          className="hover:bg-sidebar-accent/50"
          activeClassName={activeLinkClass}
        >
          <item.icon className="mr-2 h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-sidebar-border">
          <Printer className="h-5 w-5 text-[#F97316] shrink-0" />
          {!collapsed && (
            <span className="font-bold text-sm text-sidebar-primary tracking-tight">Super Printers</span>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {group1.map((item) => (
                <NavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>{group2Label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group2.map((item) => (
                <NavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>{group3Label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group3.map((item) => (
                <NavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className={groupLabelClass}>{group4Label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group4.map((item) => (
                <NavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
