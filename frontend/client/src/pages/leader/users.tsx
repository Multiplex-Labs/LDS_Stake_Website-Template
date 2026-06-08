import { useState, useMemo, useRef, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Search,
  Plus,
  ArrowUpDown,
  X,
  Camera,
  Camera as CameraIcon,
  Check as CheckIcon,
  User as UserIcon,
  AlignLeft as AlignLeftIcon,
  Lock as LockIcon,
  Briefcase as BriefcaseIcon,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getCroppedImageBlob } from "@/lib/cropImage";
import { getInitials, fullName, apiErrorStatus, apiErrorBody, meetsPasswordComplexity, cn } from "@/lib/utils";
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

const WIZARD_STEPS = [
  { id: 1 as WizardStep, label: "Basic Info",    description: "Name, email, and contact details.", icon: <UserIcon className="size-3.5" />,      skippable: false },
  { id: 2 as WizardStep, label: "Bio",            description: "Optional biography or notes.",      icon: <AlignLeftIcon className="size-3.5" />,  skippable: true  },
  { id: 3 as WizardStep, label: "Password",       description: "Set an initial login password.",    icon: <LockIcon className="size-3.5" />,       skippable: false },
  { id: 4 as WizardStep, label: "Assign Calling", description: "Optionally assign a calling.",      icon: <BriefcaseIcon className="size-3.5" />,  skippable: true  },
  { id: 5 as WizardStep, label: "Profile Photo",  description: "Optionally add a profile photo.",   icon: <CameraIcon className="size-3.5" />,     skippable: true  },
  { id: 6 as WizardStep, label: "Review",         description: "Confirm details and create user.",  icon: <CheckIcon className="size-3.5" />,      skippable: false },
] as const;

interface AddUserWizardProps {
  open: boolean;
  wizard: AddWizardState;
  callings: ApiCalling[];
  addSelectedCalling: ApiCalling | undefined;
  addFreeSlots: number[];
  addPhotoCropView: boolean;
  addImgSrc: string | null;
  addCrop: { x: number; y: number };
  addZoom: number;
  addCroppedAreaPixels: Area | null;
  addFileInputRef: React.RefObject<HTMLInputElement | null>;
  onClose: (open: boolean) => void;
  onAdvance: () => void;
  onBack: () => void;
  onSkip: () => void;
  onSkipWithClear: () => void;
  onSkipWithPhoto: () => void;
  onSetWizard: React.Dispatch<React.SetStateAction<AddWizardState>>;
  onSetAddCrop: (crop: { x: number; y: number }) => void;
  onSetAddZoom: (zoom: number) => void;
  onSetAddCroppedAreaPixels: (area: Area | null) => void;
  onCropComplete: (_: Area, pixels: Area) => void;
  onReleaseAddCropState: () => void;
  onConfirmCrop: () => Promise<void>;
  onSubmit: () => void;
  isSubmitting: boolean;
  // Internal photo-picker state setters (used by step 5 file input)
  onSetAddImgSrc: (src: string | null) => void;
  onSetAddPhotoCropView: (active: boolean) => void;
}

