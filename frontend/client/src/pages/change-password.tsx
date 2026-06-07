import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, setAccessToken } from "@/lib/queryClient";
import { apiErrorStatus, meetsPasswordComplexity } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";

export default function ChangePassword() {
  const [, setLocation] = useLocation();
  const { user, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!meetsPasswordComplexity(form.newPassword)) {
      toast.error("Password requirements not met", {
        description: "Must be 8–128 characters and include at least one uppercase letter, one digit, and one special character.",
      });
      return;
    }
    if (!user) {
      setLocation("/login");
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("PATCH", `/api/users/${user.id}/password`, {
        old_password: form.oldPassword,
        new_password: form.newPassword,
      });

      toast.success("Password changed", { description: "Please log in with your new password." });
      setAccessToken(null);
      setUser(null);
      setLocation("/login");
    } catch (err: unknown) {
      const status = apiErrorStatus(err);
      if (status === 401) {
        toast.error("Session expired", { description: "Please log in again to change your password." });
        setAccessToken(null);
        setUser(null);
        setLocation("/login");
        return;
      } else if (status === 400) {
        toast.error("Error", { description: "Current password is incorrect." });
      } else if (status === 403) {
        toast.error("Not Authorized", { description: "You are not authorized to change this password." });
      } else {
        console.error("[change-password] unexpected error:", err);
        toast.error("Error", { description: "Failed to change password. Please try again." });
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
            <CardTitle className="text-2xl font-serif font-bold">Change Password</CardTitle>
            <CardDescription>
              {user?.force_password_reset
                ? "A password change is required before you can continue."
                : "Update your account password."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="oldPassword">Current Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="oldPassword"
                    name="oldPassword"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9"
                    value={form.oldPassword}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9"
                    value={form.newPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Updating…" : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
