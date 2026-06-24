import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  Shirt,
  Info,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { AppointmentCard } from "@/components/appointments/AppointmentCard";
import { BookingSheet } from "@/components/appointments/BookingSheet";
import type { TempleRecommendConfig, AppointmentType } from "@/types";

export default function TempleRecommend() {
  const [bookingType, setBookingType] = useState<AppointmentType | null>(null);

  const { data: config, isLoading: configLoading } = useQuery<TempleRecommendConfig>({
    queryKey: ["/api/temple-config"],
  });

  const { data: types, isLoading: typesLoading } = useQuery<AppointmentType[]>({
    queryKey: ["/api/appointment-types"],
  });

  const activeTypes = types?.filter((t) => t.is_active) ?? [];

  return (
    <Layout>
      {/* Hero */}
      <section className="relative bg-card border-b border-border py-16 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Temple Recommend Appointments
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Information and appointment scheduling with the Stake Presidency.
          </p>
        </div>
      </section>

      {/* Two-column info section */}
      <section className="py-12 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* LEFT — No Appointment Needed */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
                  <Users className="size-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground leading-snug">
                    No Appointment Needed
                  </h2>
                  <p className="text-sm font-medium text-green-500 mt-0.5">
                    Temple Recommend Renewals and Ecclesiastical Endorsements
                  </p>
                </div>
              </div>

              {configLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {config?.open_hours_text ??
                    "No appointment is needed. Open interviews are held at the Stake Center from 8:30am to 3:30 pm on all Sundays except Fast Sunday, General Conference, Stake Conference, Easter, and Christmas."}
                </p>
              )}

              {/* Mini info boxes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 border border-border rounded-lg p-4 flex items-start gap-3">
                  <Clock className="size-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Open Interview Hours</p>
                    <p className="text-sm text-muted-foreground mt-1">Sundays</p>
                    <p className="text-sm text-muted-foreground">8:30am – 3:30pm</p>
                  </div>
                </div>
                <div className="bg-muted/30 border border-border rounded-lg p-4 flex items-start gap-3">
                  <MapPin className="size-5 text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Location</p>
                    {configLoading ? (
                      <Skeleton className="h-3 w-24 mt-1" />
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mt-1">
                          {config?.location_address
                            ? config.location_address.split(",")[0].trim()
                            : "1550 N 400 E"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {config?.location_address
                            ? config.location_address.split(",").slice(1).join(",").trim()
                            : "Logan, UT 84321"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Exception note */}
              {(configLoading || config?.exception_note) && (
                <div className="bg-muted/30 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
                  <Info className="size-5 text-green-400 mt-0.5 flex-shrink-0" />
                  {configLoading ? (
                    <Skeleton className="h-4 w-full" />
                  ) : (
                    <p className="text-sm text-green-400">{config!.exception_note}</p>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT — Appointment Required */}
            <div className="bg-card border border-border rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Calendar className="size-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground leading-snug">
                    Appointment Required
                  </h2>
                  <p className="text-sm font-medium text-primary mt-0.5">
                    Living Ordinance Recommends and Weekday Appointments
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                For all Living Ordinance Recommends or if you need a weekday appointment, including
                Endowments, Sealings, and Priesthood Advancements. An appointment with the Stake
                Presidency is needed.
              </p>

              <p className="text-sm text-muted-foreground leading-relaxed">
                Please select the appropriate option below and schedule an appointment with the
                presidency.
              </p>

              {/* Dress code callout */}
              <div className="border border-primary/30 bg-primary/5 rounded-lg p-4 flex items-start gap-3">
                <Shirt className="size-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold uppercase text-primary mb-1">
                    Please Come in Sunday Dress
                  </p>
                  <p className="text-sm text-muted-foreground">
                    as you would to Sacrament meeting or visiting the Temple.
                  </p>
                </div>
              </div>

              {/* Sealings callout */}
              <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold uppercase text-amber-500 mb-1">
                    Sealings
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Your interview must be less than 2 weeks of your sealing date.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Schedule section */}
      <section className="py-12 bg-muted/20 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Schedule an Appointment
            </h2>
          </div>

          {typesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full rounded-xl" />
              ))}
            </div>
          ) : activeTypes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="size-10 mx-auto mb-3 opacity-40" />
              <p>No appointment types are currently available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeTypes.map((type) => (
                <AppointmentCard
                  key={type.id}
                  type={type}
                  config={config}
                  onBook={setBookingType}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Booking Sheet */}
      <BookingSheet
        type={bookingType}
        open={bookingType !== null}
        onOpenChange={(open) => {
          if (!open) setBookingType(null);
        }}
        config={config}
      />
    </Layout>
  );
}