function AddUserWizard({
  open,
  wizard,
  callings,
  addSelectedCalling,
  addFreeSlots,
  addPhotoCropView,
  addImgSrc,
  addCrop,
  addZoom,
  addCroppedAreaPixels,
  addFileInputRef,
  onClose,
  onAdvance,
  onBack,
  onSkip,
  onSkipWithClear,
  onSkipWithPhoto,
  onSetWizard,
  onSetAddCrop,
  onSetAddZoom,
  onSetAddCroppedAreaPixels,
  onCropComplete,
  onReleaseAddCropState,
  onConfirmCrop,
  onSubmit,
  isSubmitting,
  onSetAddImgSrc,
  onSetAddPhotoCropView,
}: AddUserWizardProps) {
  const stepIndex = wizard.step - 1;
  const currentStep = WIZARD_STEPS[stepIndex];

  function getSkipHandler() {
    if (wizard.step === 2) return onSkip;
    if (wizard.step === 4) return onSkipWithClear;
    if (wizard.step === 5) return onSkipWithPhoto;
    return onSkip;
  }

  const reviewRows = [
    { label: "Name",    value: `${wizard.form.fname} ${wizard.form.lname}`.trim(), show: true },
    { label: "Email",   value: wizard.form.email,                                  show: true },
    { label: "Phone",   value: wizard.form.phone || "—",                           show: true },
    { label: "Bio",     value: wizard.form.bio   || "—",                           show: true },
    { label: "Calling", value: addSelectedCalling
        ? addSelectedCalling.max_slots > 1
          ? `${addSelectedCalling.name} · Slot ${wizard.slotNumber}`
          : addSelectedCalling.name
        : "—",                                                                      show: true },
    { label: "Photo",   value: wizard.photo ? "Added" : "—",                       show: true },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] sm:max-w-lg p-0 gap-0 overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-muted-foreground">{currentStep.icon}</span>
            <div>
              <span className="font-medium text-sm">{currentStep.label}</span>
              <p className="text-muted-foreground text-xs">Step {stepIndex + 1} of {WIZARD_STEPS.length}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => onClose(false)}>
            <X className="size-3.5" />
          </Button>
        </div>

        {/* Segmented progress bar */}
        <div className="flex gap-1 border-b px-4 py-2.5">
          {WIZARD_STEPS.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                index < stepIndex
                  ? "bg-primary"
                  : index === stepIndex
                  ? "bg-primary/60"
                  : "bg-muted-foreground/15"
              )}
            />
          ))}
        </div>

        {/* Content area — hidden when crop view is active (crop manages its own padding) */}
        {!addPhotoCropView && (
          <div className="px-4 py-4">
            <p className="mb-4 text-muted-foreground text-xs">{currentStep.description}</p>

            {/* Step 1: Basic Info */}
            {wizard.step === 1 && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>First Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={wizard.form.fname}
                      onChange={(e) => onSetWizard((w) => ({
                        ...w,
                        form: { ...w.form, fname: e.target.value },
                        errors: { ...w.errors, fname: undefined },
                      }))}
                      placeholder="John"
                    />
                    {wizard.errors.fname && (
                      <p className="text-xs text-destructive">{wizard.errors.fname}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={wizard.form.lname}
                      onChange={(e) => onSetWizard((w) => ({
                        ...w,
                        form: { ...w.form, lname: e.target.value },
                        errors: { ...w.errors, lname: undefined },
                      }))}
                      placeholder="Doe"
                    />
                    {wizard.errors.lname && (
                      <p className="text-xs text-destructive">{wizard.errors.lname}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={wizard.form.email}
                    onChange={(e) => onSetWizard((w) => ({
                      ...w,
                      form: { ...w.form, email: e.target.value },
                      errors: { ...w.errors, email: undefined },
                    }))}
                    placeholder="john@example.com"
                  />
                  {wizard.errors.email && (
                    <p className="text-xs text-destructive">{wizard.errors.email}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={wizard.form.phone}
                    onChange={(e) => onSetWizard((w) => ({ ...w, form: { ...w.form, phone: e.target.value } }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Bio */}
            {wizard.step === 2 && (
              <div className="space-y-1.5">
                <Label>Bio</Label>
                <Textarea
                  value={wizard.form.bio}
                  onChange={(e) => onSetWizard((w) => ({ ...w, form: { ...w.form, bio: e.target.value } }))}
                  placeholder="Brief description or notes..."
                  className="min-h-[120px]"
                />
              </div>
            )}

            {/* Step 3: Password */}
            {wizard.step === 3 && (
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label>Password <span className="text-destructive">*</span></Label>
                  <Input
                    type="password"
                    value={wizard.form.password}
                    onChange={(e) => onSetWizard((w) => ({
                      ...w,
                      form: { ...w.form, password: e.target.value },
                      errors: { ...w.errors, password: undefined },
                    }))}
                    placeholder="••••••••"
                  />
                  {wizard.errors.password && (
                    <p className="text-xs text-destructive">{wizard.errors.password}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Confirm Password <span className="text-destructive">*</span></Label>
                  <Input
                    type="password"
                    value={wizard.form.confirmPassword}
                    onChange={(e) => onSetWizard((w) => ({
                      ...w,
                      form: { ...w.form, confirmPassword: e.target.value },
                      errors: { ...w.errors, confirmPassword: undefined },
                    }))}
                    placeholder="••••••••"
                  />
                  {wizard.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{wizard.errors.confirmPassword}</p>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Assign Calling */}
            {wizard.step === 4 && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Select
                    value={wizard.callingId === "" ? "" : String(wizard.callingId)}
                    onValueChange={(v) => onSetWizard((w) => ({ ...w, callingId: Number(v), slotNumber: "" }))}
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
                      value={wizard.slotNumber === "" ? "" : String(wizard.slotNumber)}
                      onValueChange={(v) => onSetWizard((w) => ({ ...w, slotNumber: Number(v) }))}
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
            )}

            {/* Step 5: Profile Photo (non-crop view) */}
            {wizard.step === 5 && (
              <div className="flex flex-col items-center gap-4">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={wizard.photo?.previewUrl} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-medium">
                    {getInitials(`${wizard.form.fname} ${wizard.form.lname}`)}
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
                    {wizard.photo ? "Change Photo" : "Choose Photo"}
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
                    const url = URL.createObjectURL(file);
                    onSetAddImgSrc(url);
                    onSetAddCrop({ x: 0, y: 0 });
                    onSetAddZoom(1);
                    onSetAddCroppedAreaPixels(null);
                    onSetAddPhotoCropView(true);
                  }}
                />
              </div>
            )}

            {/* Step 6: Review */}
            {wizard.step === 6 && (
              <div>
                {reviewRows.map((row, index) => (
                  <div
                    key={row.label}
                    className={cn(
                      "flex items-center justify-between py-2.5",
                      index < reviewRows.length - 1 && "border-b"
                    )}
                  >
                    <span className="font-mono text-muted-foreground text-xs">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{row.value}</span>
                      {row.value !== "—" && <span className="size-1.5 rounded-full bg-primary inline-block" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 5 crop view — manages its own padding */}
        {addPhotoCropView && (
          <div className="px-4 pb-4 space-y-4 pt-4">
            <div className="relative h-72 w-full rounded-lg overflow-hidden bg-muted">
              <Cropper
                image={addImgSrc!}
                crop={addCrop}
                zoom={addZoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={onSetAddCrop}
                onZoomChange={onSetAddZoom}
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
                value={addZoom}
                onChange={(e) => onSetAddZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div className="flex justify-between pt-2 border-t">
              <Button variant="outline" onClick={onReleaseAddCropState}>Cancel</Button>
              <Button onClick={onConfirmCrop}>Crop &amp; Save</Button>
            </div>
          </div>
        )}

        {/* Step quick-nav */}
        {!addPhotoCropView && (
          <div className="border-t px-4 py-2.5">
            <div className="flex items-center gap-2">
              {WIZARD_STEPS.map((step, index) => {
                const isCompleted = index < stepIndex;
                const isActive = index === stepIndex;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => isCompleted && onSetWizard((w) => ({ ...w, step: step.id, errors: {} }))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                      isActive
                        ? "bg-muted font-medium text-foreground"
                        : isCompleted
                        ? "text-muted-foreground hover:bg-muted/50"
                        : "cursor-default text-muted-foreground/50"
                    )}
                  >
                    {isCompleted
                      ? <CheckIcon className="size-3 text-primary" />
                      : <span className="tabular-nums">{index + 1}</span>}
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer navigation */}
        {!addPhotoCropView && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onBack} disabled={stepIndex === 0}>
              Back
            </Button>
            <Badge variant="secondary" className="font-normal text-xs tabular-nums">
              {stepIndex + 1}/{WIZARD_STEPS.length}
            </Badge>
            <div className="flex gap-2">
              {currentStep.skippable && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={getSkipHandler()}>
                  Skip
                </Button>
              )}
              {wizard.step < 6 ? (
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onAdvance}>
                  Next <ChevronRightIcon className="size-3" />
                </Button>
              ) : (
                <Button size="sm" className="h-7 text-xs" onClick={onSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Creating…" : "Create User"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const editingUser = useMemo(() => users.find((u) => u.id === editingUserId) ?? null, [users, editingUserId]);
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
    () => editingUser?.callings ?? [],
    [editingUser],
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
    if (!form.password) {
      errors.password = "Password is required";
    } else if (!meetsPasswordComplexity(form.password)) {
      errors.password = "Must be 8–128 characters with at least one uppercase, one digit, and one special character";
    }
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
    onError: (err: unknown) => {
      console.error("[users] toggleStatusMutation error:", err);
      if (apiErrorStatus(err) === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Update Failed", { description: "Could not update user status." });
      }
    },
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
    onError: (err: unknown) => {
      console.error("[users] saveEditMutation error:", err);
      if (apiErrorStatus(err) === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Update Failed", { description: "Could not save changes." });
      }
    },
  });

  const removeCallingMutation = useMutation({
    mutationFn: ({ callingId, slotNumber }: { callingId: number; slotNumber: number }) =>
      apiRequest("DELETE", `/api/callings/${callingId}/${slotNumber}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/"] });
      toast.success("Calling removed");
    },
    onError: (err: unknown) => {
      console.error("[users] removeCallingMutation error:", err);
      if (apiErrorStatus(err) === 401) {
        toast.error("Session expired", { description: "Please log in again." });
      } else {
        toast.error("Failed to remove calling");
      }
    },
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
      const status = apiErrorStatus(err);
      if (status === 409) {
        toast.error("User already has a calling", { description: "A person can only hold one calling at a time." });
      } else if (status === 403) {
        toast.error("Permission denied", { description: "MANAGE_CALLINGS permission required." });
      } else if (status === 400) {
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
        console.error("[users] photo upload failed for new user:", newUser.id, results[0].reason);
        toast.warning("User created, but photo upload failed — add it via Edit");
      }
      if (results[1].status === "rejected") {
        console.error("[users] calling assignment failed for new user:", newUser.id, results[1].reason);
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
      const status = apiErrorStatus(err);
      if (status === 401 || status === 403) {
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
      const status = apiErrorStatus(err);
      if (status === 400) {
        toast.error("Cannot Delete User", { description: apiErrorBody(err) });
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
    onError: (err: unknown) => {
      console.error("[users] uploadPhotoMutation error:", err);
      toast.error("Upload Failed", { description: "Could not save photo. Please try again." });
    },
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
    setEditingUserId(user.id);
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
    setEditingUserId(null);
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
                    <TableCell className="pl-4"><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
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
                    {user.active ? (
                      <span className="text-xs font-medium text-success">Active</span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">Disabled</span>
                    )}
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

        <AddUserWizard
          open={isAddingUser}
          wizard={addWizard}
          callings={callings}
          addSelectedCalling={addSelectedCalling}
          addFreeSlots={addFreeSlots}
          addPhotoCropView={addPhotoCropView}
          addImgSrc={addImgSrc}
          addCrop={addCrop}
          addZoom={addZoom}
          addCroppedAreaPixels={addCroppedAreaPixels}
          addFileInputRef={addFileInputRef}
          onClose={handleCloseAddUser}
          onAdvance={advanceStep}
          onBack={backStep}
          onSkip={skipStep}
          onSkipWithClear={() => setAddWizard((w) => ({ ...w, step: (w.step + 1) as WizardStep, callingId: "", slotNumber: "" }))}
          onSkipWithPhoto={() => {
            if (addWizard.photo) URL.revokeObjectURL(addWizard.photo.previewUrl);
            setAddWizard((w) => ({ ...w, step: (w.step + 1) as WizardStep, photo: null }));
          }}
          onSetWizard={setAddWizard}
          onSetAddCrop={setAddCrop}
          onSetAddZoom={setAddZoom}
          onSetAddCroppedAreaPixels={setAddCroppedAreaPixels}
          onCropComplete={onAddCropComplete}
          onReleaseAddCropState={releaseAddCropState}
          onSetAddImgSrc={setAddImgSrc}
          onSetAddPhotoCropView={setAddPhotoCropView}
          onConfirmCrop={async () => {
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
          onSubmit={() => createUserMutation.mutate({
            ...addWizard.form,
            callingId: addWizard.callingId,
            slotNumber: addWizard.slotNumber,
            photo: addWizard.photo,
          })}
          isSubmitting={createUserMutation.isPending}
        />

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
                  if (!resetPasswordForm.password) {
                    errors.password = "Password is required";
                  } else if (!meetsPasswordComplexity(resetPasswordForm.password)) {
                    errors.password = "Must be 8–128 characters with at least one uppercase, one digit, and one special character";
                  }
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
