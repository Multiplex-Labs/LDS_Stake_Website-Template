import { useState, useMemo, useRef, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, ArrowUpDown, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCroppedImageBlob } from "@/lib/cropImage";
import { getInitials, fullName } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { ApiUser, ApiCalling } from "@/types";

type SortKey = "name" | "active" | "email";
type SortConfig = { key: SortKey; direction: "asc" | "desc" } | null;
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface EditForm {
  fname: string;
  lname: string;
  email: string;
  phone: string;
  bio: string;
  active: boolean;
}

interface AddWizardForm {
  fname: string;
  lname: string;
  email: string;
  phone: string;
  bio: string;
  password: string;
  confirmPassword: string;
}

interface AddWizardState {
  step: WizardStep;
  form: AddWizardForm;
  errors: {
    fname?: string;
    lname?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  };
  callingId: number | "";
  slotNumber: number | "";
  photo: { blob: Blob; previewUrl: string } | null;
}

const INITIAL_WIZARD_STATE: AddWizardState = {
  step: 1,
  form: { fname: "", lname: "", email: "", phone: "", bio: "", password: "", confirmPassword: "" },
  errors: {},
  callingId: "",
  slotNumber: "",
  photo: null,
};

const STEP_TITLES: Record<WizardStep, string> = {
  1: "Basic Info",
  2: "Bio",
  3: "Password",
  4: "Assign Calling",
  5: "Profile Photo",
  6: "Review",
};

