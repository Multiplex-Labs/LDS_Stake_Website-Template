import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, addMonths } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CalendarCheck,
  Clock,
  MapPin,
  CheckCircle,
  ChevronRight,
  AlertTriangle,
  Download,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AppointmentType, AppointmentSlot, Booking, TempleRecommendConfig } from "@/types";

// --- Zod schema ---
const bookingSchema = z.object({
  member_name: z.string().min(2, "Name is required"),
  member_email: z.string().email("Valid email is required"),
  member_phone: z.string().min(7, "Phone number is required"),
  _honeypot: z.string().max(0, "Bot detected"),
});

type BookingFormData = z.infer<typeof bookingSchema>;

// --- ICS generation ---
function generateICS(booking: Booking, typeName: string, location: string): string {
  const start = new Date(booking.start_datetime)
    .toISOString()
    .replace(/[-:]/g, "")
    .split(".")[0] + "Z";
  const end = new Date(booking.end_datetime)
    .toISOString()
    .replace(/[-:]/g, "")
    .split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Temple Recommend Scheduler//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:Temple Recommend Appointment - ${typeName}`,
    `LOCATION:${location}`,
    `DESCRIPTION:Please come in Sunday dress.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(booking: Booking, typeName: string, location: string) {
  const content = generateICS(booking, typeName, location);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "temple-appointment.ics";
  a.click();
  URL.revokeObjectURL(url);
}

function buildGoogleCalLink(booking: Booking, typeName: string, locationAddress: string): string {
  const compactDate = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Temple Recommend Appointment - ${typeName}`,
    dates: `${compactDate(booking.start_datetime)}/${compactDate(booking.end_datetime)}`,
    details: "Please come in Sunday dress.",
    location: locationAddress,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildOutlookLink(booking: Booking, typeName: string, locationAddress: string): string {
  const params = new URLSearchParams({
    subject: `Temple Recommend Appointment - ${typeName}`,
    startdt: booking.start_datetime,
    enddt: booking.end_datetime,
    body: "Please come in Sunday dress.",
    location: locationAddress,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function formatLocalTime(utcIso: string): string {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(utcIso));
}

function formatLocalDate(utcIso: string): string {
  return new Intl.DateTimeFormat([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(utcIso));
}

// --- Slot availability types ---
interface AvailableDatesResponse {
  available_dates: string[];
}

interface SlotGroup {
  label: string;
  slots: AppointmentSlot[];
}

function groupSlots(slots: AppointmentSlot[]): SlotGroup[] {
  const morning: AppointmentSlot[] = [];
  const afternoon: AppointmentSlot[] = [];

  for (const slot of slots) {
    const hour = new Date(slot.slot_datetime_utc).getHours();
    if (hour < 12) {
      morning.push(slot);
    } else {
      afternoon.push(slot);
    }
  }

  const groups: SlotGroup[] = [];
  if (morning.length > 0) groups.push({ label: "Morning", slots: morning });
  if (afternoon.length > 0) groups.push({ label: "Afternoon", slots: afternoon });
  return groups;
}

// --- Main component ---
interface BookingSheetProps {
  type: AppointmentType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: TempleRecommendConfig | undefined;
}

export function BookingSheet({ type, open, onOpenChange, config }: BookingSheetProps) {
  const [displayedMonth, setDisplayedMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth() + 1;

  const { data: availData, isLoading: availLoading } = useQuery<AvailableDatesResponse>({
    queryKey: ["/api/appointment-availability/available-dates", type?.id, year, month],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/appointment-availability/available-dates?type_id=${type!.id}&year=${year}&month=${month}`,
      ).then((r) => r.json()),
    enabled: open && type !== null,
  });

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;

  const { data: slotsData, isLoading: slotsLoading } = useQuery<AppointmentSlot[]>({
    queryKey: ["/api/appointment-availability/slots", type?.id, dateStr],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/appointment-availability/slots?type_id=${type!.id}&date_from=${dateStr}&date_to=${dateStr}`,
      ).then((r) => r.json()),
    enabled: open && type !== null && dateStr !== null,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { _honeypot: "" },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: BookingFormData) => {
      if (!type || !selectedSlot) throw new Error("No slot selected");
      const res = await apiRequest("POST", "/api/appointment-bookings", {
        appointment_type_id: type.id,
        slot_datetime_utc: selectedSlot.slot_datetime_utc,
        member_name: data.member_name,
        member_email: data.member_email,
        member_phone: data.member_phone,
        _honeypot: data._honeypot,
      });
      return (await res.json()) as Booking;
    },
    onSuccess: (data) => {
      setBooking(data);
      setSlotError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "An error occurred";
      if (msg.startsWith("409")) {
        setSlotError(
          "That slot was just taken by someone else. Please select a different time.",
        );
        setSelectedSlot(null);
        queryClient.invalidateQueries({
          queryKey: ["/api/appointment-availability/slots", type?.id, dateStr],
        });
      } else {
        setSlotError("Something went wrong. Please try again.");
      }
    },
  });

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) {
        setSelectedDate(undefined);
        setSelectedSlot(null);
        setSlotError(null);
        setBooking(null);
        setDisplayedMonth(new Date());
        reset();
        submitMutation.reset();
      }
      onOpenChange(open);
    },
    [onOpenChange, reset, submitMutation],
  );

  const availableDates = availData?.available_dates ?? [];
  const hasNoAvailability = !availLoading && availableDates.length === 0;
  const slotGroups = slotsData ? groupSlots(slotsData) : [];

  if (!type) return null;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
        <SheetHeader className="mb-4">
          <SheetTitle>Book Appointment</SheetTitle>
          <SheetDescription>{type.name}</SheetDescription>
        </SheetHeader>

        {/* Success state */}
        {booking ? (
          <SuccessView
            booking={booking}
            typeName={type.name}
            config={config}
          />
        ) : (
          /* Step 1: date + slot + form */
          <form onSubmit={handleSubmit((data) => submitMutation.mutateAsync(data))} className="space-y-6">
            {/* Calendar */}
            <div>
              <p className="text-sm font-medium mb-3">Select a date</p>
              {availLoading ? (
                <Skeleton className="h-64 w-full rounded-md" />
              ) : hasNoAvailability ? (
                <div className="border border-border rounded-md p-4 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No availability in{" "}
                    {displayedMonth.toLocaleString("default", { month: "long", year: "numeric" })}.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDisplayedMonth((m) => addMonths(m, 1))}
                  >
                    Try{" "}
                    {addMonths(displayedMonth, 1).toLocaleString("default", { month: "long" })}{" "}
                    <ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              ) : (
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSelectedSlot(null);
                    setSlotError(null);
                  }}
                  month={displayedMonth}
                  onMonthChange={setDisplayedMonth}
                  disabled={(date) => {
                    const ds = format(date, "yyyy-MM-dd");
                    return !availableDates.includes(ds);
                  }}
                  className="rounded-md border border-border"
                />
              )}
            </div>

            {/* Slot picker */}
            {selectedDate && (
              <div>
                <p className="text-sm font-medium mb-3">
                  Select a time —{" "}
                  {format(selectedDate, "MMMM d, yyyy")}
                </p>

                {slotError && (
                  <div className="flex items-start gap-2 text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3 mb-3">
                    <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" />
                    <span>{slotError}</span>
                  </div>
                )}

                {slotsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : slotGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    No slots available on this date — try another day.
                  </p>
                ) : (
                  <RadioGroup
                    value={selectedSlot?.slot_datetime_utc ?? ""}
                    onValueChange={(val) => {
                      const slot = slotsData?.find((s) => s.slot_datetime_utc === val) ?? null;
                      setSelectedSlot(slot);
                    }}
                    className="space-y-4"
                  >
                    {slotGroups.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {group.slots.map((slot) => {
                            const isSelected =
                              selectedSlot?.slot_datetime_utc === slot.slot_datetime_utc;
                            return (
                              <label
                                key={slot.slot_datetime_utc}
                                className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                                }`}
                              >
                                <RadioGroupItem
                                  value={slot.slot_datetime_utc}
                                  id={slot.slot_datetime_utc}
                                  className="sr-only"
                                />
                                <Clock className="size-3 text-muted-foreground flex-shrink-0" />
                                <span>{formatLocalTime(slot.slot_datetime_utc)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              </div>
            )}

            {/* Member info form */}
            {selectedSlot && (
              <>
                <Separator />
                <div className="space-y-4">
                  <p className="text-sm font-medium">Your information</p>

                  {/* Honeypot — visually hidden */}
                  <input
                    {...register("_honeypot")}
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute opacity-0 h-0 w-0 pointer-events-none"
                  />

                  <div className="space-y-1">
                    <Label htmlFor="member_name">Full Name</Label>
                    <Input
                      id="member_name"
                      {...register("member_name")}
                      placeholder="Jane Smith"
                      autoComplete="name"
                    />
                    {errors.member_name && (
                      <p className="text-xs text-destructive">{errors.member_name.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="member_email">Email Address</Label>
                    <Input
                      id="member_email"
                      type="email"
                      {...register("member_email")}
                      placeholder="jane@example.com"
                      autoComplete="email"
                    />
                    {errors.member_email && (
                      <p className="text-xs text-destructive">{errors.member_email.message}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="member_phone">Phone Number</Label>
                    <Input
                      id="member_phone"
                      type="tel"
                      {...register("member_phone")}
                      placeholder="(435) 555-0123"
                      autoComplete="tel"
                    />
                    {errors.member_phone && (
                      <p className="text-xs text-destructive">{errors.member_phone.message}</p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || submitMutation.isPending}
                >
                  {submitMutation.isPending ? "Booking..." : "Confirm Appointment"}
                </Button>
              </>
            )}
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

// --- Success view ---
interface SuccessViewProps {
  booking: Booking;
  typeName: string;
  config: TempleRecommendConfig | undefined;
}

function SuccessView({ booking, typeName, config }: SuccessViewProps) {
  const locationAddress = config?.location_address ?? "";
  const locationName = config?.location_name ?? "Stake Center";

  return (
    <div className="space-y-6">
      {/* Confirmation banner */}
      <div className="flex items-center gap-3 bg-primary/10 text-primary rounded-lg p-4">
        <CheckCircle className="size-5 flex-shrink-0" />
        <div>
          <p className="font-medium text-sm">Appointment Requested</p>
          <p className="text-xs opacity-80">
            Confirmation email sent to {booking.member_email}
          </p>
        </div>
      </div>

      {/* Booking summary */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Appointment Details
        </h3>
        <div className="border border-border rounded-md divide-y divide-border">
          <SummaryRow icon={<CalendarCheck className="size-4" />} label="Type" value={typeName} />
          <SummaryRow
            icon={<Clock className="size-4" />}
            label="Date"
            value={formatLocalDate(booking.start_datetime)}
          />
          <SummaryRow
            icon={<Clock className="size-4" />}
            label="Time"
            value={`${formatLocalTime(booking.start_datetime)} – ${formatLocalTime(booking.end_datetime)}`}
          />
          <SummaryRow
            icon={<MapPin className="size-4" />}
            label="Location"
            value={locationName}
            subvalue={locationAddress}
          />
        </div>
      </div>

      {/* Calendar links */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Add to Calendar
        </h3>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            asChild
          >
            <a
              href={buildGoogleCalLink(booking, typeName, locationAddress)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <CalendarCheck className="size-4" />
              Add to Google Calendar
            </a>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            asChild
          >
            <a
              href={buildOutlookLink(booking, typeName, locationAddress)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <CalendarCheck className="size-4" />
              Add to Outlook
            </a>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => downloadICS(booking, typeName, locationAddress)}
          >
            <Download className="size-4" />
            Download .ics File
          </Button>
        </div>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subvalue?: string;
}

function SummaryRow({ icon, label, value, subvalue }: SummaryRowProps) {
  return (
    <div className="flex items-start gap-3 p-3">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
        {subvalue && <p className="text-xs text-muted-foreground">{subvalue}</p>}
      </div>
    </div>
  );
}
