import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";

  // If already logged in, redirect to target or home
  useEffect(() => {
    if (!auth?.isLoading && auth?.user) {
      navigate(from, { replace: true });
    }
  }, [auth?.isLoading, auth?.user, from, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth?.signIn) {
      toast.error("Authentication is not configured.");
      return;
    }
    if (!email.trim() || !password) {
      toast.error("Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await auth.signIn(email.trim(), password);
      if (error) {
        toast.error(error.message || "Login failed");
        setLoading(false);
        return;
      }
      toast.success("Signed in successfully");
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (auth?.isLoading || auth?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center gap-2 mb-2">
            <span className="font-bold text-xl text-primary">SUPER</span>
            <span className="font-bold text-xl text-secondary">PRINTERS</span>
          </div>
          <CardTitle className="text-lg">Sign in to OMS</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your email and password to access the Order Management System.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                className="h-10"
              />
            </div>
            <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Sign in
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Contact your administrator if you don&apos;t have an account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