export function UserAdminContent() {
  // --- Queries ---
  const { data: users = [], isLoading, isError } = useQuery<ApiUser[]>({
    queryKey: ["/api/users/"],
  });
  const { data: callings = [] } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const currentUserId = useAuthStore((s) => s.user?.id);
  const activeCount = useMemo(() => users.filter((u) => u.active).length, [users]);

  // --- Table state ---
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [confirmTarget, setConfirmTarget] = useState<ApiUser | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<ApiUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<ApiUser | null>(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: "", confirm: "" });
  const [resetPasswordErrors, setResetPasswordErrors] = useState<{ password?: string; confirm?: string }>({});

  // --- Edit dialog state ---
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editCallingId, setEditCallingId] = useState<number | "">("");
  const [editSlotNumber, setEditSlotNumber] = useState<number | "">("");

  // --- Edit crop state ---
  const [cropMode, setCropMode] = useState(false);
  const [imgSrc, setImgSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Add user wizard state ---
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addWizard, setAddWizard] = useState<AddWizardState>(INITIAL_WIZARD_STATE);

  // --- Wizard Step 5 crop state ---
  const [addPhotoCropView, setAddPhotoCropView] = useState(false);
  const [addImgSrc, setAddImgSrc] = useState<string | null>(null);
  const [addCrop, setAddCrop] = useState({ x: 0, y: 0 });
  const [addZoom, setAddZoom] = useState(1);
  const [addCroppedAreaPixels, setAddCroppedAreaPixels] = useState<Area | null>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // --- Memos ---

  const occupiedSlotsMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const user of users) {
      for (const uc of user.callings ?? []) {
        if (!map.has(uc.calling_id)) map.set(uc.calling_id, new Set());
        map.get(uc.calling_id)!.add(uc.slot_number);
      }
    }
    return map;
  }, [users]);

  const editingUserCallings = useMemo(
    () => (editingUser ? (users.find((u) => u.id === editingUser.id)?.callings ?? []) : []),
    [editingUser, users],
  );

  const filteredUsers = useMemo(() => {
    return users
      .filter((user) => {
        const fullName = `${user.fname} ${user.lname}`.toLowerCase();
        const lower = searchTerm.toLowerCase();
        return fullName.includes(lower) || user.email.toLowerCase().includes(lower);
      })
      .sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;
        let va = "", vb = "";
        if (key === "name") { va = `${a.fname} ${a.lname}`; vb = `${b.fname} ${b.lname}`; }
        else if (key === "active") { va = a.active ? "Active" : "Inactive"; vb = b.active ? "Active" : "Inactive"; }
        else { va = a.email; vb = b.email; }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === "asc" ? cmp : -cmp;
      });
  }, [users, searchTerm, sortConfig]);

  // --- Helpers ---

  function getFreeSlots(callingId: number, maxSlots: number): number[] {
    const occupied = occupiedSlotsMap.get(callingId) ?? new Set<number>();
    return Array.from({ length: maxSlots }, (_, i) => i + 1).filter((s) => !occupied.has(s));
  }

  const editSelectedCalling = callings.find((c) => c.id === editCallingId);
  const editFreeSlots = editSelectedCalling ? getFreeSlots(editSelectedCalling.id, editSelectedCalling.max_slots) : [];
  const editCanAdd =
    !!editSelectedCalling &&
    editFreeSlots.length > 0 &&
    (editSelectedCalling.max_slots === 1 || editSlotNumber !== "");

  const addSelectedCalling = callings.find((c) => c.id === addWizard.callingId);
  const addFreeSlots = addSelectedCalling ? getFreeSlots(addSelectedCalling.id, addSelectedCalling.max_slots) : [];

  // --- Edit crop helpers ---

  function releaseCropState() {
    if (imgSrc) URL.revokeObjectURL(imgSrc);
    setImgSrc("");
    setCropMode(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const onAddCropComplete = useCallback((_: Area, pixels: Area) => {
    setAddCroppedAreaPixels(pixels);
  }, []);

  // --- Wizard validators ---

  function validateStep1(form: AddWizardForm) {
    const errors: AddWizardState["errors"] = {};
    if (!form.fname.trim()) errors.fname = "First name is required";
    if (!form.lname.trim()) errors.lname = "Last name is required";
    if (!form.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = "Enter a valid email address";
    }
    return errors;
  }

  function validateStep3(form: AddWizardForm) {
    const errors: AddWizardState["errors"] = {};
    if (!form.password) errors.password = "Password is required";
    else if (form.password.length < 8) errors.password = "Minimum 8 characters";
    if (form.password !== form.confirmPassword) errors.confirmPassword = "Passwords do not match";
    return errors;
  }

  // --- Wizard step navigation ---

  function advanceStep() {
    const { step, form } = addWizard;
    let errors: AddWizardState["errors"] = {};
    if (step === 1) errors = validateStep1(form);
    else if (step === 3) errors = validateStep3(form);
    if (Object.keys(errors).length > 0) {
      setAddWizard((w) => ({ ...w, errors }));
      return;
    }
    setAddWizard((w) => ({ ...w, step: (w.step + 1) as WizardStep, errors: {} }));
  }

  function skipStep() {
    setAddWizard((w) => ({ ...w, step: (w.step + 1) as WizardStep }));
  }

  function backStep() {
    setAddWizard((w) => ({ ...w, step: (w.step - 1) as WizardStep, errors: {} }));
  }

  function releaseAddCropState() {
    if (addImgSrc) URL.revokeObjectURL(addImgSrc);
    setAddImgSrc(null);
    setAddPhotoCropView(false);
    setAddCrop({ x: 0, y: 0 });
    setAddZoom(1);
    setAddCroppedAreaPixels(null);
    if (addFileInputRef.current) addFileInputRef.current.value = "";
  }

  // --- Mutations ---

  const toggleStatusMutation = useMutation({
    mutationFn: (user: ApiUser) =>
      apiRequest("PUT", `/api/users/${user.id}`, {
        email: user.email,
        force_password_reset: user.force_password_reset,
        fname: user.fname,
        lname: user.lname,
        active: !user.active,
        phone: user.phone,
        bio: user.bio,
        profile_image: user.profile_image,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Status Updated");
    },
    onError: () => toast.error("Update Failed", { description: "Could not update user status." }),
  });

  const saveEditMutation = useMutation({
    mutationFn: ({ user, form }: { user: ApiUser; form: EditForm }) =>
      apiRequest("PUT", `/api/users/${user.id}`, {
        email: form.email,
        force_password_reset: user.force_password_reset,
        fname: form.fname,
        lname: form.lname,
        active: form.active,
        phone: form.phone || null,
        bio: form.bio || null,
        profile_image: user.profile_image,
      }),
    onSuccess: (_, { form }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Profile Updated", { description: `${form.fname} ${form.lname} has been saved.` });
      handleCloseEdit();
    },
    onError: () => toast.error("Update Failed", { description: "Could not save changes." }),
  });

  const removeCallingMutation = useMutation({
    mutationFn: ({ callingId, slotNumber }: { callingId: number; slotNumber: number }) =>
      apiRequest("DELETE", `/api/callings/${callingId}/${slotNumber}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Calling removed");
    },
    onError: () => toast.error("Failed to remove calling"),
  });

  const assignCallingMutation = useMutation({
    mutationFn: ({ callingId, slotNumber, userId }: { callingId: number; slotNumber: number; userId: number }) =>
      apiRequest("PUT", `/api/callings/${callingId}/${slotNumber}`, { user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Calling assigned");
      setEditCallingId("");
      setEditSlotNumber("");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("409")) {
        toast.error("User already has a calling", { description: "A person can only hold one calling at a time." });
      } else if (msg.startsWith("403")) {
        toast.error("Permission denied", { description: "MANAGE_CALLINGS permission required." });
      } else if (msg.startsWith("400")) {
        toast.error("Slot unavailable", { description: "That slot was just taken. Please select another." });
      } else {
        toast.error("Failed to assign calling");
      }
    },
  });

  type CreateUserVars = AddWizardForm & {
    callingId: number | "";
    slotNumber: number | "";
    photo: { blob: Blob; previewUrl: string } | null;
  };

  const createUserMutation = useMutation({
    mutationFn: async (vars: CreateUserVars) => {
      const res = await apiRequest("POST", "/api/users/", {
        email: vars.email,
        force_password_reset: true,
        fname: vars.fname,
        lname: vars.lname,
        active: true,
        phone: vars.phone || null,
        bio: vars.bio || null,
        profile_image: null,
        password: vars.password,
      });
      return res.json() as Promise<ApiUser>;
    },
    onSuccess: async (newUser, vars) => {
      const { callingId, slotNumber, photo } = vars;
      const callingForSlot = callings.find((c) => c.id === callingId);

      const results = await Promise.allSettled([
        photo
          ? (async () => {
              const formData = new FormData();
              formData.append("file", photo.blob, "photo.jpg");
              await apiRequest("POST", `/api/users/photo?user_id=${newUser.id}`, formData);
            })()
          : Promise.resolve(),
        callingId !== ""
          ? apiRequest(
              "PUT",
              `/api/callings/${callingId}/${callingForSlot?.max_slots === 1 ? 1 : Number(slotNumber)}`,
              { user_id: newUser.id },
            )
          : Promise.resolve(),
      ]);

      if (results[0].status === "rejected") {
        toast.warning("User created, but photo upload failed — add it via Edit");
      }
      if (results[1].status === "rejected") {
        toast.warning("User created, but calling assignment failed — assign it via Edit");
      }

      if (photo) URL.revokeObjectURL(photo.previewUrl);
      releaseAddCropState();
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("User Created", { description: `${newUser.fname} ${newUser.lname} has been added.` });
      setIsAddingUser(false);
      setAddWizard(INITIAL_WIZARD_STATE);
    },
    onError: () => toast.error("Create Failed", { description: "Could not create user. Email may already be in use." }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ user, newPassword }: { user: ApiUser; newPassword: string }) =>
      apiRequest("PATCH", `/api/users/${user.id}/password`, { new_password: newPassword }),
    onSuccess: (_, { user }) => {
      toast.success("Password Reset", {
        description: `${user.fname} will be prompted to set a new password on next login.`,
      });
      setResetPasswordUser(null);
      setResetPasswordForm({ password: "", confirm: "" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("401") || msg.startsWith("403")) {
        toast.error("Session Expired", { description: "Log out and back in, then try again." });
      } else {
        toast.error("Reset Failed", { description: "Could not reset password." });
      }
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("User Deleted");
      setDeleteConfirmUser(null);
      handleCloseEdit();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("400")) {
        toast.error("Cannot Delete User", { description: msg.replace(/^\d+:\s*/, "") });
      } else {
        toast.error("Delete Failed", { description: "Could not delete user." });
      }
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ blob, userId }: { blob: Blob; userId: number }) => {
      const formData = new FormData();
      formData.append("file", blob, "photo.jpg");
      return apiRequest("POST", `/api/users/photo?user_id=${userId}`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Photo updated");
      releaseCropState();
    },
    onError: () => toast.error("Upload Failed", { description: "Could not save photo. Please try again." }),
  });

  // --- Handlers ---

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev?.key === key && prev.direction === "asc"
        ? { key, direction: "desc" }
        : { key, direction: "asc" }
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.length === filteredUsers.length ? [] : filteredUsers.map((u) => u.id)
    );
  };

  const handleOpenEdit = (user: ApiUser) => {
    setEditingUser(user);
    setEditForm({
      fname: user.fname,
      lname: user.lname,
      email: user.email,
      phone: user.phone ?? "",
      bio: user.bio ?? "",
      active: user.active,
    });
    setEditCallingId("");
    setEditSlotNumber("");
  };

  const handleCloseEdit = () => {
    releaseCropState();
    setEditingUser(null);
    setEditForm(null);
    setEditCallingId("");
    setEditSlotNumber("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imgSrc) URL.revokeObjectURL(imgSrc);
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropMode(true);
  };

  const handleCancelCrop = () => {
    releaseCropState();
  };

  const handleConfirmCrop = async () => {
    if (!croppedAreaPixels || !editingUser) return;
    let blob: Blob;
    try {
      blob = await getCroppedImageBlob(imgSrc, croppedAreaPixels);
    } catch {
      toast.error("Could not process image", { description: "Please try a different photo." });
      return;
    }
    uploadPhotoMutation.mutate({ blob, userId: editingUser.id });
  };

  const handleCloseAddUser = (open: boolean) => {
    if (!open) {
      if (addWizard.photo) URL.revokeObjectURL(addWizard.photo.previewUrl);
      releaseAddCropState();
      setAddWizard(INITIAL_WIZARD_STATE);
      setIsAddingUser(false);
    }
  };

  const getStatusBadge = (active: boolean) => (active ? "badge-success" : "badge-error");

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-destructive">Failed to load users. Please refresh.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
        <div className="flex justify-between items-center mb-6 gap-4">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email"
              className="pl-10 h-10 bg-background border-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 gap-2 border-input text-foreground bg-background hover:bg-accent hover:text-accent-foreground">
                  Sort by
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Sort Columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleSort("name")}>Name</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("active")}>Status</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSort("email")}>Email</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button className="h-10 gap-2 shadow-sm" onClick={() => setIsAddingUser(true)}>
              Add User
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-border">
                <TableHead className="w-[50px] pl-4">
                  <Checkbox
                    checked={selectedIds.length === filteredUsers.length && filteredUsers.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-1">
                    User
                    {sortConfig?.key === "name" && <ArrowUpDown className="h-3 w-3" />}
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground" onClick={() => handleSort("active")}>
                  <div className="flex items-center gap-1">
                    Status
                    {sortConfig?.key === "active" && <ArrowUpDown className="h-3 w-3" />}
                  </div>
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Callings
                </TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4"><div className="skeleton h-4 w-4 rounded" /></TableCell>
                    <TableCell><div className="skeleton h-4 w-40 rounded" /></TableCell>
                    <TableCell><div className="skeleton h-4 w-16 rounded" /></TableCell>
                    <TableCell><div className="skeleton h-4 w-32 rounded" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : filteredUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/50 group border-border">
                  <TableCell className="pl-4">
                    <Checkbox
                      checked={selectedIds.includes(user.id)}
                      onCheckedChange={() =>
                        setSelectedIds((prev) =>
                          prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 py-1">
                      <Avatar className="h-9 w-9 bg-primary text-primary-foreground">
                        <AvatarImage src={user.profile_image ?? undefined} alt={`${user.fname} ${user.lname}`} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                          {getInitials(`${user.fname} ${user.lname}`)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm text-foreground">{user.fname} {user.lname}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`badge text-xs ${getStatusBadge(user.active)}`}>
                      {user.active ? "Active" : "Disabled"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">
                    {user.callings?.map((c) => callings.find((cal) => cal.id === c.calling_id)?.name).filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-2">
                      {user.active && (user.id === currentUserId || activeCount <= 1) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button variant="outline" size="sm" className="h-8 text-xs font-medium" disabled>
                                Deactivate
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {user.id === currentUserId
                              ? "Cannot deactivate your own account"
                              : "Cannot deactivate the last active user"}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium"
                          disabled={toggleStatusMutation.isPending}
                          onClick={() => user.active ? setConfirmTarget(user) : toggleStatusMutation.mutate(user)}
                        >
                          {user.active ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-medium"
                        onClick={() => handleOpenEdit(user)}
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) handleCloseEdit(); }}>
          <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {cropMode ? "Crop Photo" : "Edit User Profile"}
              </DialogTitle>
            </DialogHeader>

            {editingUser && editForm && (
              <>
                {cropMode ? (
                  <div className="py-4 space-y-4">
                    <div className="relative h-72 w-full rounded-lg overflow-hidden bg-muted">
                      <Cropper
                        image={imgSrc}
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
                      <Button variant="outline" onClick={handleCancelCrop} disabled={uploadPhotoMutation.isPending}>
                        Cancel
                      </Button>
                      <Button onClick={handleConfirmCrop} disabled={uploadPhotoMutation.isPending}>
                        {uploadPhotoMutation.isPending ? "Uploading…" : "Use Photo"}
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-6 py-4">
                      {/* Photo upload */}
                      <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16 bg-primary text-primary-foreground shrink-0">
                          <AvatarImage src={editingUser.profile_image ?? undefined} alt={`${editingUser.fname} ${editingUser.lname}`} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-lg font-medium">
                            {getInitials(`${editingUser.fname} ${editingUser.lname}`)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Camera className="size-4" />
                            Upload Photo
                          </Button>
                          <p className="text-xs text-muted-foreground">JPG, PNG, WebP · max 5 MB</p>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </div>

                      <Separator />

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>First Name</Label>
                          <Input value={editForm.fname} onChange={(e) => setEditForm({ ...editForm, fname: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Last Name</Label>
                          <Input value={editForm.lname} onChange={(e) => setEditForm({ ...editForm, lname: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Optional" />
                      </div>
                      <div className="space-y-2">
                        <Label>Bio</Label>
                        <Textarea
                          value={editForm.bio}
                          onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                          placeholder="Brief description or notes..."
                          className="min-h-[100px]"
                        />
                      </div>

                      <Separator />

                      {/* Callings Section */}
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold">Callings</Label>

                        {editingUserCallings.length > 0 ? (
                          <div className="space-y-1.5">
                            {editingUserCallings.map((uc) => (
                              <div key={uc.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-muted/30">
                                <span className="text-foreground">
                                  {callings.find((c) => c.id === uc.calling_id)?.name ?? "Unknown"}
                                  {(callings.find((c) => c.id === uc.calling_id)?.max_slots ?? 1) > 1 && (
                                    <span className="ml-1.5 text-muted-foreground">· Slot {uc.slot_number}</span>
                                  )}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  disabled={removeCallingMutation.isPending}
                                  onClick={() => removeCallingMutation.mutate({ callingId: uc.calling_id, slotNumber: uc.slot_number })}
                                >
                                  <X className="size-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No callings assigned.</p>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Select
                            value={editCallingId === "" ? "" : String(editCallingId)}
                            onValueChange={(v) => { setEditCallingId(Number(v)); setEditSlotNumber(""); }}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Add a calling…" />
                            </SelectTrigger>
                            <SelectContent>
                              {callings.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {editSelectedCalling && editSelectedCalling.max_slots > 1 && (
                            <Select
                              value={editSlotNumber === "" ? "" : String(editSlotNumber)}
                              onValueChange={(v) => setEditSlotNumber(Number(v))}
                              disabled={editFreeSlots.length === 0}
                            >
                              <SelectTrigger className="w-[110px]">
                                <SelectValue placeholder={editFreeSlots.length === 0 ? "No slots" : "Slot…"} />
                              </SelectTrigger>
                              <SelectContent>
                                {editFreeSlots.map((s) => (
                                  <SelectItem key={s} value={String(s)}>Slot {s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!editCanAdd || assignCallingMutation.isPending || removeCallingMutation.isPending}
                            onClick={() => {
                              if (!editSelectedCalling || !editingUser) return;
                              const slot = editSelectedCalling.max_slots === 1 ? 1 : Number(editSlotNumber);
                              assignCallingMutation.mutate({ callingId: editSelectedCalling.id, slotNumber: slot, userId: editingUser.id });
                            }}
                          >
                            Add
                          </Button>
                        </div>

                        {editSelectedCalling && editFreeSlots.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            {editSelectedCalling.max_slots === 1
                              ? "This calling is already filled."
                              : "All slots for this calling are occupied."}
                          </p>
                        )}
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex gap-2">
                        {editingUser && (editingUser.id === currentUserId || activeCount <= 1) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button variant="destructive" size="sm" disabled>
                                  Delete User
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {editingUser.id === currentUserId
                                ? "Cannot delete your own account"
                                : "Cannot delete the last active user"}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => editingUser && setDeleteConfirmUser(editingUser)}
                          >
                            Delete User
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setResetPasswordForm({ password: "", confirm: "" });
                            setResetPasswordErrors({});
                            setResetPasswordUser(editingUser);
                          }}
                        >
                          Reset Password
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={handleCloseEdit}>Cancel</Button>
                        <Button
                          disabled={saveEditMutation.isPending}
                          onClick={() => editingUser && editForm && saveEditMutation.mutate({ user: editingUser, form: editForm })}
                        >
                          {saveEditMutation.isPending ? "Saving…" : "Save Changes"}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Add User Wizard Dialog */}
        <Dialog open={isAddingUser} onOpenChange={handleCloseAddUser}>
          <DialogContent className="max-w-[90vw] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                Step {addWizard.step} of 6 — {STEP_TITLES[addWizard.step]}
              </DialogTitle>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${(addWizard.step / 6) * 100}%` }}
                />
              </div>
            </DialogHeader>

            {/* Step 1: Basic Info */}
            {addWizard.step === 1 && (
              <>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>First Name <span className="text-destructive">*</span></Label>
                      <Input
                        value={addWizard.form.fname}
                        onChange={(e) => setAddWizard((w) => ({
                          ...w,
                          form: { ...w.form, fname: e.target.value },
                          errors: { ...w.errors, fname: undefined },
                        }))}
                        placeholder="John"
                      />
                      {addWizard.errors.fname && (
                        <p className="text-xs text-destructive">{addWizard.errors.fname}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Last Name <span className="text-destructive">*</span></Label>
                      <Input
                        value={addWizard.form.lname}
                        onChange={(e) => setAddWizard((w) => ({
                          ...w,
                          form: { ...w.form, lname: e.target.value },
                          errors: { ...w.errors, lname: undefined },
                        }))}
                        placeholder="Doe"
                      />
                      {addWizard.errors.lname && (
                        <p className="text-xs text-destructive">{addWizard.errors.lname}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email <span className="text-destructive">*</span></Label>
                    <Input
                      type="email"
                      value={addWizard.form.email}
                      onChange={(e) => setAddWizard((w) => ({
                        ...w,
                        form: { ...w.form, email: e.target.value },
                        errors: { ...w.errors, email: undefined },
                      }))}
                      placeholder="john@example.com"
                    />
                    {addWizard.errors.email && (
                      <p className="text-xs text-destructive">{addWizard.errors.email}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input
                      value={addWizard.form.phone}
                      onChange={(e) => setAddWizard((w) => ({ ...w, form: { ...w.form, phone: e.target.value } }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <Button onClick={advanceStep}>Next</Button>
                </div>
              </>
            )}

            {/* Step 2: Bio */}
            {addWizard.step === 2 && (
              <>
                <div className="py-4">
                  <div className="space-y-1.5">
                    <Label>Bio</Label>
                    <Textarea
                      value={addWizard.form.bio}
                      onChange={(e) => setAddWizard((w) => ({ ...w, form: { ...w.form, bio: e.target.value } }))}
                      placeholder="Brief description or notes..."
                      className="min-h-[120px]"
                    />
                  </div>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="outline" onClick={backStep}>Back</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={skipStep}>Skip</Button>
                    <Button onClick={advanceStep}>Next</Button>
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Password */}
            {addWizard.step === 3 && (
              <>
                <div className="grid gap-4 py-4">
                  <div className="space-y-1.5">
                    <Label>Password <span className="text-destructive">*</span></Label>
                    <Input
                      type="password"
                      value={addWizard.form.password}
                      onChange={(e) => setAddWizard((w) => ({
                        ...w,
                        form: { ...w.form, password: e.target.value },
                        errors: { ...w.errors, password: undefined },
                      }))}
                      placeholder="••••••••"
                    />
                    {addWizard.errors.password && (
                      <p className="text-xs text-destructive">{addWizard.errors.password}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirm Password <span className="text-destructive">*</span></Label>
                    <Input
                      type="password"
                      value={addWizard.form.confirmPassword}
                      onChange={(e) => setAddWizard((w) => ({
                        ...w,
                        form: { ...w.form, confirmPassword: e.target.value },
                        errors: { ...w.errors, confirmPassword: undefined },
                      }))}
                      placeholder="••••••••"
                    />
                    {addWizard.errors.confirmPassword && (
                      <p className="text-xs text-destructive">{addWizard.errors.confirmPassword}</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="outline" onClick={backStep}>Back</Button>
                  <Button onClick={advanceStep}>Next</Button>
                </div>
              </>
            )}

            {/* Step 4: Assign Calling */}
            {addWizard.step === 4 && (
              <>
                <div className="py-4 space-y-3">
                  <div className="flex gap-2">
                    <Select
                      value={addWizard.callingId === "" ? "" : String(addWizard.callingId)}
                      onValueChange={(v) => setAddWizard((w) => ({ ...w, callingId: Number(v), slotNumber: "" }))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select calling…" />
                      </SelectTrigger>
                      <SelectContent>
                        {callings.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {addSelectedCalling && addSelectedCalling.max_slots > 1 && (
                      <Select
                        value={addWizard.slotNumber === "" ? "" : String(addWizard.slotNumber)}
                        onValueChange={(v) => setAddWizard((w) => ({ ...w, slotNumber: Number(v) }))}
                        disabled={addFreeSlots.length === 0}
                      >
                        <SelectTrigger className="w-[110px]">
                          <SelectValue placeholder={addFreeSlots.length === 0 ? "No slots" : "Slot…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {addFreeSlots.map((s) => (
                            <SelectItem key={s} value={String(s)}>Slot {s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {addSelectedCalling && addFreeSlots.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {addSelectedCalling.max_slots === 1
                        ? "This calling is already filled."
                        : "All slots for this calling are occupied."}
                    </p>
                  )}
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="outline" onClick={backStep}>Back</Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setAddWizard((w) => ({ ...w, step: (w.step + 1) as WizardStep, callingId: "", slotNumber: "" }))}
                    >
                      Skip
                    </Button>
                    <Button onClick={advanceStep}>Next</Button>
                  </div>
                </div>
              </>
            )}

            {/* Step 5: Profile Photo */}
            {addWizard.step === 5 && (
              <>
                {addPhotoCropView ? (
                  <div className="py-4 space-y-4">
                    <div className="relative h-72 w-full rounded-lg overflow-hidden bg-muted">
                      <Cropper
                        image={addImgSrc!}
                        crop={addCrop}
                        zoom={addZoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setAddCrop}
                        onZoomChange={setAddZoom}
                        onCropComplete={onAddCropComplete}
                      />
                    </div>
                    <div className="flex items-center gap-3 px-1">
                      <Label className="text-xs text-muted-foreground shrink-0">Zoom</Label>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.01}
                        value={addZoom}
                        onChange={(e) => setAddZoom(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <Button variant="outline" onClick={releaseAddCropState}>Cancel</Button>
                      <Button
                        onClick={async () => {
                          if (!addImgSrc || !addCroppedAreaPixels) return;
                          let blob: Blob;
                          try {
                            blob = await getCroppedImageBlob(addImgSrc, addCroppedAreaPixels);
                          } catch {
                            toast.error("Could not process image", { description: "Please try a different photo." });
                            return;
                          }
                          const previewUrl = URL.createObjectURL(blob);
                          if (addWizard.photo) URL.revokeObjectURL(addWizard.photo.previewUrl);
                          setAddWizard((w) => ({ ...w, photo: { blob, previewUrl } }));
                          releaseAddCropState();
                        }}
                      >
                        Crop &amp; Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="py-6 flex flex-col items-center gap-4">
                      <Avatar className="h-24 w-24">
                        <AvatarImage src={addWizard.photo?.previewUrl} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-medium">
                          {getInitials(`${addWizard.form.fname} ${addWizard.form.lname}`)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-center space-y-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => addFileInputRef.current?.click()}
                        >
                          <Camera className="size-4" />
                          {addWizard.photo ? "Change Photo" : "Choose Photo"}
                        </Button>
                        <p className="text-xs text-muted-foreground">JPG, PNG, WebP · max 5 MB</p>
                      </div>
                      <input
                        ref={addFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (addImgSrc) URL.revokeObjectURL(addImgSrc);
                          setAddImgSrc(URL.createObjectURL(file));
                          setAddCrop({ x: 0, y: 0 });
                          setAddZoom(1);
                          setAddCroppedAreaPixels(null);
                          setAddPhotoCropView(true);
                        }}
                      />
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <Button variant="outline" onClick={backStep}>Back</Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (addWizard.photo) URL.revokeObjectURL(addWizard.photo.previewUrl);
                            setAddWizard((w) => ({ ...w, step: (w.step + 1) as WizardStep, photo: null }));
                          }}
                        >
                          Skip
                        </Button>
                        {addWizard.photo && (
                          <Button onClick={advanceStep}>Next</Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Step 6: Review */}
            {addWizard.step === 6 && (
              <>
                <div className="py-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 shrink-0">
                      <AvatarImage src={addWizard.photo?.previewUrl} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-lg font-medium">
                        {getInitials(`${addWizard.form.fname} ${addWizard.form.lname}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-foreground">
                        {addWizard.form.fname} {addWizard.form.lname}
                      </p>
                      <p className="text-sm text-muted-foreground">{addWizard.form.email}</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-24 shrink-0">Phone</span>
                      <span className="text-foreground">{addWizard.form.phone || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-24 shrink-0">Bio</span>
                      <span className="text-foreground">{addWizard.form.bio || "—"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-24 shrink-0">Calling</span>
                      <span className="text-foreground">
                        {addSelectedCalling
                          ? addSelectedCalling.max_slots > 1
                            ? `${addSelectedCalling.name} · Slot ${addWizard.slotNumber}`
                            : addSelectedCalling.name
                          : "—"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-24 shrink-0">Photo</span>
                      <span className="text-foreground">{addWizard.photo ? "✓ Added" : "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-2 border-t">
                  <Button variant="outline" onClick={backStep}>Back</Button>
                  <Button
                    onClick={() => createUserMutation.mutate({
                      ...addWizard.form,
                      callingId: addWizard.callingId,
                      slotNumber: addWizard.slotNumber,
                      photo: addWizard.photo,
                    })}
                    disabled={createUserMutation.isPending}
                  >
                    {createUserMutation.isPending ? "Creating…" : "Create User"}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirm Delete Dialog */}
        <Dialog open={deleteConfirmUser != null} onOpenChange={(open) => { if (!open) setDeleteConfirmUser(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete {deleteConfirmUser?.fname} {deleteConfirmUser?.lname}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will permanently remove their account, callings, and all associated data. This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmUser(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteUserMutation.isPending}
                onClick={() => {
                  if (!deleteConfirmUser) return;
                  deleteUserMutation.mutate(deleteConfirmUser.id);
                }}
              >
                {deleteUserMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog
          open={resetPasswordUser != null}
          onOpenChange={(open) => {
            if (!open) {
              setResetPasswordUser(null);
              setResetPasswordForm({ password: "", confirm: "" });
              setResetPasswordErrors({});
            }
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                Reset Password — {resetPasswordUser ? fullName(resetPasswordUser) : ""}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              They will be required to change their password on next login.
            </p>
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={resetPasswordForm.password}
                  onChange={(e) => {
                    setResetPasswordForm((f) => ({ ...f, password: e.target.value }));
                    setResetPasswordErrors((err) => ({ ...err, password: undefined }));
                  }}
                />
                {resetPasswordErrors.password && (
                  <p className="text-xs text-destructive">{resetPasswordErrors.password}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Confirm Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={resetPasswordForm.confirm}
                  onChange={(e) => {
                    setResetPasswordForm((f) => ({ ...f, confirm: e.target.value }));
                    setResetPasswordErrors((err) => ({ ...err, confirm: undefined }));
                  }}
                />
                {resetPasswordErrors.confirm && (
                  <p className="text-xs text-destructive">{resetPasswordErrors.confirm}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetPasswordUser(null)}>
                Cancel
              </Button>
              <Button
                disabled={resetPasswordMutation.isPending}
                onClick={() => {
                  const errors: typeof resetPasswordErrors = {};
                  if (!resetPasswordForm.password) errors.password = "Password is required";
                  else if (resetPasswordForm.password.length < 8) errors.password = "Minimum 8 characters";
                  if (resetPasswordForm.password !== resetPasswordForm.confirm) errors.confirm = "Passwords do not match";
                  if (Object.keys(errors).length > 0) { setResetPasswordErrors(errors); return; }
                  if (!resetPasswordUser) return;
                  resetPasswordMutation.mutate({ user: resetPasswordUser, newPassword: resetPasswordForm.password });
                }}
              >
                {resetPasswordMutation.isPending ? "Resetting…" : "Reset Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Deactivate Dialog */}
        <Dialog open={confirmTarget != null} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Deactivate {confirmTarget?.fname} {confirmTarget?.lname}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              They will no longer be able to log in.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={toggleStatusMutation.isPending}
                onClick={() => {
                  if (!confirmTarget) return;
                  toggleStatusMutation.mutate(confirmTarget);
                  setConfirmTarget(null);
                }}
              >
                {toggleStatusMutation.isPending ? "Deactivating…" : "Deactivate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </TooltipProvider>
  );
}

export default function UserAdmin() {
  return (
    <Layout>
      <div className="container mx-auto px-6 py-8 max-w-[1400px]">
        <UserAdminContent />
      </div>
    </Layout>
  );
}
