import React, { useState, useMemo, useEffect } from "react";
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
  GripVertical,
  Search,
  X,
  ChevronRight,
  Info,
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
  ApiCalling,
} from "@/types";

import { DAYS_OF_WEEK, minutesToTime, timeToMinutes, formatTime12 } from "./time-utils";

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

  const { data: config, isLoading, isError } = useQuery<TempleRecommendConfig>({
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
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] save settings:", err);
      toast.error("Failed to save settings");
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError) return <p className="text-sm text-destructive py-4 text-center">Failed to load. Please refresh.</p>;

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
              <CheckCircle2 className="size-4 text-primary" />
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
        <Badge variant="outline" className={cn("text-xs", type.is_active ? "text-primary border-primary" : "text-muted-foreground")}>
          <span className={cn("size-1.5 rounded-full mr-1.5 inline-block", type.is_active ? "bg-primary" : "bg-muted-foreground")} />
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

  const { data: types, isLoading, isError } = useQuery<AppointmentType[]>({
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
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] toggle type active:", err);
      toast.error("Failed to update");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: number; display_order: number }[]) => {
      await apiRequest("POST", "/api/appointment-types/reorder", updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-types"] });
    },
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] reorder types:", err);
      toast.error("Reorder failed");
    },
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
      console.error("[temple-recommend-tab] delete type:", err);
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
      ) : isError ? (
        <p className="text-sm text-destructive py-4 text-center">Failed to load. Please refresh.</p>
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
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] create type:", err);
      toast.error("Failed to save");
    },
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

const PRESIDENCY_CALLING_NAMES = [
  "Stake President",
  "Stake First Counselor",
  "Stake Second Counselor",
] as const;

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

