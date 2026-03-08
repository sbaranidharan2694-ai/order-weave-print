import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) throw error;

      // Verify we actually got a session back
      const session = data?.session;
      if (!session) {
        // Fallback: some browsers delay session storage — wait and retry
        await new Promise((r) => setTimeout(r, 500));
        const { data: retryData } = await supabase.auth.getSession();
        if (!retryData?.session) {
          throw new Error("Login succeeded but session could not be established. Please try again.");
        }
      }

      toast.success("Welcome back!");

      // Use replace so back button doesn't return to login
      // Small delay ensures session is persisted to storage before reload
      setTimeout(() => {
        window.location.replace("/");
      }, 300);
    } catch (err: any) {
      const msg = err?.message || "Authentication failed";
      // Provide user-friendly messages for common errors
      if (msg.includes("Invalid login")) {
        toast.error("Invalid email or password. Please try again.");
      } else if (msg.includes("rate") || msg.includes("too many")) {
        toast.error("Too many login attempts. Please wait a moment and try again.");
      } else if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch")) {
        toast.error("Network error. Please check your internet connection and try again.");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error("Please enter your email");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent! Check your email.");
      setMode("login");
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-3xl mb-2">🖨️</div>
          <CardTitle className="text-xl font-bold">
            Super Printers <span className="text-primary">OMS</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Sign in to continue" : "Reset your password"}
          </p>
        </CardHeader>
        <CardContent>
          {mode === "login" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
              <p className="text-center">
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot Password?
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
              <p className="text-center">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}