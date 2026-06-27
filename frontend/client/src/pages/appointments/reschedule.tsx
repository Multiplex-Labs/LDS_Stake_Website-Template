import { useRef, useEffect } from "react";
import { useSearch } from "wouter";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { BookingSheet } from "@/components/appointments/BookingSheet";
import { apiRequest } from "@/lib/queryClient";

interface RescheduleInfo {
  member_name: string;
  member_email: string;
  member_phone: string;
}

type ErrorState =
  | "already_rescheduled"
  | "not_found"
  | "within_cutoff"
  | null;

function parseErrorState(error: unknown): { state: ErrorState; cutoffDetail: string | null } {
  if (!(error instanceof Error)) return { state: "not_found", cutoffDetail: null };

  const msg = error.message;
  const colonIdx = msg.indexOf(":");
  if (colonIdx === -1) return { state: "not_found", cutoffDetail: null };

  const statusCode = parseInt(msg.slice(0, colonIdx).trim(), 10);
  const bodyText = msg.slice(colonIdx + 1).trim();

  if (statusCode === 403 || statusCode === 404) {
    return { state: "not_found", cutoffDetail: null };
  }

  if (statusCode === 409) {
    let detail = "";
    try {
      const parsed = JSON.parse(bodyText);
      detail = (parsed?.detail as string) ?? "";
    } catch {
      detail = bodyText;
    }

    if (detail.toLowerCase().includes("rescheduled")) {
      return { state: "already_rescheduled", cutoffDetail: null };
    }
    if (detail.toLowerCase().includes("cutoff")) {
      return { state: "within_cutoff", cutoffDetail: detail };
    }
    return { state: "not_found", cutoffDetail: null };
  }

  return { state: "not_found", cutoffDetail: null };
}

interface ErrorCardProps {
  heading: string;
  subtext: string;
}

function ErrorCard({ heading, subtext }: ErrorCardProps) {
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <h1 className="font-serif text-3xl font-bold">{heading}</h1>
      <p className="text-muted-foreground max-w-md">{subtext}</p>
      <Button asChild>
        <Link href="/stake-info/temple-recommend">Return to Scheduling</Link>
      </Button>
    </div>
  );
}

export default function ReschedulePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const typeIdParam = params.get("type_id");
  const typeId = typeIdParam !== null ? parseInt(typeIdParam, 10) : undefined;

  const initialMemberInfoRef = useRef<RescheduleInfo | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const {
    isLoading,
    isSuccess,
    isError,
    error,
    data,
  } = useQuery<RescheduleInfo>({
    queryKey: ["/api/appointment-bookings/reschedule-info", token],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/appointment-bookings/reschedule-info?token=${encodeURIComponent(token)}`,
      ).then((r) => r.json() as Promise<RescheduleInfo>),
    enabled: !!token,
    retry: false,
  });

  if (data && !initialMemberInfoRef.current) {
    initialMemberInfoRef.current = data;
  }

  useEffect(() => {
    if (!isLoading && isSuccess) {
      headingRef.current?.focus();
    }
  }, [isLoading, isSuccess]);

  const noToken = !token && !isLoading;
  const { state: errorState, cutoffDetail } =
    isError ? parseErrorState(error) : { state: null as ErrorState, cutoffDetail: null };

  const resolvedErrorState: ErrorState = noToken ? "not_found" : errorState;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center gap-4 py-24">
            <Spinner className="size-8" />
            <p className="text-muted-foreground text-sm">Verifying your link...</p>
          </div>
        )}

        {/* Error: appointment already rescheduled (409 + ALREADY_RESCHEDULED) */}
        {resolvedErrorState === "already_rescheduled" && (
          <ErrorCard
            heading="Appointment already rescheduled"
            subtext="This reschedule link has been used. Check your email for the updated appointment details."
          />
        )}

        {/* Error: not found or cancelled (404) */}
        {resolvedErrorState === "not_found" && (
          <ErrorCard
            heading="Link not found"
            subtext="This appointment may have been cancelled or the link is invalid."
          />
        )}

        {/* Error: within cutoff window (409 + WITHIN_CUTOFF) */}
        {resolvedErrorState === "within_cutoff" && (
          <ErrorCard
            heading="Too late to reschedule"
            subtext={
              cutoffDetail ??
              "Appointments cannot be rescheduled within 24 hours of the scheduled time."
            }
          />
        )}

        {/* Success: valid token — show booking sheet */}
        {isSuccess && initialMemberInfoRef.current && (
          <>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-serif text-3xl font-bold text-center mb-6 outline-none"
            >
              Reschedule Your Appointment
            </h1>
            <BookingSheet
              type={null}
              mode="reschedule"
              open={true}
              onOpenChange={() => {
                /* non-closeable on this page */
              }}
              config={undefined}
              initialMemberInfo={initialMemberInfoRef.current}
              typeId={typeId}
              rescheduleToken={token}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
