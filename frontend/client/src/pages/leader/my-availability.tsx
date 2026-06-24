import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Clock } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/auth";
import type { AvailabilityWindow } from "@/types";

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

const windowSchema = z.object({
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

export default function MyAvailability() {
  const { user } = useAuthStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editWindow, setEditWindow] = useState<AvailabilityWindow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: windows, isLoading } = useQuery<AvailabilityWindow[]>({
    queryKey: ["/api/appointment-availability/windows", user?.id],
    queryFn: () =>
      apiRequest("GET", `/api/appointment-availability/windows?user_id=${user!.id}`).then((r) =>
        r.json(),
      ),
    enabled: user !== null,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/appointment-availability/windows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/windows", user?.id] });
      toast.success("Window deleted");
      setDeleteId(null);
    },
    onError: () => toast.error("Delete failed"),
  });

  const sortedWindows = windows
    ? [...windows].sort((a, b) => a.day_of_week - b.day_of_week || a.start_minute - b.start_minute)
    : [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <div className="mb-6">
          <Link href="/leader/admin?tab=availability">
            <Button variant="ghost" size="sm" className="gap-2 -ml-2">
              <ArrowLeft className="size-4" />
              Back to Admin Hub
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-serif text-2xl font-bold text-foreground">
              My Availability
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your interview availability windows. These determine when members can book
              appointments with you.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditWindow(null); setSheetOpen(true); }}
          >
            <Plus className="size-4 mr-2" />
            Add Window
          </Button>
        </div>

        {/* Window list */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : sortedWindows.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <Clock className="size-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium text-muted-foreground mb-1">No availability windows set</p>
            <p className="text-sm text-muted-foreground mb-4">
              Add windows to allow members to book appointments with you.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setEditWindow(null); setSheetOpen(true); }}
            >
              <Plus className="size-4 mr-2" />
              Add Your First Window
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedWindows.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between border border-border rounded-lg px-4 py-3 bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="size-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{DAYS_OF_WEEK[w.day_of_week]}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatTime12(w.start_minute)} – {formatTime12(w.end_minute)}
                    </p>
                    {(w.valid_from || w.valid_until) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {w.valid_from && `from ${w.valid_from}`}
                        {w.valid_from && w.valid_until && " "}
                        {w.valid_until && `until ${w.valid_until}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!w.is_active && (
                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => { setEditWindow(w); setSheetOpen(true); }}
                    aria-label="Edit window"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(w.id)}
                    aria-label="Delete window"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Sheet */}
      <WindowSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        existing={editWindow}
        userId={user?.id ?? 0}
      />

      {/* Delete confirm */}
      {deleteId !== null && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete availability window?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate(deleteId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Layout>
  );
}

interface WindowSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: AvailabilityWindow | null;
  userId: number;
}

function WindowSheet({ open, onOpenChange, existing, userId }: WindowSheetProps) {
  const { user } = useAuthStore();
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
          day_of_week: existing.day_of_week,
          start_time: minutesToTime(existing.start_minute),
          end_time: minutesToTime(existing.end_minute),
          valid_from: existing.valid_from ?? "",
          valid_until: existing.valid_until ?? "",
        }
      : {
          day_of_week: 0,
          start_time: "09:00",
          end_time: "17:00",
          valid_from: "",
          valid_until: "",
        },
  });

  const mutation = useMutation({
    mutationFn: async (data: WindowFormData) => {
      const payload = {
        user_id: userId,
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
      queryClient.invalidateQueries({ queryKey: ["/api/appointment-availability/windows", user?.id] });
      toast.success(isEdit ? "Window updated" : "Window added");
      onOpenChange(false);
      reset();
    },
    onError: () => toast.error("Failed to save"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <SheetContent>
        <SheetHeader className="mb-6">
          <SheetTitle>{isEdit ? "Edit Availability Window" : "Add Availability Window"}</SheetTitle>
          <SheetDescription>
            Set a recurring time block when you are available for interviews.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutateAsync(d))} className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="my-day">Day of Week</Label>
            <select
              id="my-day"
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
              <Label htmlFor="my-start">Start Time</Label>
              <Input id="my-start" type="time" {...register("start_time")} />
              {errors.start_time && <p className="text-xs text-destructive">{errors.start_time.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="my-end">End Time</Label>
              <Input id="my-end" type="time" {...register("end_time")} />
              {errors.end_time && <p className="text-xs text-destructive">{errors.end_time.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="my-from">Valid From (optional)</Label>
              <Input id="my-from" type="date" {...register("valid_from")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="my-until">Valid Until (optional)</Label>
              <Input id="my-until" type="date" {...register("valid_until")} />
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
