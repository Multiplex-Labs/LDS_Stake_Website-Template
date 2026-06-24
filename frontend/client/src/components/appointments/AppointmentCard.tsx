import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { ICON_MAP } from "./iconMap";
import type { AppointmentType, TempleRecommendConfig } from "@/types";

interface AvailableDatesResponse {
  available_dates: string[];
}

interface AppointmentCardProps {
  type: AppointmentType;
  config: TempleRecommendConfig | undefined;
  onBook: (type: AppointmentType) => void;
}

export function AppointmentCard({ type, config, onBook }: AppointmentCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const { data: availData, isLoading: availLoading } = useQuery<AvailableDatesResponse>({
    queryKey: ["/api/appointment-availability/available-dates", type.id, year, month],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/appointment-availability/available-dates?type_id=${type.id}&year=${year}&month=${month}`,
      ).then((r) => r.json()),
  });

  const hasSlots = (availData?.available_dates?.length ?? 0) > 0;
  const IconComponent = ICON_MAP[type.icon_name] ?? Calendar;

  return (
    <>
      <Card className="flex flex-col h-full bg-card border border-border shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardContent className="flex flex-col flex-1 p-5 gap-4">
          {/* Icon + Name + Duration */}
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-14 h-14 rounded-full bg-primary flex items-center justify-center">
              <IconComponent className="size-6 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base leading-snug text-foreground">{type.name}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <Clock className="size-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{type.duration_mins} mins</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed flex-1">
            {type.description}
          </p>

          {/* Actions */}
          <div className="flex gap-2 mt-auto pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-2"
              onClick={() => setDetailsOpen(true)}
            >
              <Info className="size-4" />
              Details
            </Button>

            {availLoading ? (
              <Skeleton className="h-9 flex-1 rounded-md" />
            ) : hasSlots ? (
              <Button
                size="sm"
                className="flex-1 gap-2"
                onClick={() => onBook(type)}
              >
                <Calendar className="size-4" />
                Book
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex-1">
                    <Button size="sm" className="w-full gap-2" disabled>
                      <Calendar className="size-4" />
                      Book
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>No appointments currently available</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details Sheet */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <IconComponent className="size-5 text-primary" />
              </div>
              <div>
                <SheetTitle>{type.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-1 mt-0.5">
                  <Clock className="size-3" />
                  {type.duration_mins} minutes
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">{type.description}</p>
            {type.details && (
              <div className="border-t border-border pt-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{type.details}</p>
              </div>
            )}
            {config && (
              <div className="border-t border-border pt-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Location</p>
                <p className="text-sm">{config.location_name}</p>
                <p className="text-sm text-muted-foreground">{config.location_address}</p>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <Button
              className="w-full gap-2"
              disabled={!hasSlots}
              onClick={() => {
                setDetailsOpen(false);
                onBook(type);
              }}
            >
              <Calendar className="size-4" />
              {hasSlots ? "Book This Appointment" : "No Availability"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
