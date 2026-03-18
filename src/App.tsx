import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/orders" element={<OrderHistory />} />
                  <Route path="/orders/new" element={<NewOrder />} />
                  <Route path="/orders/:id" element={<OrderDetail />} />
                  <Route path="/orders/:id/edit" element={<EditOrder />} />
                  <Route path="/import-po" element={<ImportPO />} />
                  <Route path="/production-jobs" element={<ProductionJobs />} />
                  <Route path="/bank-analyser" element={<BankAnalyser />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/customers/:id" element={<CustomerDetail />} />
                  <Route path="/settings" element={<SettingsPage />} />
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
