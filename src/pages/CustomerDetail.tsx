import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, IndianRupee, Package } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: customer, isLoading: loadingCustomer, isError: customerError } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      if (!id) throw new Error("Customer id is required");
      const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["customer_orders", id],
    queryFn: async () => {
      if (!customer) return [];
      let q = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (customer.contact_no && customer.contact_no.trim()) {
        q = q.eq("contact_no", customer.contact_no);
      } else {
        q = q.eq("customer_name", customer.name);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!customer,
  });

  if (!id) return null;
  if (customerError && !loadingCustomer) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in text-center py-12">
        <h2 className="text-xl font-semibold text-[#1E293B]">Customer not found</h2>
        <p className="text-muted-foreground">The customer you are looking for may have been deleted or the link is invalid.</p>
        <Button onClick={() => navigate("/customers")} className="bg-[#F97316] hover:bg-[#ea580c] text-white" style={{ backgroundColor: "#F97316" }}>Back to Customers</Button>
      </div>
    );
  }
  if (loadingCustomer || !customer) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const totalSpend = orders.reduce((s, o) => s + Number(o.amount), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/customers")} title="Back to customers"><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Contact</p>
            <a href={`tel:${String(customer.contact_no).replace(/\D/g, "").slice(-10)}`} className="text-lg font-semibold text-[#3B82F6] hover:underline">{customer.contact_no}</a>
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="h-5 w-5 text-[#F97316]" />
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-lg font-semibold">{orders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardContent className="p-4 flex items-center gap-3">
            <IndianRupee className="h-5 w-5 text-[#16A34A]" />
            <div>
              <p className="text-sm text-muted-foreground">Total Spend</p>
              <p className="text-lg font-semibold">₹{totalSpend.toLocaleString("en-IN")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {customer.email && (
        <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Email: <span className="text-foreground">{customer.email}</span></p>
          </CardContent>
        </Card>
      )}

      {customer.gstin && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">GSTIN</p>
          <p className="text-sm font-medium font-mono">{customer.gstin}</p>
        </div>
      )}

      <Card className="shadow-card rounded-2xl border border-[#E5E7EB]">
        <CardHeader className="border-b border-[#F1F5F9]"><CardTitle className="text-sm font-semibold text-[#1E293B]">Orders</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loadingOrders ? (
            <div className="p-8"><Skeleton className="h-32 w-full" /></div>
          ) : orders.length === 0 ? (
            <p className="text-center p-8 text-muted-foreground">No orders found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Order No.</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Order Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b table-row-hover cursor-pointer"
                      onClick={() => navigate(`/orders/${o.id}`)}
                    >
                      <td className="p-3 font-mono text-xs font-semibold">{o.order_no}</td>
                      <td className="p-3">{o.product_type}</td>
                      <td className="p-3">₹{Number(o.amount).toLocaleString("en-IN")}</td>
                      <td className="p-3"><StatusBadge status={o.status} /></td>
                      <td className="p-3 text-muted-foreground">{o.order_date ? format(parseISO(o.order_date), "dd MMM yyyy") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
