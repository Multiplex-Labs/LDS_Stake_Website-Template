import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isPast, parseISO } from "date-fns";
import {
  Settings,
  Calendar,
  Clock,
  Users,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  ExternalLink,
  GripVertical,
  Search,
  X,
} from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ICON_MAP, ICON_NAMES } from "@/components/appointments/iconMap";
import { cn } from "@/lib/utils";
import type {
  TempleRecommendConfig,
  AppointmentType,
  AvailabilityWindow,
  AvailabilityException,
  Booking,
  BookingStatus,
  ApiUser,
} from "@/types";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime12(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const period = h < 12 ? "AM" : "PM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(min).padStart(2, "0")} ${period}`;
}

// ============================================================
// SETTINGS SUB-TAB
// ============================================================

const configSchema = z.object({
  location_name: z.string().min(1, "Required"),
  location_address: z.string().min(1, "Required"),
  open_hours_text: z.string().min(1, "Required"),
  exception_note: z.string(),
  timezone: z.string().min(1, "Required"),
  slot_buffer_mins: z.coerce.number().int().min(0),
  booking_window_days: z.coerce.number().int().min(1),
  booking_cutoff_hours: z.coerce.number().int().min(0),
});

type ConfigFormData = z.infer<typeof configSchema>;

function SettingsSubTab() {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const { data: config, isLoading } = useQuery<TempleRecommendConfig>({
    queryKey: ["/api/temple-config"],
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isDirty },
    reset,
  } = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    values: config
      ? {
          location_name: config.location_name,
          location_address: config.location_address,
          open_hours_text: config.open_hours_text,
          exception_note: config.exception_note,
          timezone: config.timezone,
          slot_buffer_mins: config.slot_buffer_mins,
          booking_window_days: config.booking_window_days,
          booking_cutoff_hours: config.booking_cutoff_hours,
        }
      : undefined,
  });

  const selectedTz = watch("timezone");

  const tzPreview = useMemo(() => {
    if (!selectedTz) return null;
    try {
      return new Intl.DateTimeFormat([], {
        timeZone: selectedTz,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZoneName: "short",
      }).format(new Date());
    } catch {
      return "Invalid timezone";
    }
  }, [selectedTz]);

  const saveMutation = useMutation({
    mutationFn: async (data: ConfigFormData) => {
      const res = await apiRequest("PATCH", "/api/temple-config", data);
      return (await res.json()) as TempleRecommendConfig;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/temple-config"], data);
      toast.success("Settings saved");
      reset(data);
      setLastSaved(new Date());
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <form onSubmit={handleSubmit((d) => saveMutation.mutateAsync(d))} className="space-y-4 max-w-3xl">
      {/* Section 1: Location Details */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            1
          </div>
          <div>
            <h3 className="font-semibold text-sm">Location Details</h3>
            <p className="text-xs text-muted-foreground">Basic information about this location</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="location_name">Location Name</Label>
            <Input id="location_name" {...register("location_name")} />
            {errors.location_name && <p className="text-xs text-destructive">{errors.location_name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="location_address">Address</Label>
            <Input id="location_address" {...register("location_address")} />
            {errors.location_address && <p className="text-xs text-destructive">{errors.location_address.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="timezone">Timezone (IANA name)</Label>
            <Input id="timezone" {...register("timezone")} placeholder="America/Denver" />
            {errors.timezone && <p className="text-xs text-destructive">{errors.timezone.message}</p>}
            {tzPreview && !errors.timezone && (
              <p className="text-xs text-muted-foreground">Current: <span className="font-medium">{tzPreview}</span></p>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Public Interview Information */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            2
          </div>
          <div>
            <h3 className="font-semibold text-sm">Public Interview Information</h3>
            <p className="text-xs text-muted-foreground">Information shown to the public about interview availability</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="open_hours_text">Open Hours Text (public-facing)</Label>
            <Textarea id="open_hours_text" {...register("open_hours_text")} rows={3} />
            {errors.open_hours_text && <p className="text-xs text-destructive">{errors.open_hours_text.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="exception_note">Exception Note (e.g. Fast Sunday, holidays)</Label>
            <Textarea id="exception_note" {...register("exception_note")} rows={3} />
          </div>
        </div>
      </div>

      {/* Section 3: Booking Rules */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            3
          </div>
          <div>
            <h3 className="font-semibold text-sm">Booking Rules</h3>
            <p className="text-xs text-muted-foreground">Control how far in advance and under what constraints interviews can be scheduled</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="slot_buffer_mins">Slot Buffer (mins)</Label>
            <Input id="slot_buffer_mins" type="number" min={0} {...register("slot_buffer_mins")} />
            {errors.slot_buffer_mins && <p className="text-xs text-destructive">{errors.slot_buffer_mins.message}</p>}
            <p className="text-xs text-muted-foreground">Time between interviews</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="booking_window_days">Booking Window (days)</Label>
            <Input id="booking_window_days" type="number" min={1} {...register("booking_window_days")} />
            {errors.booking_window_days && <p className="text-xs text-destructive">{errors.booking_window_days.message}</p>}
            <p className="text-xs text-muted-foreground">How far in advance members can book</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="booking_cutoff_hours">Cutoff Before Slot (hours)</Label>
            <Input id="booking_cutoff_hours" type="number" min={0} {...register("booking_cutoff_hours")} />
            {errors.booking_cutoff_hours && <p className="text-xs text-destructive">{errors.booking_cutoff_hours.message}</p>}
            <p className="text-xs text-muted-foreground">Minimum notice before an interview</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {lastSaved && (
            <>
              <CheckCircle2 className="size-4 text-green-500" />
              Last saved at {lastSaved.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => reset()} disabled={!isDirty}>
            Reset Changes
          </Button>
          <Button type="submit" disabled={!isDirty || saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ============================================================
// APPOINTMENT TYPES SUB-TAB
// ============================================================

const typeSchema = z.object({
  name: z.string().min(1, "Required"),
  description: z.string().min(1, "Required"),
  duration_mins: z.coerce.number().int().min(5, "At least 5 minutes"),
  details: z.string(),
  icon_name: z.string().min(1, "Select an icon"),
});

type TypeFormData = z.infer<typeof typeSchema>;

interface TypePatchResponse {
  type: AppointmentType;
  warnings: string[];
}

interface SortableRowProps {
  type: AppointmentType;
  onToggleActive: (id: number, is_active: boolean) => void;
  onEdit: (type: AppointmentType) => void;
  onDelete: (type: AppointmentType) => void;
}

function SortableRow({ type, onToggleActive, onEdit, onDelete }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: type.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const IconComponent = ICON_MAP[type.icon_name] ?? Calendar;
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground touch-none" aria-label="Drag to reorder">
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <IconComponent className="size-4 text-primary" />
        </div>
      </TableCell>
      <TableCell className="font-medium">{type.name}</TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground max-w-xs truncate block">{type.description}</span>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{type.duration_mins} min</Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("text-xs", type.is_active ? "text-green-600 border-green-600" : "text-muted-foreground")}>
          <span className={cn("size-1.5 rounded-full mr-1.5 inline-block", type.is_active ? "bg-green-500" : "bg-muted-foreground")} />
          {type.is_active ? "Active" : "Hidden"}
        </Badge>
      </TableCell>
      <TableCell>
        <Switch
          checked={type.is_active}
          onCheckedChange={(v) => onToggleActive(type.id, v)}
        />
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(type)}>
              <Pencil className="size-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={type.system_defined}
              onClick={() => onDelete(type)}
            >
              <Trash2 className="size-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function AppointmentTypesSubTab() {
  const [editType, setEditType] = useState<AppointmentType | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppointmentType | null>(null);

  const { data: types, isLoading } = useQuery<AppointmentType[]>({
    queryKey: ["/api/appointment-types"],
  });

  const activeMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/appointment-types/${id}`, { is_active });
      return (await res.json()) as TypePatchResponse;
    },
    onSuccess: ({ type, warnings }) => {
      queryClient.setQueryData<AppointmentType[]>(["/api/appointment-types"], (old) =>
        old ? old.map((t) => (t.id === type.id ? type : t)) : [type],
      );
      if (warnings.length > 0) {
        toast.warning(warnings.join(" "));
      }
    },
    onError: () => toast.error("Failed to update"),
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: number; display_order: number }[]) => {
      await apiRequest("POST", "/api/appointment-types/reorder", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-types"] });
    },
    onError: () => toast.error("Reorder failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/appointment-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-types"] });
      toast.success("Deleted");
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.startsWith("409")) {
        toast.error("Cannot delete a system-defined appointment type.");
      } else {
        toast.error("Delete failed");
      }
    },
  });

  const sorted = types ? [...types].sort((a, b) => a.display_order - b.display_order) : [];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !types) return;
    const oldIndex = sorted.findIndex(t => t.id === active.id);
    const newIndex = sorted.findIndex(t => t.id === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    reorderMutation.mutate(reordered.map((t, i) => ({ id: t.id, display_order: i + 1 })));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Appointment Types</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4 mr-2" />
          Add Type
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sorted.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Icon</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Visible</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((type) => (
                    <SortableRow
                      key={type.id}
                      type={type}
                      onToggleActive={(id, is_active) => activeMutation.mutate({ id, is_active })}
                      onEdit={setEditType}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <TypeSheet
        open={addOpen || editType !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAddOpen(false);
            setEditType(null);
          }
        }}
        existing={editType}
      />

      {deleteTarget && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{deleteTarget.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone. Future bookings of this type will be unaffected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

interface TypeSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: AppointmentType | null;
}

function TypeSheet({ open, onOpenChange, existing }: TypeSheetProps) {
  const isEdit = existing !== null;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<TypeFormData>({
    resolver: zodResolver(typeSchema),
    values: existing
      ? {
          name: existing.name,
          description: existing.description,
          duration_mins: existing.duration_mins,
          details: existing.details,
          icon_name: existing.icon_name,
        }
      : {
          name: "",
          description: "",
          duration_mins: 30,
          details: "",
          icon_name: "",
        },
  });

  const selectedIcon = watch("icon_name");

  const mutation = useMutation({
    mutationFn: async (data: TypeFormData) => {
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/appointment-types/${existing.id}`, data);
        return (await res.json()) as TypePatchResponse;
      } else {
        const res = await apiRequest("POST", "/api/appointment-types", data);
        return { type: (await res.json()) as AppointmentType, warnings: [] as string[] };
      }
    },
    onSuccess: ({ type, warnings }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-types"] });
      if (warnings.length > 0) {
        toast.warning(`Saved with warning: ${warnings.join(" ")}`);
      } else {
        toast.success(isEdit ? "Appointment type updated" : "Appointment type created");
      }
      onOpenChange(false);
      reset();
    },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader className="mb-6">
          <SheetTitle>{isEdit ? "Edit Appointment Type" : "Add Appointment Type"}</SheetTitle>
          <SheetDescription>
            {isEdit ? `Editing "${existing.name}"` : "Create a new appointment type"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="type-name">Name</Label>
            <Input id="type-name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="type-desc">Description</Label>
            <Textarea id="type-desc" {...register("description")} rows={2} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="type-duration">Duration (minutes)</Label>
            <Input id="type-duration" type="number" min={5} {...register("duration_mins")} />
            {errors.duration_mins && <p className="text-xs text-destructive">{errors.duration_mins.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="type-details">Details (shown in Details sheet)</Label>
            <Textarea id="type-details" {...register("details")} rows={3} />
          </div>

          {/* Icon picker */}
          <div className="space-y-2">
            <Label>Icon</Label>
            {errors.icon_name && <p className="text-xs text-destructive">{errors.icon_name.message}</p>}
            <div className="grid grid-cols-5 gap-2">
              {ICON_NAMES.map((name) => {
                const Ic = ICON_MAP[name];
                const isSelected = selectedIcon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => setValue("icon_name", name, { shouldValidate: true })}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2 rounded-md border transition-colors text-xs",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Ic className="size-5" />
                    <span className="truncate w-full text-center leading-none">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Type"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// AVAILABILITY SUB-TAB
// ============================================================

const windowSchema = z.object({
  user_id: z.coerce.number().int().min(1),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Required"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Required"),
  valid_from: z.string().optional(),
  valid_until: z.string().optional(),
}).refine((d) => timeToMinutes(d.end_time) > timeToMinutes(d.start_time), {
  message: "End time must be after start time",
  path: ["end_time"],
});

type WindowFormData = z.infer<typeof windowSchema>;

const exceptionSchema = z.object({
  date: z.string().min(1, "Date required"),
  reason: z.string().min(1, "Reason required"),
});

type ExceptionFormData = z.infer<typeof exceptionSchema>;

function BookingSlotPreview({ types, config }: { types: AppointmentType[]; config: TempleRecommendConfig | undefined }) {
  const activeTypes = types.filter(t => t.is_active);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split("T")[0]);

  const typeId = selectedTypeId ?? activeTypes[0]?.id ?? null;

  const { data: slots, isLoading } = useQuery<{ slot_datetime_utc: string; interviewer_user_id: number; interviewer_name: string }[]>({
    queryKey: ["/api/appointment-availability/slots", typeId, selectedDate],
    queryFn: () => apiRequest("GET", `/api/appointment-availability/slots?type_id=${typeId}&date_from=${selectedDate}&date_to=${selectedDate}`).then(r => r.json()),
    enabled: typeId !== null,
  });

  const tz = config?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <h4 className="font-semibold text-sm">Booking Slot Preview</h4>
      </div>
      <p className="text-xs text-muted-foreground">Live slots for the selected date and type.</p>
      <div className="grid grid-cols-1 gap-2">
        <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="text-sm h-8" />
        {activeTypes.length > 1 && (
          <Select value={String(typeId)} onValueChange={v => setSelectedTypeId(Number(v))}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {activeTypes.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-1.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
      ) : !slots || slots.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">No available slots for this date.</p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {slots.map(s => {
            const local = new Intl.DateTimeFormat([], { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(s.slot_datetime_utc));
            return (
              <div key={s.slot_datetime_utc} className="flex items-center gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                <Clock className="size-3 text-muted-foreground shrink-0" />
                <span>{local}</span>
                <span className="text-xs text-muted-foreground ml-auto truncate">{s.interviewer_name}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Slots respect buffer and cutoff rules.</p>
    </div>
  );
}

function AvailabilitySubTab() {
  const [windowSheetOpen, setWindowSheetOpen] = useState(false);
  const [editWindow, setEditWindow] = useState<AvailabilityWindow | null>(null);
  const [deleteWindowId, setDeleteWindowId] = useState<number | null>(null);
  const [deleteExcId, setDeleteExcId] = useState<number | null>(null);
  const [addExcOpen, setAddExcOpen] = useState(false);
  const [windowPrefill, setWindowPrefill] = useState<{ user_id: number; day_of_week: number } | null>(null);

  const { data: windows, isLoading: windowsLoading } = useQuery<AvailabilityWindow[]>({
    queryKey: ["/api/appointment-availability/windows"],
  });

  const { data: exceptions, isLoading: excLoading } = useQuery<AvailabilityException[]>({
    queryKey: ["/api/appointment-availability/exceptions"],
  });

  const { data: users } = useQuery<ApiUser[]>({
    queryKey: ["/api/users"],
  });

  const { data: config } = useQuery<TempleRecommendConfig>({
    queryKey: ["/api/temple-config"],
  });

  const { data: types } = useQuery<AppointmentType[]>({
    queryKey: ["/api/appointment-types"],
  });

  const deleteWindowMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/appointment-availability/windows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/windows"] });
      toast.success("Window deleted");
      setDeleteWindowId(null);
    },
    onError: () => toast.error("Delete failed"),
  });

  const deleteExcMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/appointment-availability/exceptions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/exceptions"] });
      toast.success("Exception removed");
      setDeleteExcId(null);
    },
    onError: () => toast.error("Delete failed"),
  });

  // Group windows by user_id, then by day_of_week
  const windowsByUser = useMemo(() => {
    const map = new Map<number, Map<number, AvailabilityWindow[]>>();
    if (!windows) return map;
    for (const w of windows) {
      let byDay = map.get(w.user_id);
      if (!byDay) {
        byDay = new Map<number, AvailabilityWindow[]>();
        for (let d = 0; d < 7; d++) byDay.set(d, []);
        map.set(w.user_id, byDay);
      }
      byDay.get(w.day_of_week)?.push(w);
    }
    return map;
  }, [windows]);

  const userMap = useMemo(() => {
    const map = new Map<number, ApiUser>();
    if (users) for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const globalExceptions = exceptions?.filter((e) => e.is_global) ?? [];

  const activeDayIndices = useMemo(
    () => Array.from(new Set((windows ?? []).map((w) => w.day_of_week))).sort((a, b) => a - b),
    [windows],
  );

  const activeDayNames = useMemo(
    () => activeDayIndices.map((i) => DAYS_OF_WEEK[i]),
    [activeDayIndices],
  );

  const firstAvailableDate = useMemo(() => {
    if (activeDayIndices.length === 0) return null;
    const today = new Date();
    for (let offset = 0; offset < 14; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      const jsDay = d.getDay();
      const ourDay = jsDay === 0 ? 6 : jsDay - 1;
      if (activeDayIndices.includes(ourDay)) return d;
    }
    return null;
  }, [activeDayIndices]);

  const blockedCount = globalExceptions.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Weekly Availability */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Weekly Availability</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href="/leader/my-availability">
                    <ExternalLink className="size-4 mr-2" />
                    My Availability
                  </a>
                </Button>
                <Button size="sm" onClick={() => { setEditWindow(null); setWindowPrefill(null); setWindowSheetOpen(true); }}>
                  <Plus className="size-4 mr-2" />
                  Add Window
                </Button>
              </div>
            </div>

            {windowsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : windowsByUser.size === 0 ? (
              <p className="text-sm text-muted-foreground italic">No availability windows configured.</p>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {Array.from(windowsByUser.entries()).map(([userId, userWindowsByDay]) => {
                  const user = userMap.get(userId);
                  const label = user ? `${user.fname} ${user.lname}` : `User #${userId}`;
                  const windowCount = Array.from(userWindowsByDay.values()).reduce((sum, list) => sum + list.length, 0);
                  return (
                    <AccordionItem key={userId} value={String(userId)} className="border border-border rounded-md px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <Users className="size-4 text-muted-foreground" />
                          <span className="font-medium">{label}</span>
                          <Badge variant="secondary" className="ml-2">{windowCount} window{windowCount !== 1 ? "s" : ""}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pb-2">
                          {DAYS_OF_WEEK.map((dayName, dayIdx) => {
                            const dayWindows = userWindowsByDay.get(dayIdx) ?? [];
                            const hasWindows = dayWindows.length > 0;
                            return (
                              <div key={dayIdx} className="flex items-center gap-3 py-2 border-b border-border last:border-0 flex-wrap">
                                <span className="w-24 text-sm font-medium shrink-0">{dayName}</span>
                                <div className="flex flex-wrap gap-1.5 flex-1">
                                  {hasWindows ? (
                                    dayWindows.map(w => (
                                      <span key={w.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2.5 py-0.5">
                                        {formatTime12(w.start_minute)} &ndash; {formatTime12(w.end_minute)}
                                        <button onClick={() => { setEditWindow(w); setWindowSheetOpen(true); }} className="hover:text-foreground ml-1" aria-label="Edit">
                                          <Pencil className="size-3" />
                                        </button>
                                        <button onClick={() => setDeleteWindowId(w.id)} className="hover:text-destructive" aria-label="Delete">
                                          <X className="size-3" />
                                        </button>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">No availability</span>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="shrink-0 h-7 text-xs"
                                  onClick={() => {
                                    setEditWindow(null);
                                    setWindowPrefill({ user_id: userId, day_of_week: dayIdx });
                                    setWindowSheetOpen(true);
                                  }}
                                >
                                  <Plus className="size-3 mr-1" /> Add
                                </Button>
                                <Badge variant={hasWindows ? "default" : "secondary"} className="text-xs shrink-0">
                                  {hasWindows ? "Active" : "Closed"}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>

          {/* Date Exceptions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Global Exceptions (No Interviews)</h3>
              <Button size="sm" onClick={() => setAddExcOpen(true)}>
                <Plus className="size-4 mr-2" />
                Add Exception
              </Button>
            </div>

            {excLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : globalExceptions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No global exceptions set.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {globalExceptions.map(exc => (
                      <TableRow key={exc.id}>
                        <TableCell className="font-medium text-sm">{exc.reason}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{exc.date}</TableCell>
                        <TableCell><Badge variant="destructive" className="text-xs">Closed</Badge></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteExcId(exc.id)}>
                            <Trash2 className="size-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="lg:col-span-5 space-y-4">
          {types && <BookingSlotPreview types={types} config={config} />}

          {/* Availability Summary */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h4 className="font-semibold text-sm">Availability Summary</h4>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-green-500" />
                  <span className="text-muted-foreground">{activeDayIndices.length} active day{activeDayIndices.length !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-xs text-muted-foreground">{activeDayNames.join(", ") || "None"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-500" />
                  <span className="text-muted-foreground">{blockedCount} blocked event{blockedCount !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-xs text-muted-foreground">Date exceptions</span>
              </div>
              {firstAvailableDate && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-primary" />
                    <span className="text-muted-foreground">First available day</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{firstAvailableDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Window sheet */}
      <WindowSheet
        open={windowSheetOpen}
        onOpenChange={setWindowSheetOpen}
        existing={editWindow}
        users={users ?? []}
        prefill={windowPrefill ?? undefined}
      />

      {/* Exception sheet */}
      <ExceptionSheet open={addExcOpen} onOpenChange={setAddExcOpen} />

      {/* Delete window confirm */}
      {deleteWindowId !== null && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setDeleteWindowId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete availability window?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteWindowMutation.mutate(deleteWindowId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete exception confirm */}
      {deleteExcId !== null && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setDeleteExcId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove exception?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteExcMutation.mutate(deleteExcId)}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

interface WindowSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: AvailabilityWindow | null;
  users: ApiUser[];
  prefill?: { user_id: number; day_of_week: number };
}

function WindowSheet({ open, onOpenChange, existing, users, prefill }: WindowSheetProps) {
  const isEdit = existing !== null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WindowFormData>({
    resolver: zodResolver(windowSchema),
    values: existing
      ? {
          user_id: existing.user_id,
          day_of_week: existing.day_of_week,
          start_time: minutesToTime(existing.start_minute),
          end_time: minutesToTime(existing.end_minute),
          valid_from: existing.valid_from ?? "",
          valid_until: existing.valid_until ?? "",
        }
      : {
          user_id: prefill?.user_id ?? 0,
          day_of_week: prefill?.day_of_week ?? 0,
          start_time: "09:00",
          end_time: "17:00",
          valid_from: "",
          valid_until: "",
        },
  });

  const mutation = useMutation({
    mutationFn: async (data: WindowFormData) => {
      const payload = {
        user_id: data.user_id,
        day_of_week: data.day_of_week,
        start_minute: timeToMinutes(data.start_time),
        end_minute: timeToMinutes(data.end_time),
        valid_from: data.valid_from || null,
        valid_until: data.valid_until || null,
        is_active: true,
      };
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/appointment-availability/windows/${existing.id}`, payload);
        return (await res.json()) as AvailabilityWindow;
      } else {
        const res = await apiRequest("POST", "/api/appointment-availability/windows", payload);
        return (await res.json()) as AvailabilityWindow;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/windows"] });
      toast.success(isEdit ? "Window updated" : "Window added");
      onOpenChange(false);
      reset();
    },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{isEdit ? "Edit Availability Window" : "Add Availability Window"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="w-user">Interviewer</Label>
            <select
              id="w-user"
              {...register("user_id")}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value={0}>Select user&hellip;</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fname} {u.lname}
                </option>
              ))}
            </select>
            {errors.user_id && <p className="text-xs text-destructive">{errors.user_id.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="w-day">Day of Week</Label>
            <select
              id="w-day"
              {...register("day_of_week")}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
            >
              {DAYS_OF_WEEK.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="w-start">Start Time</Label>
              <Input id="w-start" type="time" {...register("start_time")} />
              {errors.start_time && <p className="text-xs text-destructive">{errors.start_time.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="w-end">End Time</Label>
              <Input id="w-end" type="time" {...register("end_time")} />
              {errors.end_time && <p className="text-xs text-destructive">{errors.end_time.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="w-from">Valid From (optional)</Label>
              <Input id="w-from" type="date" {...register("valid_from")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="w-until">Valid Until (optional)</Label>
              <Input id="w-until" type="date" {...register("valid_until")} />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Window"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ExceptionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ExceptionFormData>({
    resolver: zodResolver(exceptionSchema),
  });

  const mutation = useMutation({
    mutationFn: async (data: ExceptionFormData) => {
      const res = await apiRequest("POST", "/api/appointment-availability/exceptions", {
        ...data,
        is_global: true,
        user_id: null,
      });
      return (await res.json()) as AvailabilityException;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/exceptions"] });
      toast.success("Exception added");
      onOpenChange(false);
      reset();
    },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <SheetContent>
        <SheetHeader className="mb-6">
          <SheetTitle>Add Global Exception</SheetTitle>
          <SheetDescription>Mark a date when no interviews will be held.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="exc-date">Date</Label>
            <Input id="exc-date" type="date" {...register("date")} />
            {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="exc-reason">Reason</Label>
            <Input id="exc-reason" {...register("reason")} placeholder="e.g. Fast Sunday" />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Add Exception"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// BOOKINGS SUB-TAB
// ============================================================

const STATUS_META: Record<BookingStatus, { label: string; className: string }> = {
  CONFIRMED: { label: "Confirmed", className: "text-green-600 border-green-600 bg-green-500/10" },
  PENDING_EMAIL_CONFIRM: { label: "Pending Email", className: "text-amber-600 border-amber-600 bg-amber-500/10" },
  EXPIRED: { label: "Expired", className: "text-muted-foreground border-border" },
  CANCELLED_BY_MEMBER: { label: "Cancelled (Member)", className: "text-destructive border-destructive bg-destructive/10" },
  CANCELLED_BY_PRESIDENCY: { label: "Cancelled (Admin)", className: "text-destructive border-destructive bg-destructive/10" },
  COMPLETED: { label: "Completed", className: "text-blue-600 border-blue-600 bg-blue-500/10" },
  NO_SHOW: { label: "No Show", className: "text-muted-foreground border-border" },
};

interface BookingRow extends Booking {
  type_name?: string;
  interviewer_name?: string;
  icon_name?: string;
}

function BookingsSubTab() {
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "ALL" | "CANCELLED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<number | "ALL">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ["/api/appointment-bookings"],
  });

  const { data: types } = useQuery<AppointmentType[]>({
    queryKey: ["/api/appointment-types"],
  });

  const { data: users } = useQuery<ApiUser[]>({
    queryKey: ["/api/users"],
  });

  const typeMap = useMemo(() => {
    const m = new Map<number, string>();
    if (types) for (const t of types) m.set(t.id, t.name);
    return m;
  }, [types]);

  const typeIconMap = useMemo(() => {
    const m = new Map<number, string>();
    if (types) for (const t of types) m.set(t.id, t.icon_name);
    return m;
  }, [types]);

  const userMap = useMemo(() => {
    const m = new Map<number, string>();
    if (users) for (const u of users) m.set(u.id, `${u.fname} ${u.lname}`);
    return m;
  }, [users]);

  const enriched: BookingRow[] = useMemo(
    () =>
      (bookings ?? []).map((b) => ({
        ...b,
        type_name: typeMap.get(b.appointment_type_id),
        interviewer_name: userMap.get(b.interviewer_user_id),
        icon_name: typeIconMap.get(b.appointment_type_id),
      })),
    [bookings, typeMap, userMap, typeIconMap],
  );

  const statusCounts = useMemo(() => ({
    CONFIRMED: enriched.filter(b => b.status === "CONFIRMED").length,
    PENDING: enriched.filter(b => b.status === "PENDING_EMAIL_CONFIRM").length,
    COMPLETED: enriched.filter(b => b.status === "COMPLETED").length,
    CANCELLED: enriched.filter(b => b.status === "CANCELLED_BY_MEMBER" || b.status === "CANCELLED_BY_PRESIDENCY").length,
  }), [enriched]);

  const filtered = useMemo(() => enriched.filter(b => {
    if (statusFilter === "CANCELLED") {
      if (b.status !== "CANCELLED_BY_MEMBER" && b.status !== "CANCELLED_BY_PRESIDENCY") return false;
    } else if (statusFilter !== "ALL" && b.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== "ALL" && b.appointment_type_id !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!b.member_name?.toLowerCase().includes(q) && !b.interviewer_name?.toLowerCase().includes(q)) return false;
    }
    if (dateFrom && b.start_datetime < dateFrom) return false;
    if (dateTo && b.start_datetime > dateTo + "T23:59:59") return false;
    return true;
  }), [enriched, statusFilter, typeFilter, searchQuery, dateFrom, dateTo]);

  const upcoming = filtered.filter((b) => !isPast(parseISO(b.end_datetime)));
  const past = filtered.filter((b) => isPast(parseISO(b.end_datetime)));

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/appointment-bookings/${id}/cancel`, {
        cancellation_reason: reason,
      });
      return (await res.json()) as Booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-bookings"] });
      toast.success("Appointment cancelled");
      setCancelTarget(null);
      setCancelReason("");
    },
    onError: () => toast.error("Failed to cancel"),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "COMPLETED" | "NO_SHOW" }) => {
      const res = await apiRequest("PATCH", `/api/appointment-bookings/${id}/status`, { status });
      return (await res.json()) as Booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-bookings"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  function BookingTable({ rows }: { rows: BookingRow[] }) {
    return (
      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date &amp; Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Interviewer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No bookings found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((b) => {
                const startDate = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(b.start_datetime));
                const startDay = new Intl.DateTimeFormat([], { weekday: "long" }).format(new Date(b.start_datetime));
                const meta = STATUS_META[b.status];
                const isPastBooking = isPast(parseISO(b.end_datetime));
                const TypeIcon = ICON_MAP[b.icon_name ?? ""] ?? Calendar;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <Calendar className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <div className="text-sm font-medium">{startDate}</div>
                          <div className="text-xs text-muted-foreground">{startDay}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <TypeIcon className="size-3.5 text-primary" />
                        </div>
                        <span className="text-sm">{b.type_name ?? b.appointment_type_id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{b.member_name}</div>
                      <div className="text-xs text-muted-foreground">{b.member_phone}</div>
                    </TableCell>
                    <TableCell className="text-sm">{b.interviewer_name ?? `#${b.interviewer_user_id}`}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", meta.className)}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8"><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isPastBooking && b.status === "CONFIRMED" && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCancelTarget(b)}>
                              <XCircle className="size-4 mr-2" />Cancel
                            </DropdownMenuItem>
                          )}
                          {isPastBooking && b.status === "CONFIRMED" && (
                            <>
                              <DropdownMenuItem onClick={() => statusMutation.mutate({ id: b.id, status: "COMPLETED" })}>
                                <CheckCircle className="size-4 mr-2" />Mark Complete
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => statusMutation.mutate({ id: b.id, status: "NO_SHOW" })}>
                                <XCircle className="size-4 mr-2" />Mark No Show
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: "CONFIRMED" as const, label: "Confirmed", color: "text-green-600 border-green-600", count: statusCounts.CONFIRMED },
          { key: "PENDING_EMAIL_CONFIRM" as const, label: "Pending", color: "text-amber-600 border-amber-600", count: statusCounts.PENDING },
          { key: "COMPLETED" as const, label: "Completed", color: "text-blue-600 border-blue-600", count: statusCounts.COMPLETED },
          { key: "CANCELLED" as const, label: "Cancelled", color: "text-destructive border-destructive", count: statusCounts.CANCELLED },
        ] as const).map(({ key, label, color, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(statusFilter === key ? "ALL" : key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              statusFilter === key ? `${color} bg-muted` : "border-border text-muted-foreground hover:border-primary",
            )}
          >
            {label}
            <span className="ml-0.5 tabular-nums">{count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Search member or interviewer..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={String(typeFilter)} onValueChange={v => setTypeFilter(v === "ALL" ? "ALL" : Number(v))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {(types ?? []).map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as BookingStatus | "ALL" | "CANCELLED")}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            {(Object.keys(STATUS_META) as BookingStatus[]).map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 text-sm" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 text-sm" />
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <h3 className="font-semibold">Upcoming Bookings</h3>
            </div>
            <BookingTable rows={upcoming} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" />
              <h3 className="font-semibold text-muted-foreground">Past Bookings</h3>
            </div>
            <BookingTable rows={past} />
          </div>
        </>
      )}

      {/* Cancel dialog */}
      {cancelTarget && (
        <AlertDialog open onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
              <AlertDialogDescription>
                Cancel appointment for {cancelTarget.member_name}? This will notify the member.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-6 pb-2">
              <Label htmlFor="cancel-reason" className="text-sm">Reason (optional)</Label>
              <Input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Presidency schedule conflict"
                className="mt-1"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => cancelMutation.mutate({ id: cancelTarget.id, reason: cancelReason })}
              >
                Cancel Appointment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ============================================================
// ROOT EXPORT
// ============================================================

export function TempleRecommendTab() {
  return (
    <Tabs defaultValue="settings">
      <TabsList className="mb-6 flex-wrap h-auto">
        <TabsTrigger value="settings" className="gap-2">
          <Settings className="size-4" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="appointment-types" className="gap-2">
          <BookOpen className="size-4" />
          Appointment Types
        </TabsTrigger>
        <TabsTrigger value="availability" className="gap-2">
          <Clock className="size-4" />
          Availability
        </TabsTrigger>
        <TabsTrigger value="bookings" className="gap-2">
          <Calendar className="size-4" />
          Bookings
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings">
        <SettingsSubTab />
      </TabsContent>
      <TabsContent value="appointment-types">
        <AppointmentTypesSubTab />
      </TabsContent>
      <TabsContent value="availability">
        <AvailabilitySubTab />
      </TabsContent>
      <TabsContent value="bookings">
        <BookingsSubTab />
      </TabsContent>
    </Tabs>
  );
}
