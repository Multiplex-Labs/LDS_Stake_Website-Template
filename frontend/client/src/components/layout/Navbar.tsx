import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, User } from "lucide-react";
import logoImage from "@assets/stake-logo.png";
import { useAuthStore } from "@/stores/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { user, setUser } = useAuthStore();

  async function handleLogout() {
    await apiRequest("POST", "/api/logout");
    setUser(null);
    queryClient.clear();
    setLocation("/");
  }

  return (
    <>
      <nav className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <img
              src={logoImage}
              alt="Stake Logo"
              className="h-10 w-10 object-contain"
            />
            <div className="flex flex-col">
              <span className="font-serif font-bold text-xl leading-none text-primary">Logan Married</span>
              <span className="text-xs text-muted-foreground tracking-widest uppercase">Student 2nd Stake</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-2">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink asChild className={cn(navigationMenuTriggerStyle(), "bg-transparent font-medium")}>
                    <Link href="/">Home</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink asChild className={cn(navigationMenuTriggerStyle(), "bg-transparent font-medium")}>
                    <Link href="/stake-leadership">Leadership</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent font-medium">Stake Info</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                      <ListItem href="/stake-info/calendar" title="Calendar" />
                      <ListItem href="/stake-info/sports" title="Sports" />
                      <ListItem href="/stake-info/reserve" title="Reserve Building" />
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent font-medium">Ward Info</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4">
                      <ListItem href="/ward-info/map" title="Boundary Map" />
                      <ListItem href="/ward-info/meeting-times" title="Meeting Times" />
                      <ListItem href="/ward-info/bishops" title="Meet our Bishops" />
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuLink asChild className={cn(navigationMenuTriggerStyle(), "bg-transparent font-medium")}>
                    <Link href="/resources">Resources</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>

                <NavigationMenuItem>
                  <NavigationMenuTrigger className="bg-transparent font-medium">Leader Portal</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4">
                      <ListItem href="/leader/assignments" title="High Council Assignments" />
                      <ListItem href="/leader/speaking" title="Speaking Schedule" />
                      <ListItem href="/leader/presidency" title="Presidency Assignments" />
                      <ListItem href="/leader/calling-system" title="Stake Calling System" />
                      <ListItem href="/leader/user-admin" title="User Administration" />
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Right side: Theme + Auth + Mobile Hamburger */}
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {user ? (
              <>
                <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  {user.username}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <Link href="/login">
                <Button variant="default" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
                  Login
                </Button>
              </Link>
            )}
            <button
              className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-72 bg-card shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-serif font-bold text-lg text-primary">Menu</span>
              <button
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-1">
                <MobileLink href="/" onClick={() => setMobileOpen(false)}>Home</MobileLink>
                <MobileLink href="/stake-leadership" onClick={() => setMobileOpen(false)}>Leadership</MobileLink>

                <li className="pt-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">Stake Info</span>
                </li>
                <MobileLink href="/stake-info/calendar" onClick={() => setMobileOpen(false)}>Calendar</MobileLink>
                <MobileLink href="/stake-info/sports" onClick={() => setMobileOpen(false)}>Sports</MobileLink>
                <MobileLink href="/stake-info/reserve" onClick={() => setMobileOpen(false)}>Reserve Building</MobileLink>

                <li className="pt-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">Ward Info</span>
                </li>
                <MobileLink href="/ward-info/map" onClick={() => setMobileOpen(false)}>Boundary Map</MobileLink>
                <MobileLink href="/ward-info/meeting-times" onClick={() => setMobileOpen(false)}>Meeting Times</MobileLink>
                <MobileLink href="/ward-info/bishops" onClick={() => setMobileOpen(false)}>Meet our Bishops</MobileLink>

                <li className="pt-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">Leader Portal</span>
                </li>
                <MobileLink href="/leader/assignments" onClick={() => setMobileOpen(false)}>High Council Assignments</MobileLink>
                <MobileLink href="/leader/speaking" onClick={() => setMobileOpen(false)}>Speaking Schedule</MobileLink>
                <MobileLink href="/leader/presidency" onClick={() => setMobileOpen(false)}>Presidency Assignments</MobileLink>
                <MobileLink href="/leader/calling-system" onClick={() => setMobileOpen(false)}>Calling System</MobileLink>
                <MobileLink href="/leader/user-admin" onClick={() => setMobileOpen(false)}>User Administration</MobileLink>

                <li className="pt-3">
                  <MobileLink href="/resources" onClick={() => setMobileOpen(false)}>Resources</MobileLink>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function ListItem({ href, title, children }: { href: string; title: string; children?: React.ReactNode }) {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          {children && (
            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">{children}</p>
          )}
        </Link>
      </NavigationMenuLink>
    </li>
  );
}

function MobileLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="block rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}
