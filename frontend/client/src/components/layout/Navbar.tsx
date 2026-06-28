import { useState, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { cn, getInitials } from "@/lib/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Menu, X, LogOut, User, KeyRound, Camera } from "lucide-react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import logoImage from "@assets/stake-logo.png";
import { useAuthStore } from "@/stores/auth";
import { PERM_APPROVE_BLDG_RESERVATIONS } from "@/types";
import { apiRequest, setAccessToken, queryClient } from "@/lib/queryClient";
import { getCroppedImageBlob } from "@/lib/cropImage";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface ProfileForm {
  fname: string;
  lname: string;
  email: string;
  phone: string;
  bio: string;
}

type DialogMode = "form" | "crop";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [, setLocation] = useLocation();
  const { user, setUser } = useAuthStore();
  const [mode, setMode] = useState<DialogMode>("form");
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function revokeAndReset() {
    if (imgSrc) URL.revokeObjectURL(imgSrc);
    setImgSrc(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setCroppedAreaPixels(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function cancelCrop() {
    revokeAndReset();
    setMode("form");
  }

  function handleDialogChange(open: boolean) {
    if (!open) {
      cancelCrop();
      setProfileOpen(false);
    }
  }

  async function handleLogout() {
    try {
      await apiRequest("POST", "/api/auth/logout", { all_devices: false });
    } finally {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
      setLocation("/");
    }
  }

  function handleOpenProfile() {
    if (!user) return;
    setProfileForm({
      fname: user.fname,
      lname: user.lname,
      email: user.email,
      phone: user.phone ?? "",
      bio: user.bio ?? "",
    });
    setMode("form");
    setProfileOpen(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imgSrc) URL.revokeObjectURL(imgSrc);
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setCroppedAreaPixels(null);
    setMode("crop");
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const saveProfileMutation = useMutation({
    mutationFn: (form: ProfileForm) =>
      apiRequest("PUT", `/api/users/${user!.id}`, {
        email: form.email,
        fname: form.fname,
        lname: form.lname,
        active: user!.active,
        force_password_reset: user!.force_password_reset,
        phone: form.phone || null,
        bio: form.bio || null,
        profile_image: user!.profile_image,
      }),
    onSuccess: async (_, form) => {
      setUser({ ...user!, fname: form.fname, lname: form.lname, email: form.email, phone: form.phone || null, bio: form.bio || null });
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Profile updated");
      setProfileOpen(false);
    },
    onError: () => toast.error("Update failed", { description: "Could not save your profile." }),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      if (!imgSrc || !croppedAreaPixels || !user) throw new Error("No image selected");
      const blob = await getCroppedImageBlob(imgSrc, croppedAreaPixels);
      const formData = new FormData();
      formData.append("file", blob, "photo.jpg");
      const res = await apiRequest("POST", `/api/users/photo?user_id=${user.id}`, formData);
      return res.json() as Promise<{ profile_image: string | null }>;
    },
    onSuccess: (updated) => {
      setUser({ ...user!, profile_image: updated.profile_image });
      toast.success("Photo updated");
      cancelCrop();
    },
    onError: (err: unknown) => {
      console.error("[Navbar] Photo upload failed:", err);
      toast.error("Upload failed", { description: "Could not save your photo. Please try again." });
    },
  });

  const initials = user ? getInitials(`${user.fname} ${user.lname}`) : "";

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
                    <ul className="grid w-[400px] gap-3 p-4">
<ListItem href="/stake-info/temple-recommend" title="Temple Recommends" />
                      <ListItem href="/stake-info/sports" title="Stake Sports" />
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

                {user && (
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="bg-transparent font-medium">Leader Portal</NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[400px] gap-3 p-4">
                        <ListItem href="/leader/assignments" title="High Council Assignments" />
                        <ListItem href="/leader/speaking" title="Speaking Schedule" />
                        <ListItem href="/leader/presidency" title="Presidency Assignments" />
                        <ListItem href="/leader/calling-system" title="Stake Calling System" />
                        {(user.permissions & PERM_APPROVE_BLDG_RESERVATIONS) === PERM_APPROVE_BLDG_RESERVATIONS && (
                          <ListItem href="/leader/reservations" title="Building Reservations" />
                        )}
                        <ListItem href="/leader/admin" title="Administration" />
                        <ListItem href="/leader/site-settings" title="Site Settings" />
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                )}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Right side: Theme + Auth + Mobile Hamburger */}
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {user ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  onClick={handleOpenProfile}
                >
                  <User className="h-4 w-4" />
                  {user.fname}
                </Button>
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

      {/* Profile Edit Dialog */}
      <Dialog open={profileOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-[90vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {mode === "crop" ? "Crop Photo" : "Edit Profile"}
            </DialogTitle>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {mode === "crop" ? (
            <>
              <div className="relative w-full" style={{ height: 320 }}>
                <Cropper
                  image={imgSrc!}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="flex items-center gap-3 px-1">
                <Label className="text-xs text-muted-foreground shrink-0">Zoom</Label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={cancelCrop}>
                  Cancel
                </Button>
                <Button
                  disabled={uploadPhotoMutation.isPending || !croppedAreaPixels}
                  onClick={() => uploadPhotoMutation.mutate()}
                >
                  {uploadPhotoMutation.isPending ? "Saving…" : "Crop & Save"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            profileForm && (
              <>
                <div className="flex flex-col items-center gap-2 pt-2">
                  <Avatar className="size-20">
                    {user?.profile_image && (
                      <AvatarImage src={user.profile_image} alt={`${user.fname} ${user.lname}`} />
                    )}
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="size-4" />
                    Change Photo
                  </Button>
                </div>

                <div className="grid gap-6 py-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>First Name</Label>
                      <Input value={profileForm.fname} onChange={(e) => setProfileForm({ ...profileForm, fname: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input value={profileForm.lname} onChange={(e) => setProfileForm({ ...profileForm, lname: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="Optional" />
                  </div>
                  <div className="space-y-2">
                    <Label>Bio</Label>
                    <Textarea
                      value={profileForm.bio}
                      onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                      placeholder="Brief description or notes..."
                      className="min-h-[100px]"
                    />
                  </div>
                  <div className="border-t pt-4">
                    <Link href="/change-password" onClick={() => setProfileOpen(false)}>
                      <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground px-0">
                        <KeyRound className="h-4 w-4" />
                        Change Password
                      </Button>
                    </Link>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button>
                  <Button
                    disabled={saveProfileMutation.isPending}
                    onClick={() => profileForm && saveProfileMutation.mutate(profileForm)}
                  >
                    {saveProfileMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </DialogFooter>
              </>
            )
          )}
        </DialogContent>
      </Dialog>

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
<MobileLink href="/stake-info/temple-recommend" onClick={() => setMobileOpen(false)}>Temple Recommends</MobileLink>
                <MobileLink href="/stake-info/sports" onClick={() => setMobileOpen(false)}>Stake Sports</MobileLink>
                <MobileLink href="/stake-info/reserve" onClick={() => setMobileOpen(false)}>Reserve Building</MobileLink>

                <li className="pt-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">Ward Info</span>
                </li>
                <MobileLink href="/ward-info/map" onClick={() => setMobileOpen(false)}>Boundary Map</MobileLink>
                <MobileLink href="/ward-info/meeting-times" onClick={() => setMobileOpen(false)}>Meeting Times</MobileLink>
                <MobileLink href="/ward-info/bishops" onClick={() => setMobileOpen(false)}>Meet our Bishops</MobileLink>

                {user && (
                  <>
                    <li className="pt-3 pb-1">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">Leader Portal</span>
                    </li>
                    <MobileLink href="/leader/assignments" onClick={() => setMobileOpen(false)}>High Council Assignments</MobileLink>
                    <MobileLink href="/leader/speaking" onClick={() => setMobileOpen(false)}>Speaking Schedule</MobileLink>
                    <MobileLink href="/leader/presidency" onClick={() => setMobileOpen(false)}>Presidency Assignments</MobileLink>
                    <MobileLink href="/leader/calling-system" onClick={() => setMobileOpen(false)}>Calling System</MobileLink>
                    {(user.permissions & PERM_APPROVE_BLDG_RESERVATIONS) === PERM_APPROVE_BLDG_RESERVATIONS && (
                      <MobileLink href="/leader/reservations" onClick={() => setMobileOpen(false)}>Building Reservations</MobileLink>
                    )}
                    <MobileLink href="/leader/admin" onClick={() => setMobileOpen(false)}>Administration</MobileLink>
                    <MobileLink href="/leader/site-settings" onClick={() => setMobileOpen(false)}>Site Settings</MobileLink>
                  </>
                )}

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
