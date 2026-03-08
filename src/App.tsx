import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
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
        </p>
      </div>
    </div>
  );
}

/* ── Protected route wrapper ── */
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </AppLayout>
  );
}

/* ── Redirect away from login if already authenticated ── */
function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public auth routes — redirect to dashboard if already logged in */}
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
      </Route>

      {/* Semi-public routes — accessible with or without auth */}
      <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
      <Route path="/auth/callback" element={<Suspense fallback={<PageLoader />}><AuthCallback /></Suspense>} />

      {/* Protected routes — require authentication */}
      <Route element={<RequireAuth />}>
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
      </Route>

      <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
    </Routes>
  );
}

const queryClient = new QueryClient();

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
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
