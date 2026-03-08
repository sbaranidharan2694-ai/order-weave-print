import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

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
const Login = lazy(() => import("@/pages/Login"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));

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
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "1.5rem",
      backgroundColor: "#f1f5f9", fontFamily: "system-ui, sans-serif"
    }}>
      <div style={{
        maxWidth: "480px", width: "100%", borderRadius: "16px",
        border: "1px solid #e2e8f0", backgroundColor: "#ffffff",
        padding: "2rem", boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        textAlign: "center"
      }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🖨️</div>
        <h1 style={{
          fontSize: "1.25rem", fontWeight: "700",
          color: "#1e293b", marginBottom: "0.5rem", margin: "0 0 0.5rem 0"
        }}>
          Super Printers OMS
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.25rem" }}>
          <strong>Supabase is not connected.</strong><br />
          In Lovable: Project Settings → Integrations → Supabase → Connect your project.
          Lovable injects the credentials automatically — no .env file needed.
        </p>
        <pre style={{
          backgroundColor: "#f8fafc", border: "1px solid #e2e8f0",
          borderRadius: "8px", padding: "1rem", textAlign: "left",
          fontSize: "0.72rem", color: "#475569", overflowX: "auto",
          fontFamily: "monospace", margin: 0
        }}>
          {`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key`}
        </pre>
      </div>
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;

  // Allow reset-password route without auth
  const isResetPassword = window.location.pathname === "/reset-password";
  if (isResetPassword) {
    return (
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  if (!user) return <Suspense fallback={<PageLoader />}><Login /></Suspense>;

  return (
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
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!isSupabaseConfigured ? (
          <SetupRequired />
        ) : (
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
