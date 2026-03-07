import { useState, useMemo } from "react";
import { useCustomers } from "@/hooks/useCustomers";
import { useOrders } from "@/hooks/useOrders";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ExternalLink, Trash2, RotateCcw, PlusCircle, Users, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const formatContact = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const isValidPhone = (phone: string) => /^\d{10}$/.test(phone.replace(/\D/g, ""));

export default function Customers() {
  const { data: customers = [], isLoading } = useCustomers();
  const { data: orders = [] } = useOrders();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", contact_no: "", email: "", gstin: "", address: "" });
  const [addingCustomer, setAddingCustomer] = useState(false);

  // Build a combined customer list from customers table + unique order customer names
  const combinedCustomers = useMemo(() => {
    const customerMap = new Map<string, any>();

    // Start with existing customers
    customers.forEach((c) => {
      const key = c.contact_no.replace(/\D/g, "").slice(-10);
      customerMap.set(key || c.name.toLowerCase(), { ...c, _key: key || c.name.toLowerCase() });
    });

    // Add customers from orders that don't exist in customers table
    orders.forEach((o) => {
      const key = o.contact_no.replace(/\D/g, "").slice(-10);
      const nameKey = o.customer_name.toLowerCase();
      if (!customerMap.has(key) && !customerMap.has(nameKey)) {
        // Check if matching by name
        const existsByName = Array.from(customerMap.values()).find(
          (c) => c.name.toLowerCase() === nameKey
        );
        if (!existsByName) {
          customerMap.set(key || nameKey, {
            id: `virtual-${key || nameKey}`,
            name: o.customer_name,
            contact_no: o.contact_no,
            email: o.email || null,
            total_orders: 0,
            total_spend: 0,
            created_at: o.created_at,
            deleted_at: null,
            gstin: (o as any).gstin || null,
            address: null,
            _virtual: true,
            _key: key || nameKey,
          });
        }
      }
    });

    return Array.from(customerMap.values());
  }, [customers, orders]);

  // Compute real spend from orders — match by contact_no OR customer_name (case-insensitive)
  const customerSpend = useMemo(() => {
    const map: Record<string, { spend: number; count: number; email: string; qtyOrdered: number; qtyPending: number }> = {};
    orders.forEach((o) => {
      const key = o.contact_no.replace(/\D/g, "").slice(-10);
      const nameKey = o.customer_name.toLowerCase();
      // Try to match by phone first, then by name
      const matchKey = key || nameKey;
      if (!map[matchKey]) map[matchKey] = { spend: 0, count: 0, email: "", qtyOrdered: 0, qtyPending: 0 };
      map[matchKey].spend += Number(o.amount) || 0;
      map[matchKey].count += 1;
      map[matchKey].qtyOrdered += Number((o as any).qty_ordered) || o.quantity || 0;
      map[matchKey].qtyPending += Number((o as any).qty_pending) || 0;
      if (o.email && !map[matchKey].email) map[matchKey].email = o.email;

      // Also index by name for cross-matching
      if (key && !map[nameKey]) {
        map[nameKey] = map[matchKey];
      }
    });
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    let list = combinedCustomers.filter((c: any) =>
      tab === "active" ? !c.deleted_at : !!c.deleted_at
    );
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) || c.contact_no.includes(q) || (c.email || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [combinedCustomers, search, tab]);

  const handleDelete = async (id: string) => {
    if (String(id).startsWith("virtual-")) return;
    const { error } = await supabase
      .from("customers")
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) toast.error("Failed: " + error.message);
    else {
      toast.success("Customer archived");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
  };

  const handleRestore = async (id: string) => {
    const { error } = await supabase
      .from("customers")
      .update({ deleted_at: null } as any)
      .eq("id", id);
    if (error) toast.error("Failed: " + error.message);
    else {
      toast.success("Customer restored");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name || !newCustomer.contact_no) {
      toast.error("Name and Contact No. are required");
      return;
    }
    setAddingCustomer(true);
    const { error } = await supabase.from("customers").insert({
      name: newCustomer.name,
      contact_no: newCustomer.contact_no.replace(/\D/g, "").slice(-10),
      email: newCustomer.email || null,
      gstin: newCustomer.gstin || null,
      address: newCustomer.address || null,
    } as any);
    if (error) toast.error("Failed: " + error.message);
    else {
      toast.success("Customer added!");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowAddModal(false);
      setNewCustomer({ name: "", contact_no: "", email: "", gstin: "", address: "" });
    }
    setAddingCustomer(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} customer{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <PlusCircle className="h-4 w-4 mr-1" /> Add Customer
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="rounded-2xl border border-border/80 shadow-card">
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, contact or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" autoComplete="off" />
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card className="rounded-2xl border border-border/80 shadow-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {tab === "active" ? "No customers yet" : "No archived customers"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {tab === "active" ? "Customers are automatically created when you create orders" : "Archived customers will appear here"}
            </p>
            {tab === "active" && <Button onClick={() => setShowAddModal(true)}>Add Customer</Button>}
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border border-border/80 shadow-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Customer Name</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Contact No.</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Total Orders</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Total Spend</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Qty Ordered</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Qty Pending</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const contactKey = c.contact_no.replace(/\D/g, "").slice(-10);
                    const nameKey = c.name.toLowerCase();
                    const realData = customerSpend[contactKey] || customerSpend[nameKey];
                    const realSpend = realData?.spend || 0;
                    const realCount = realData?.count || 0;
                    const realEmail = c.email || realData?.email || "";
                    const hasInvalidPhone = !isValidPhone(c.contact_no);
                    const qtyOrdered = realData?.qtyOrdered || 0;
                    const qtyPending = realData?.qtyPending || 0;
                    const isVirtual = !!(c as any)._virtual;

                    return (
                      <tr key={c.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium text-foreground">
                          <button
                            className="hover:text-primary hover:underline text-left flex items-center gap-1"
                            onClick={() => isVirtual ? null : navigate(`/customers/${c.id}`)}
                          >
                            {c.name}
                            {hasInvalidPhone && (
                              <span className="text-amber-500" aria-label="No valid phone number">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="p-3 text-muted-foreground">{formatContact(c.contact_no)}</td>
                        <td className="p-3 text-muted-foreground">{realEmail || "—"}</td>
                        <td className="p-3 text-foreground font-semibold">{realCount}</td>
                        <td className="p-3 text-foreground">₹{realSpend.toLocaleString("en-IN")}</td>
                        <td className="p-3 text-foreground">{qtyOrdered.toLocaleString("en-IN")}</td>
                        <td className="p-3">
                          {qtyPending > 0 ? (
                            <span className="text-orange-500 font-semibold">{qtyPending.toLocaleString("en-IN")}</span>
                          ) : (
                            <span className="text-status-delivered">✓</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            {!isVirtual && (
                              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate(`/customers/${c.id}`)}>
                                <ExternalLink className="h-3 w-3" /> View
                              </Button>
                            )}
                            {tab === "active" && !isVirtual ? (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <strong>{c.name}</strong> ({c.contact_no})<br />
                                      This customer has {realCount} order(s). Orders will be archived, not deleted.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(c.id)} className="bg-destructive text-destructive-foreground">
                                      Delete Customer
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : tab === "archived" && !isVirtual ? (
                              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => handleRestore(c.id)}>
                                <RotateCcw className="h-3 w-3" /> Restore
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Customer Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Customer Name *</Label><Input value={newCustomer.name} onChange={(e) => setNewCustomer(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Contact No. *</Label><Input value={newCustomer.contact_no} onChange={(e) => setNewCustomer(p => ({ ...p, contact_no: e.target.value }))} placeholder="9876543210" /></div>
            <div><Label>Email</Label><Input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer(p => ({ ...p, email: e.target.value }))} /></div>
            <div><Label>GSTIN</Label><Input value={newCustomer.gstin} onChange={(e) => setNewCustomer(p => ({ ...p, gstin: e.target.value }))} placeholder="15-char GSTIN" maxLength={15} /></div>
            <div><Label>Address</Label><Input value={newCustomer.address} onChange={(e) => setNewCustomer(p => ({ ...p, address: e.target.value }))} placeholder="Full address" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddCustomer} disabled={addingCustomer || !newCustomer.name || !newCustomer.contact_no}>
              {addingCustomer ? "Adding..." : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
