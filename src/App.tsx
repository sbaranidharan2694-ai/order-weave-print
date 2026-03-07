import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const OrderHistory = lazy(() => import("@/pages/OrderHistory"));
const NewOrder = lazy(() => import("@/pages/NewOrder"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const EditOrder = lazy(() => import("@/pages/EditOrder"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ImportPO = lazy(() => import("@/pages/ImportPO"));
const BankAnalyser = lazy(() => import("@/pages/BankAnalyser"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient();

function SetupRequired() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
      <div className="max-w-md rounded-2xl border bg-card p-8 shadow-lg text-center">
        <h1 className="text-xl font-bold text-foreground mb-2">Supabase not configured</h1>
        <p className="text-sm text-muted-foreground mb-4">
          <strong>Using Lovable?</strong> Connect Supabase in Project Settings → Integrations → Supabase. Lovable will inject the URL and key automatically; you don’t need a client ID or .env.
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          <strong>Running locally?</strong> Add a <code className="bg-muted px-1 rounded text-xs">.env</code> file in the project root:
        </p>
        <pre className="text-left text-xs bg-muted p-4 rounded-lg overflow-x-auto mb-4">
          {`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key`}
        </pre>
        <p className="text-xs text-muted-foreground">
          Lovable uses the same names when Supabase is connected. Get values from Supabase Dashboard → Settings → API. Then restart <code className="bg-muted px-1 rounded">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {!isSupabaseConfigured ? (
        <SetupRequired />
      ) : (
      <BrowserRouter>
        <AppLayout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders" element={<OrderHistory />} />
              <Route path="/orders/new" element={<NewOrder />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/orders/:id/edit" element={<EditOrder />} />
              <Route path="/import-po" element={<ImportPO />} />
              <Route path="/bank-analyser" element={<BankAnalyser />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AppLayout>
      </BrowserRouter>
      )}
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
