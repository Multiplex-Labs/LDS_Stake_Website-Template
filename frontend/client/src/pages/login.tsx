import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { setAccessToken, apiRequest } from "@/lib/queryClient";
import { useAuthStore, type AuthUser } from "@/stores/auth";

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ username: "", password: "" });
  const { setUser } = useAuthStore();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Backend uses OAuth2PasswordRequestForm — must be form-encoded
      const body = new URLSearchParams({
        username: formData.username,
        password: formData.password,
      });
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        credentials: "include",
      });
      if (!loginRes.ok) {
        throw new Error("Invalid credentials");
      }
      const { access_token } = await loginRes.json();
      setAccessToken(access_token);

      const meRes = await apiRequest("GET", "/api/auth/me");
      const user: AuthUser = await meRes.json();
      setUser(user);

      toast.success("Login Successful", { description: `Welcome back, ${user.fname}!` });

      if (user.force_password_reset) {
        setLocation("/change-password");
      } else {
        setLocation("/leader/assignments");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("401") || msg === "Invalid credentials") {
        toast.error("Login Failed", { description: "Invalid email or password." });
      } else if (msg.startsWith("5")) {
        toast.error("Service Unavailable", { description: "The login service is temporarily unavailable. Please try again." });
      } else {
        console.error("[login] unexpected error:", err);
        toast.error("Login Failed", { description: "A network error occurred. Please check your connection." });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4 bg-muted/30">
        <Card className="w-full max-w-md border-t-4 border-t-primary shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-serif font-bold">Welcome Back</CardTitle>
            <CardDescription>
              Enter your credentials to access the leader portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    name="username"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-9"
                    value={formData.username}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-9 pr-9"
                    value={formData.password}
                    onChange={handleChange}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    <span className="sr-only">Toggle password visibility</span>
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