// Convert JS getDay() (0=Sun) to our scheme (0=Mon, 6=Sun)
function jsDayToOurDay(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function computeMemberStats(
  userId: number,
  windowsByUser: Map<number, Map<number, AvailabilityWindow[]>>,
): { activeDays: number; nextSlot: string | null } {
  const byDay = windowsByUser.get(userId);
  if (!byDay) return { activeDays: 0, nextSlot: null };
  const activeDays = Array.from(byDay.values()).filter(ws => ws.length > 0).length;
  const todayOur = jsDayToOurDay(new Date().getDay());
  for (let offset = 0; offset < 7; offset++) {
    const dow = (todayOur + offset) % 7;
    const ws = byDay.get(dow) ?? [];
    if (ws.length > 0) {
      const earliest = ws.reduce((a, b) => (a.start_minute < b.start_minute ? a : b));
      const dayLabel = DAYS_OF_WEEK[dow].slice(0, 3);
      return { activeDays, nextSlot: `${dayLabel} ${formatTime12(earliest.start_minute)}` };
    }
  }
  return { activeDays, nextSlot: null };
}

function getLocalDateString(tz?: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function getMemberNextDate(memberWindows: AvailabilityWindow[], tz?: string): string {
  const todayStr = getLocalDateString(tz);
  // Parse as local midnight — date-only strings passed to `new Date()` are treated as UTC
  // midnight, causing getDay()/setDate() to operate in the wrong timezone.
  const [y, mo, dy] = todayStr.split("-").map(Number);
  const today = new Date(y, mo - 1, dy);
  const activeDows = Array.from(new Set(memberWindows.filter(w => w.is_active).map(w => w.day_of_week)));
  if (activeDows.length === 0) return todayStr;
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    if (activeDows.includes(jsDayToOurDay(d.getDay()) as 0 | 1 | 2 | 3 | 4 | 5 | 6)) {
      // Format as YYYY-MM-DD from local date components — not UTC via toISOString()
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    }
  }
  return todayStr;
}

function MemberSlotPreview({
  filterUserId,
  selectedUserName,
  memberWindows,
  types,
  config,
}: {
  filterUserId: number | null;
  selectedUserName: string | null;
  memberWindows: AvailabilityWindow[];
  types: AppointmentType[];
  config: TempleRecommendConfig | undefined;
}) {
  const activeTypes = types.filter(t => t.is_active);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const typeId = selectedTypeId ?? activeTypes[0]?.id ?? null;

  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getMemberNextDate(memberWindows, config?.timezone)
  );

  // Stable key: sorted active DOWs as a string. Triggers recompute when the selected
  // member's windows load asynchronously without requiring memberWindows in the dep array
  // (which would cause an infinite loop since the array reference changes every render).
  const activeDowKey = Array.from(
    new Set(memberWindows.filter(w => w.is_active).map(w => w.day_of_week))
  ).sort().join(",");

  useEffect(() => {
    setSelectedDate(getMemberNextDate(memberWindows, config?.timezone));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserId, activeDowKey, config?.timezone]);

  const { data: allSlots, isLoading } = useQuery<
    { slot_datetime_utc: string; interviewer_user_id: number; interviewer_name: string }[]
  >({
    queryKey: ["/api/appointment-availability/slots", typeId, selectedDate],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/appointment-availability/slots?type_id=${typeId}&date_from=${selectedDate}&date_to=${selectedDate}`
      ).then(r => r.json()),
    enabled: typeId !== null,
  });

  const slots =
    filterUserId !== null
      ? (allSlots ?? []).filter(s => s.interviewer_user_id === filterUserId)
      : (allSlots ?? []);

  const tz = config?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <h4 className="font-semibold text-sm">Selected Member Slot Preview</h4>
      </div>
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
        <p className="text-sm text-muted-foreground italic py-2">
          {selectedUserName
            ? `No available slots for ${selectedUserName} on this date.`
            : "No available slots for this date."}
        </p>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {slots.map(s => {
            const d = new Date(s.slot_datetime_utc);
            const dayAbbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
            const timeStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
            return (
              <div key={s.slot_datetime_utc} className="flex items-center gap-2 text-sm py-1 border-b border-border/50 last:border-0">
                <Clock className="size-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground w-8">{dayAbbr}</span>
                <span>{timeStr}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Slots respect buffer and cutoff rules.</p>
    </div>
  );
}

const DOW_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatRecurrenceLabel(exc: AvailabilityException): string {
  const r = exc.recurrence;
  if (!r) return exc.date ?? "";
  if (r === "first_sunday_monthly") return "1st Sunday / month";
  try {
    const rule = JSON.parse(r) as Record<string, unknown>;
    const freq = rule.freq as string;
    const n = Number(rule.interval ?? 1);
    const ordinals: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "-1": "Last" };
    let base = "";
    if (freq === "daily") {
      base = n === 1 ? "Daily" : `Every ${n} days`;
    } else if (freq === "weekly") {
      const days = (rule.days as number[] ?? []).map(d => DOW_NAMES[d]).join(", ");
      base = n === 1 ? `Weekly on ${days}` : `Every ${n} wks on ${days}`;
    } else if (freq === "monthly") {
      if (rule.month_by === "day") {
        base = `Monthly day ${rule.month_day}`;
      } else {
        const mw = rule.month_weekday as { n: number; day: number } | undefined;
        const nStr = ordinals[String(mw?.n)] ?? `${mw?.n}th`;
        base = n === 1
          ? `Monthly, ${nStr} ${DOW_NAMES[mw?.day ?? 6]}`
          : `Every ${n} months, ${nStr} ${DOW_NAMES[mw?.day ?? 6]}`;
      }
    } else if (freq === "yearly") {
      base = n === 1 ? "Yearly" : `Every ${n} years`;
    }
    const et = rule.end_type as string | undefined;
    if (et === "on") return `${base} until ${rule.end_date}`;
    if (et === "after") return `${base} · ${rule.end_count}×`;
    return base;
  } catch {
    return r;
  }
}

function ExceptionsTable({
  exceptions,
  onDelete,
}: {
  exceptions: AvailabilityException[];
  onDelete: (id: number) => void;
}) {
  if (exceptions.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No exceptions set.</p>;
  }
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Event</TableHead>
            <TableHead className="text-xs">When</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map(exc => (
            <TableRow key={exc.id}>
              <TableCell className="text-sm font-medium">{exc.reason}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {exc.recurrence
                  ? <Badge variant="secondary" className="text-xs">{formatRecurrenceLabel(exc)}</Badge>
                  : exc.date}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(exc.id)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="text-muted-foreground flex-1">{label}</span>
      <div className="text-right">
        <div className="text-xs font-medium">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
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
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [deleteDayTarget, setDeleteDayTarget] = useState<{ userId: number; dayIdx: number; windowCount: number } | null>(null);
  const [addMemberExcOpen, setAddMemberExcOpen] = useState(false);
  const [excTab, setExcTab] = useState<"member" | "shared">("member");

  const { data: windows, isError: windowsError } = useQuery<AvailabilityWindow[]>({
    queryKey: ["/api/appointment-availability/windows"],
  });

  const { data: exceptions, isError: exceptionsError } = useQuery<AvailabilityException[]>({
    queryKey: ["/api/appointment-availability/exceptions"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<ApiUser[]>({
    queryKey: ["/api/users"],
  });

  const { data: config } = useQuery<TempleRecommendConfig>({
    queryKey: ["/api/temple-config"],
  });

  const { data: types } = useQuery<AppointmentType[]>({
    queryKey: ["/api/appointment-types"],
  });

  const { data: allCallings } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const callingNameById = useMemo(() => {
    const map = new Map<number, string>();
    if (allCallings) for (const c of allCallings) map.set(c.id, c.name);
    return map;
  }, [allCallings]);

  const deleteWindowMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/appointment-availability/windows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/windows"] });
      toast.success("Window deleted");
      setDeleteWindowId(null);
    },
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] delete window:", err);
      toast.error("Delete failed");
    },
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
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] delete exception:", err);
      toast.error("Delete failed");
    },
  });

  const clearDayMutation = useMutation({
    // windowIds are resolved at call-time (from the dialog's confirmed state) rather than
    // inside mutationFn to avoid a stale-closure on windowsByUser.
    mutationFn: async ({ windowIds }: { windowIds: number[] }) => {
      await Promise.all(
        windowIds.map(id => apiRequest("DELETE", `/api/appointment-availability/windows/${id}`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/windows"] });
      toast.success("Day cleared");
      setDeleteDayTarget(null);
    },
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] clear day windows:", err);
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/windows"] });
      toast.error("Some windows could not be deleted");
      setDeleteDayTarget(null);
    },
  });

  // Group windows by user_id, then by day_of_week (active only)
  const windowsByUser = useMemo(() => {
    const map = new Map<number, Map<number, AvailabilityWindow[]>>();
    if (!windows) return map;
    for (const w of windows.filter(w => w.is_active)) {
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

  const presidencyMembers = useMemo(() => {
    if (!users) return [];
    return users
      .filter(u =>
        (u.callings ?? []).some(c =>
          (PRESIDENCY_CALLING_NAMES as readonly string[]).includes(callingNameById.get(c.calling_id) ?? "")
        )
      )
      .sort((a, b) => {
        const rank = (u: ApiUser) => {
          const name =
            (u.callings ?? [])
              .map(c => callingNameById.get(c.calling_id) ?? "")
              .find(n => (PRESIDENCY_CALLING_NAMES as readonly string[]).includes(n)) ?? "";
          return PRESIDENCY_CALLING_NAMES.indexOf(name as never);
        };
        return rank(a) - rank(b);
      });
  }, [users, callingNameById]);

  useEffect(() => {
    if (!usersLoading && presidencyMembers.length > 0 && selectedUserId === null) {
      setSelectedUserId(presidencyMembers[0].id);
    }
  }, [usersLoading, presidencyMembers, selectedUserId]);

  const globalExceptions = useMemo(() => exceptions?.filter(e => e.is_global) ?? [], [exceptions]);
  const memberExceptions = useMemo(
    () => exceptions?.filter(e => !e.is_global && e.user_id === selectedUserId) ?? [],
    [exceptions, selectedUserId],
  );

  const sundayWindows = useMemo(
    () =>
      (windows ?? []).filter(
        w => w.is_active && w.day_of_week === 6 && presidencyMembers.some(m => m.id === w.user_id)
      ),
    [windows, presidencyMembers],
  );

  const membersWithSunday = useMemo(
    () => new Set(sundayWindows.map(w => w.user_id)).size,
    [sundayWindows],
  );

  const membersWithPersonalExc = useMemo(
    () =>
      new Set(
        (exceptions ?? [])
          .filter(e => !e.is_global && presidencyMembers.some(m => m.id === e.user_id))
          .map(e => e.user_id)
      ).size,
    [exceptions, presidencyMembers],
  );

  const earliestSunWin = useMemo(
    () =>
      sundayWindows.reduce<AvailabilityWindow | null>(
        (best, w) => (!best || w.start_minute < best.start_minute ? w : best),
        null
      ),
    [sundayWindows],
  );

  function openAddWindow(userId: number, dayIdx: number) {
    setWindowPrefill({ user_id: userId, day_of_week: dayIdx });
    setEditWindow(null);
    setWindowSheetOpen(true);
  }

  function confirmClearDay(userId: number, dayIdx: number, windowCount: number) {
    setDeleteDayTarget({ userId, dayIdx, windowCount });
  }

  const selectedUser = selectedUserId !== null ? userMap.get(selectedUserId) ?? null : null;
  const selectedUserName = selectedUser ? `${selectedUser.fname} ${selectedUser.lname}` : null;
  const earliestSunUser = earliestSunWin ? userMap.get(earliestSunWin.user_id) ?? null : null;

  if (windowsError) return <p className="text-sm text-destructive py-4 text-center">Failed to load. Please refresh.</p>;
  if (exceptionsError) return <p className="text-sm text-destructive py-4 text-center">Failed to load. Please refresh.</p>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Appointment Availability</h2>
          </div>
        <Button size="sm" onClick={() => setAddExcOpen(true)}>
          <Plus className="size-4 mr-2" />
          Add Exception
        </Button>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Left: Stake Presidency member list */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
            <div className="flex items-center justify-between px-1 pb-2 border-b border-border">
              <h3 className="font-semibold text-sm">Stake Presidency</h3>
              <span className="text-xs text-muted-foreground">{presidencyMembers.length} members</span>
            </div>

            {usersLoading ? (
              <div className="space-y-2 pt-1">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : presidencyMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-2 py-4 text-center">
                No presidency callings assigned yet.
              </p>
            ) : (
              presidencyMembers.map(user => {
                const { activeDays, nextSlot } = computeMemberStats(user.id, windowsByUser);
                const isSelected = user.id === selectedUserId;
                const initials = `${user.fname[0]}${user.lname[0]}`;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                    className={cn(
                      "w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors border",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted/50"
                    )}
                  >
                    {user.profile_image ? (
                      <img
                        src={user.profile_image}
                        alt={initials}
                        className="size-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {user.fname} {user.lname}
                        </span>
                        {activeDays > 0 && (
                          <Badge variant="outline" className="text-xs shrink-0 text-primary border-primary">
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {activeDays} active day{activeDays !== 1 ? "s" : ""}
                      </p>
                      {nextSlot && (
                        <p className="text-xs text-muted-foreground">Next: {nextSlot}</p>
                      )}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Middle: editing panel */}
        <div className="lg:col-span-5">
          {selectedUserId !== null && selectedUser ? (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Editing:</span>
                    <span className="font-semibold text-primary">
                      {selectedUser.fname} {selectedUser.lname}
                    </span>
                  </div>
                </div>

                {/* Day rows — Sunday first */}
                <div className="divide-y divide-border">
                  {([6, 0, 1, 2, 3, 4, 5] as const).map(dayIdx => {
                    const dayWindows =
                      windowsByUser.get(selectedUserId)?.get(dayIdx) ?? [];
                    const hasWindows = dayWindows.length > 0;
                    return (
                      <div
                        key={dayIdx}
                        className="flex items-center gap-2 px-4 py-2.5 flex-wrap min-h-[48px]"
                      >
                        <span className="w-20 text-sm font-medium shrink-0">
                          {DAYS_OF_WEEK[dayIdx]}
                        </span>

                        <Switch
                          checked={hasWindows}
                          onCheckedChange={checked => {
                            if (checked) {
                              openAddWindow(selectedUserId, dayIdx);
                            } else {
                              confirmClearDay(selectedUserId, dayIdx, dayWindows.length);
                            }
                          }}
                        />

                        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                          {hasWindows ? (
                            dayWindows.map(w => (
                              <span
                                key={w.id}
                                className="inline-flex items-center gap-1 rounded-md bg-muted border border-border text-xs px-2 py-0.5"
                              >
                                {formatTime12(w.start_minute)} – {formatTime12(w.end_minute)}
                                <button
                                  type="button"
                                  aria-label="Edit window"
                                  onClick={() => {
                                    setEditWindow(w);
                                    setWindowSheetOpen(true);
                                  }}
                                  className="text-muted-foreground hover:text-foreground ml-0.5"
                                >
                                  <Pencil className="size-2.5" />
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              No availability
                            </span>
                          )}
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 h-7 text-xs gap-1"
                          onClick={() => openAddWindow(selectedUserId, dayIdx)}
                        >
                          <Plus className="size-3" />
                          Add Time
                        </Button>

                        <Badge
                          variant={hasWindows ? "default" : "secondary"}
                          className="text-xs shrink-0 w-14 justify-center"
                        >
                          {hasWindows ? "Active" : "Closed"}
                        </Badge>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7 shrink-0">
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openAddWindow(selectedUserId, dayIdx)}>
                              <Plus className="size-4 mr-2" />
                              Add window
                            </DropdownMenuItem>
                            {hasWindows && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => confirmClearDay(selectedUserId, dayIdx, dayWindows.length)}
                                >
                                  <Trash2 className="size-4 mr-2" />
                                  Clear all windows
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })}
                </div>

                {/* Slot buffer note */}
                {config && (
                  <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center gap-2">
                    <Info className="size-3.5 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Slot buffer and booking cutoff are applied automatically.
                    </p>
                  </div>
                )}

                {/* Exception tabs */}
                <div className="border-t border-border">
                  <div className="px-4 pt-3">
                    <h4 className="font-semibold text-sm">
                      {selectedUser.fname} {selectedUser.lname} Exceptions
                    </h4>
                  </div>
                  <Tabs
                    value={excTab}
                    onValueChange={v => setExcTab(v as "member" | "shared")}
                    className="px-4 pb-4"
                  >
                    <TabsList className="h-8 mb-3">
                      <TabsTrigger value="member" className="text-xs h-7">
                        Member Exceptions
                      </TabsTrigger>
                      <TabsTrigger value="shared" className="text-xs h-7">
                        Global Exceptions
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="member">
                      <ExceptionsTable exceptions={memberExceptions} onDelete={setDeleteExcId} />
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-xs gap-1"
                        onClick={() => setAddMemberExcOpen(true)}
                      >
                        <Plus className="size-3" />
                        Add Member Exception
                      </Button>
                    </TabsContent>
                    <TabsContent value="shared">
                      <ExceptionsTable exceptions={globalExceptions} onDelete={setDeleteExcId} />
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-xs gap-1"
                        onClick={() => setAddExcOpen(true)}
                      >
                        <Plus className="size-3" />
                        Add Global Exception
                      </Button>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-8 flex items-center justify-center text-sm text-muted-foreground">
              Select a member to edit their availability.
            </div>
          )}
        </div>

        {/* Right: slot preview + coverage summary */}
        <div className="lg:col-span-4 space-y-4">
          {types && (
            <MemberSlotPreview
              filterUserId={selectedUserId}
              selectedUserName={selectedUserName}
              memberWindows={
                selectedUserId
                  ? Array.from(windowsByUser.get(selectedUserId)?.values() ?? []).flat()
                  : []
              }
              types={types}
              config={config}
            />
          )}

          {/* Presidency Coverage Summary */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-sm">Presidency Coverage Summary</h4>
            </div>
            <div className="space-y-2.5">
              <SummaryStat
                icon={<Calendar className="size-4 text-primary" />}
                label="Sunday coverage"
                value={`${membersWithSunday} member${membersWithSunday !== 1 ? "s" : ""} available`}
              />
              <SummaryStat
                icon={<Users className="size-4 text-primary" />}
                label="Members with Sunday slots"
                value={`${membersWithSunday} of ${presidencyMembers.length}`}
              />
              <SummaryStat
                icon={<AlertTriangle className="size-4 text-destructive" />}
                label="Members with exceptions"
                value={`${membersWithPersonalExc} member${membersWithPersonalExc !== 1 ? "s" : ""}`}
              />
              {earliestSunWin && earliestSunUser && (
                <SummaryStat
                  icon={<Clock className="size-4 text-primary" />}
                  label="Earliest Sunday slot"
                  value={`Sun ${formatTime12(earliestSunWin.start_minute)}`}
                  sub={`${earliestSunUser.fname} ${earliestSunUser.lname}`}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Existing dialogs */}
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

      {/* New: delete day AlertDialog */}
      {deleteDayTarget !== null && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setDeleteDayTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Clear {DAYS_OF_WEEK[deleteDayTarget.dayIdx]} availability?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {deleteDayTarget.windowCount} time window
                {deleteDayTarget.windowCount !== 1 ? "s" : ""} for{" "}
                {DAYS_OF_WEEK[deleteDayTarget.dayIdx]}. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={clearDayMutation.isPending}
                onClick={() => {
                  const windowIds = (
                    windowsByUser.get(deleteDayTarget.userId)?.get(deleteDayTarget.dayIdx) ?? []
                  ).map(w => w.id);
                  clearDayMutation.mutate({ windowIds });
                }}
              >
                {clearDayMutation.isPending ? "Clearing…" : "Clear All"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Sheets */}
      <WindowSheet
        open={windowSheetOpen}
        onOpenChange={setWindowSheetOpen}
        existing={editWindow}
        users={users ?? []}
        prefill={windowPrefill ?? undefined}
      />

      {/* Global exception sheet */}
      <ExceptionSheet
        open={addExcOpen}
        onOpenChange={setAddExcOpen}
      />

      {/* Member-specific exception sheet */}
      {selectedUserId !== null && (
        <ExceptionSheet
          open={addMemberExcOpen}
          onOpenChange={setAddMemberExcOpen}
          userId={selectedUserId}
        />
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
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] save window:", err);
      toast.error("Failed to save");
    },
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

const EXC_DAY_CHIPS = [
  { label: "S", value: 6 },
  { label: "M", value: 0 },
  { label: "T", value: 1 },
  { label: "W", value: 2 },
  { label: "T", value: 3 },
  { label: "F", value: 4 },
  { label: "S", value: 5 },
];

function ExceptionSheet({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId?: number;
}) {
  const isGlobal = userId === undefined;

  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"one_time" | "recurring">("one_time");
  const [oneTimeDate, setOneTimeDate] = useState("");
  const [freq, setFreq] = useState<"daily" | "weekly" | "monthly" | "yearly">("weekly");
  const [interval, setInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([6]);
  const [monthBy, setMonthBy] = useState<"weekday" | "day">("weekday");
  const [monthWeekN, setMonthWeekN] = useState(1);
  const [monthWeekDay, setMonthWeekDay] = useState(6);
  const [monthDayN, setMonthDayN] = useState(1);
  const [endType, setEndType] = useState<"never" | "on" | "after">("never");
  const [endDate, setEndDate] = useState("");
  const [endCount, setEndCount] = useState(13);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function resetForm() {
    setReason(""); setMode("one_time"); setOneTimeDate("");
    setFreq("weekly"); setInterval(1); setSelectedDays([6]);
    setMonthBy("weekday"); setMonthWeekN(1); setMonthWeekDay(6); setMonthDayN(1);
    setEndType("never"); setEndDate(""); setEndCount(13); setErrors({});
  }

  function toggleDay(v: number) {
    setSelectedDays(prev => prev.includes(v) ? prev.filter(d => d !== v) : [...prev, v]);
  }

  function buildRecurrence(): string {
    const rule: Record<string, unknown> = { freq, interval, end_type: endType };
    if (freq === "weekly") rule.days = selectedDays;
    if (freq === "monthly") {
      rule.month_by = monthBy;
      if (monthBy === "weekday") rule.month_weekday = { n: monthWeekN, day: monthWeekDay };
      else rule.month_day = monthDayN;
    }
    if (endType === "on") rule.end_date = endDate;
    if (endType === "after") rule.end_count = endCount;
    return JSON.stringify(rule);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const errs: Record<string, string> = {};
      if (!reason.trim()) errs.reason = "Reason required";
      if (mode === "one_time" && !oneTimeDate) errs.date = "Date required";
      if (mode === "recurring" && freq === "weekly" && selectedDays.length === 0) errs.days = "Select at least one day";
      if (mode === "recurring" && endType === "on" && !endDate) errs.endDate = "End date required";
      if (Object.keys(errs).length > 0) { setErrors(errs); throw new Error("validation"); }
      setErrors({});

      const res = await apiRequest("POST", "/api/appointment-availability/exceptions", {
        date: mode === "one_time" ? oneTimeDate : getLocalDateString(),
        reason: reason.trim(),
        recurrence: mode === "recurring" ? buildRecurrence() : null,
        is_global: isGlobal,
        user_id: userId ?? null,
      });
      return (await res.json()) as AvailabilityException;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/exceptions"] });
      toast.success("Exception added");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: unknown) => {
      if ((err as Error).message !== "validation") {
        console.error("[temple-recommend-tab] save exception:", err);
        toast.error("Failed to save");
      }
    },
  });

  const freqUnit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[freq];

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{isGlobal ? "Add Global Exception" : "Add Member Exception"}</SheetTitle>
          <SheetDescription>
            {isGlobal
              ? "Block all interviews on a specific date or recurring schedule."
              : "Mark a date when this member is unavailable."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5">
          <div className="space-y-1">
            <Label>Reason</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Fast Sunday" />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
          </div>

          {isGlobal && (
            <div className="flex rounded-md border border-border overflow-hidden text-sm">
              {(["one_time", "recurring"] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 py-1.5 font-medium transition-colors",
                    mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {m === "one_time" ? "One-time" : "Recurring"}
                </button>
              ))}
            </div>
          )}

          {mode === "one_time" && (
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={oneTimeDate} onChange={e => setOneTimeDate(e.target.value)} />
              {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
            </div>
          )}

          {mode === "recurring" && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              {/* Repeat every */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">Repeat every</span>
                <Input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={e => setInterval(Math.max(1, Number(e.target.value)))}
                  className="w-16 h-8 text-center"
                />
                <Select value={freq} onValueChange={v => setFreq(v as typeof freq)}>
                  <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{freqUnit === "day" ? "day" : "day"}</SelectItem>
                    <SelectItem value="weekly">week</SelectItem>
                    <SelectItem value="monthly">month</SelectItem>
                    <SelectItem value="yearly">year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Repeat on (weekly) */}
              {freq === "weekly" && (
                <div className="space-y-1.5">
                  <span className="text-sm text-muted-foreground">Repeat on</span>
                  <div className="flex gap-1">
                    {EXC_DAY_CHIPS.map(({ label, value }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => toggleDay(value)}
                        className={cn(
                          "size-8 rounded-full text-xs font-medium transition-colors",
                          selectedDays.includes(value)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/70"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {errors.days && <p className="text-xs text-destructive">{errors.days}</p>}
                </div>
              )}

              {/* On (monthly) */}
              {freq === "monthly" && (
                <div className="space-y-2">
                  <span className="text-sm text-muted-foreground">On</span>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" className="accent-primary" checked={monthBy === "weekday"} onChange={() => setMonthBy("weekday")} />
                    <Select value={String(monthWeekN)} onValueChange={v => setMonthWeekN(Number(v))}>
                      <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1st</SelectItem>
                        <SelectItem value="2">2nd</SelectItem>
                        <SelectItem value="3">3rd</SelectItem>
                        <SelectItem value="4">4th</SelectItem>
                        <SelectItem value="-1">Last</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={String(monthWeekDay)} onValueChange={v => setMonthWeekDay(Number(v))}>
                      <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">Sunday</SelectItem>
                        <SelectItem value="0">Monday</SelectItem>
                        <SelectItem value="1">Tuesday</SelectItem>
                        <SelectItem value="2">Wednesday</SelectItem>
                        <SelectItem value="3">Thursday</SelectItem>
                        <SelectItem value="4">Friday</SelectItem>
                        <SelectItem value="5">Saturday</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" className="accent-primary" checked={monthBy === "day"} onChange={() => setMonthBy("day")} />
                    <span className="text-muted-foreground">Day</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={monthDayN}
                      onChange={e => setMonthDayN(Math.min(31, Math.max(1, Number(e.target.value))))}
                      className="w-16 h-7 text-center text-xs"
                    />
                    <span className="text-muted-foreground">of month</span>
                  </label>
                </div>
              )}

              {/* Ends */}
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">Ends</span>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" className="accent-primary" checked={endType === "never"} onChange={() => setEndType("never")} />
                    <span className={endType === "never" ? "" : "text-muted-foreground"}>Never</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer flex-wrap">
                    <input type="radio" className="accent-primary" checked={endType === "on"} onChange={() => setEndType("on")} />
                    <span className={endType === "on" ? "" : "text-muted-foreground"}>On</span>
                    {endType === "on" && (
                      <Input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="h-7 text-xs flex-1 min-w-36"
                      />
                    )}
                    {endType === "on" && errors.endDate && (
                      <p className="text-xs text-destructive w-full">{errors.endDate}</p>
                    )}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer flex-wrap">
                    <input type="radio" className="accent-primary" checked={endType === "after"} onChange={() => setEndType("after")} />
                    <span className={endType === "after" ? "" : "text-muted-foreground"}>After</span>
                    {endType === "after" && (
                      <>
                        <Input
                          type="number"
                          min={1}
                          value={endCount}
                          onChange={e => setEndCount(Math.max(1, Number(e.target.value)))}
                          className="w-16 h-7 text-center text-xs"
                        />
                        <span className="text-muted-foreground">occurrences</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving..." : "Add Exception"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// BOOKINGS SUB-TAB
// ============================================================

const STATUS_META: Record<BookingStatus, { label: string; className: string }> = {
  CONFIRMED: { label: "Confirmed", className: "text-primary border-primary bg-primary/10" },
  PENDING_EMAIL_CONFIRM: { label: "Pending Email", className: "text-destructive border-destructive bg-destructive/10" },
  EXPIRED: { label: "Expired", className: "text-muted-foreground border-border" },
  CANCELLED_BY_MEMBER: { label: "Cancelled (Member)", className: "text-destructive border-destructive bg-destructive/10" },
  CANCELLED_BY_PRESIDENCY: { label: "Cancelled (Admin)", className: "text-destructive border-destructive bg-destructive/10" },
  COMPLETED: { label: "Completed", className: "text-secondary-foreground border-secondary bg-secondary/10" },
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
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] cancel booking:", err);
      toast.error("Failed to cancel");
    },
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
    onError: (err: unknown) => {
      console.error("[temple-recommend-tab] update booking status:", err);
      toast.error("Failed to update status");
    },
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
          { key: "CONFIRMED" as const, label: "Confirmed", color: "text-primary border-primary", count: statusCounts.CONFIRMED },
          { key: "PENDING_EMAIL_CONFIRM" as const, label: "Pending", color: "text-destructive border-destructive", count: statusCounts.PENDING },
          { key: "COMPLETED" as const, label: "Completed", color: "text-secondary-foreground border-secondary", count: statusCounts.COMPLETED },
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
