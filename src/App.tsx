import { lazy, Suspense } from "react";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/integrations/supabase/config";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const OrderHistory = lazy(() => import("@/pages/OrderHistory"));
const NewOrder = lazy(() => import("@/pages/NewOrder"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const EditOrder = lazy(() => import("@/pages/EditOrder"));
const Customers = lazy(() => import("@/pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ImportPO = lazy(() => import("@/pages/ImportPO"));
const ProductionJobs = lazy(() => import("@/pages/ProductionJobs"));
const BankAnalyser = lazy(() => import("@/pages/BankAnalyser"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth?.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (isSupabaseConfigured && !auth?.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

function AppContent() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<RouteErrorBoundary route="Dashboard"><Dashboard /></RouteErrorBoundary>} />
                  <Route path="/orders" element={<RouteErrorBoundary route="Orders"><OrderHistory /></RouteErrorBoundary>} />
                  <Route path="/orders/new" element={<RouteErrorBoundary route="New Order"><NewOrder /></RouteErrorBoundary>} />
                  <Route path="/orders/:id" element={<RouteErrorBoundary route="Order Detail"><OrderDetail /></RouteErrorBoundary>} />
                  <Route path="/orders/:id/edit" element={<RouteErrorBoundary route="Edit Order"><EditOrder /></RouteErrorBoundary>} />
                  <Route path="/import-po" element={<RouteErrorBoundary route="Import PO"><ImportPO /></RouteErrorBoundary>} />
                  <Route path="/production-jobs" element={<RouteErrorBoundary route="Production Jobs"><ProductionJobs /></RouteErrorBoundary>} />
                  <Route path="/bank-analyser" element={<RouteErrorBoundary route="Bank Analyser"><BankAnalyser /></RouteErrorBoundary>} />
                  <Route path="/expenses" element={<RouteErrorBoundary route="Expenses"><Expenses /></RouteErrorBoundary>} />
                  <Route path="/attendance" element={<RouteErrorBoundary route="Attendance"><Attendance /></RouteErrorBoundary>} />
                  <Route path="/customers" element={<RouteErrorBoundary route="Customers"><Customers /></RouteErrorBoundary>} />
                  <Route path="/customers/:id" element={<RouteErrorBoundary route="Customer Detail"><CustomerDetail /></RouteErrorBoundary>} />
                  <Route path="/settings" element={<RouteErrorBoundary route="Settings"><SettingsPage /></RouteErrorBoundary>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
