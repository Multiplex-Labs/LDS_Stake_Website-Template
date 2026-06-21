import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";
import { BUTTON_HOVER, BISHOP_CALLING_NAME } from "@/lib/constants";
import { useWardMap } from "@/lib/hooks";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import {
  X,
  TriangleAlert,
  CircleCheck,
  Check,
  UserPlus,
  UserMinus,
  Users,
  Info,
  FileText,
  CirclePlus,
  Trash2,
  Send,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/auth";
import type { Ward, ApiCalling, KanbanBoard } from "@/types";
import type { Path } from "react-hook-form";

const STAKE_CALLINGS = [
  "Stake High Councilor",
  "Stake Executive Secretary",
  "Stake Clerk",
  "Stake Sunday School First Counselor",
  "Stake Sunday School Second Counselor",
  "Stake Sunday School Secretary",
  "Stake Relief Society President",
  "Stake Relief Society 1st Counselor",
  "Stake Relief Society 2nd Counselor",
  "Stake Relief Society Secretary",
  "Stake Primary President",
  "Stake Primary 1st Counselor",
  "Stake Primary 2nd Counselor",
  "Stake Primary Secretary",
  "Other",
];

const WARD_CALLINGS = [
  "Bishop",
  "Bishopric First Counselor",
  "Bishopric Second Counselor",
  "Ward Executive Secretary",
  "Ward Assistant Executive Secretary",
  "Ward Clerk",
  "Ward Assistant Clerk",
  "Elders Quorum President",
  "Elders Quorum First Counselor",
  "Elders Quorum Second Counselor",
  "Other",
];

function getCallingList(wardId: number | undefined): string[] {
  return wardId ? WARD_CALLINGS : STAKE_CALLINGS;
}

const releaseEntrySchema = z.object({
  memberFirstName: z.string().min(1, "First name is required"),
  memberLastName: z.string().min(1, "Last name is required"),
  spouseName: z.string().optional(),
  wardId: z.number().int().positive().optional(),
  proposedCalling: z.string().min(1, "Calling is required"),
});

const formSchema = z
  .object({
    submissionType: z.enum(["calling", "release", "calling_and_release"]),
    memberFirstName: z.string().optional(),
    memberLastName: z.string().optional(),
    spouseName: z.string().optional(),
    wardId: z.number().optional(),
    proposedCalling: z.string().optional(),
    notes: z.string().optional(),
    releases: z.array(releaseEntrySchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (hasCalling(data.submissionType)) {
      if (!data.memberFirstName?.trim())
        ctx.addIssue({ code: "custom", path: ["memberFirstName"], message: "First name is required" });
      if (!data.memberLastName?.trim())
        ctx.addIssue({ code: "custom", path: ["memberLastName"], message: "Last name is required" });
      if (!data.wardId)
        ctx.addIssue({ code: "custom", path: ["wardId"], message: "Ward is required" });
      if (!data.proposedCalling?.trim())
        ctx.addIssue({ code: "custom", path: ["proposedCalling"], message: "Calling is required" });
    }
    if (hasReleases(data.submissionType)) {
      if (data.releases.length === 0)
        ctx.addIssue({ code: "custom", path: ["releases"], message: "At least one release is required" });
      data.releases.forEach((r, i) => {
        if (!r.wardId)
          ctx.addIssue({ code: "custom", path: ["releases", i, "wardId"], message: "Ward is required" });
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

// ---------- Helpers ----------

function hasCalling(type: FormValues["submissionType"]): boolean {
  return type === "calling" || type === "calling_and_release";
}

function hasReleases(type: FormValues["submissionType"]): boolean {
  return type === "release" || type === "calling_and_release";
}

function countMissingFields(
  first: string | undefined,
  last: string | undefined,
  wardId: number | undefined,
  calling: string | undefined,
): number {
  return [first?.trim(), last?.trim(), wardId ? "filled" : "", calling?.trim()].filter((v) => !v).length;
}

const NUMBER_WORDS = ["One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten"];
function releaseLabel(n: number): string {
  return `Release ${NUMBER_WORDS[n - 1] ?? n}`;
}

function makeEmptyRelease(presetWardId?: number) {
  return {
    memberFirstName: "",
    memberLastName: "",
    spouseName: "",
    wardId: presetWardId,
    proposedCalling: "",
  };
}

function isDuplicateProposal(
  board: KanbanBoard,
  fname: string,
  lname: string,
  wardId: number | undefined,
  proposedCalling: string,
): boolean {
  if (!fname.trim() || !lname.trim() || !wardId || !proposedCalling.trim()) return false;
  const fl = fname.trim().toLowerCase();
  const ll = lname.trim().toLowerCase();
  const cl = proposedCalling.trim().toLowerCase();
  return Object.values(board).some((proposals) =>
    proposals.some(
      (p) =>
        p.fname.toLowerCase() === fl &&
        p.lname.toLowerCase() === ll &&
        p.ward_id === wardId &&
        p.proposed_calling.toLowerCase() === cl,
    ),
  );
}

// ---------- Snapshot type for success screen ----------

interface SubmittedItem {
  label: "Calling" | "Release";
  name: string;
  calling: string;
  ward: string;
}

// ---------- DuplicateWarning ----------

function DuplicateWarning({ name, calling }: { name: string; calling: string }) {
  return (
    <div className="flex items-start gap-2 border border-yellow-500/40 bg-yellow-500/10 text-sm rounded-md p-3">
      <TriangleAlert className="size-4 shrink-0 mt-0.5 text-yellow-500" />
      <span>
        A proposal for <span className="font-medium">{name}</span> as{" "}
        <span className="font-medium">{calling}</span> is already in the pipeline.
      </span>
    </div>
  );
}

// ---------- ReleaseCard ----------

interface ReleaseCardProps {
  index: number;
  canRemove: boolean;
  onRemove: () => void;
  wards: Ward[];
  bishopWardId: number | undefined;
  showOtherCalling: boolean;
  onShowOtherCallingChange: (v: boolean) => void;
  board: KanbanBoard | undefined;
}

function ReleaseCard({
  index,
  canRemove,
  onRemove,
  wards,
  bishopWardId,
  showOtherCalling,
  onShowOtherCallingChange,
  board,
}: ReleaseCardProps) {
  const form = useFormContext<FormValues>();
  const p = (field: string) => `releases.${index}.${field}` as Path<FormValues>;

  const [releaseWardId, releaseFname, releaseLname, releaseCalling] = form.watch([
    p("wardId"),
    p("memberFirstName"),
    p("memberLastName"),
    p("proposedCalling"),
  ] as Path<FormValues>[]) as [number | undefined, string, string, string];

  const callingList = getCallingList(releaseWardId);

  const showDuplicate =
    board !== undefined &&
    isDuplicateProposal(board, releaseFname ?? "", releaseLname ?? "", releaseWardId, releaseCalling ?? "");

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">{releaseLabel(index + 1)}</span>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive gap-1.5"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        )}
      </div>

      <p className="text-sm font-medium">Person being released</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={form.control}
          name={p("memberFirstName")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <FormControl>
                <Input placeholder="John" {...field} value={field.value as string ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={p("memberLastName")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name</FormLabel>
              <FormControl>
                <Input placeholder="Doe" {...field} value={field.value as string ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={form.control}
          name={p("spouseName")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Spouse's First Name</FormLabel>
              <FormControl>
                <Input placeholder="Jane" {...field} value={field.value as string ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={p("wardId")}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ward</FormLabel>
              <Select
                onValueChange={(val) => field.onChange(Number(val))}
                value={(field.value as number | undefined)?.toString() ?? ""}
                disabled={bishopWardId !== undefined}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a ward" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {wards.map((ward) => (
                    <SelectItem key={ward.id} value={ward.id.toString()}>
                      {ward.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name={p("proposedCalling")}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Calling Being Released</FormLabel>
            {showOtherCalling ? (
              <div className="flex gap-4">
                <FormControl>
                  <Input
                    placeholder="Enter calling"
                    {...field}
                    value={field.value as string ?? ""}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className={BUTTON_HOVER}
                  onClick={() => {
                    onShowOtherCallingChange(false);
                    field.onChange("");
                  }}
                >
                  <X />
                </Button>
              </div>
            ) : (
              <Select
                onValueChange={(value) => {
                  if (value === "Other") {
                    onShowOtherCallingChange(true);
                    field.onChange("");
                  } else {
                    field.onChange(value);
                  }
                }}
                value={(field.value as string) ?? ""}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a calling" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-[300px]">
                  {callingList.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {showDuplicate && (
        <DuplicateWarning
          name={[releaseFname?.trim(), releaseLname?.trim()].filter(Boolean).join(" ")}
          calling={releaseCalling?.trim() ?? ""}
        />
      )}
    </div>
  );
}

// ---------- SubmissionSummary ----------

interface SubmissionSummaryProps {
  submissionType: "calling" | "release" | "calling_and_release";
  showCallingSection: boolean;
  showReleasesSection: boolean;
  callingName: string;
  callingWard: string;
  callingCalling: string;
  callingMissingCount: number;
  releases: Array<{
    name: string;
    ward: string;
    calling: string;
    missingCount: number;
  }>;
  isPending: boolean;
}

function SubmissionSummary({
  submissionType,
  showCallingSection,
  showReleasesSection,
  callingName,
  callingWard,
  callingCalling,
  callingMissingCount,
  releases,
  isPending,
}: SubmissionSummaryProps) {
  const typeLabel =
    submissionType === "calling"
      ? "New Calling"
      : submissionType === "release"
        ? "Release Only"
        : "Calling + Release";

  const callingComplete = showCallingSection && callingMissingCount === 0;

  return (
    <Card className="lg:h-[calc(100vh-6rem)] lg:flex lg:flex-col">
      <CardHeader className="pb-4 shrink-0">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <FileText className="size-5 text-primary" />
          </div>
          <div>
            <CardTitle>Submission Summary</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Review your submission details.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 overflow-hidden gap-4">
        {/* Submission Type */}
        <div className="shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Submission Type
          </p>
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary text-primary-foreground border-transparent">
            {typeLabel}
          </span>
        </div>

        <div className="border-t shrink-0" />

        {/* Calling Section */}
        {showCallingSection && (
          <div className="space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <UserPlus className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Calling Recommendation</p>
            </div>
            <div className="pl-6 space-y-0.5">
              <p className="text-sm font-medium">
                {callingName || (
                  <span className="text-muted-foreground italic">Name not entered</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {callingWard || <span className="italic">Ward not selected</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {callingCalling ? callingCalling : <span className="italic">Calling not selected</span>}
              </p>
            </div>
            <div className="pl-6">
              {callingComplete ? (
                <div className="flex items-center gap-1.5 text-xs text-green-500">
                  <span className="size-2 rounded-full bg-green-500 inline-block" />
                  Complete
                </div>
              ) : showCallingSection ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-yellow-500">
                    <span className="size-2 rounded-full bg-yellow-500 inline-block" />
                    Incomplete
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {callingMissingCount} required field{callingMissingCount !== 1 ? "s" : ""} remaining
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Releases Section — scrollable so the rest of the summary stays in view */}
        {showReleasesSection && releases.length > 0 && (
          <>
            {showCallingSection && <div className="border-t shrink-0" />}
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
              <div className="flex items-center gap-2 shrink-0">
                <FileText className="size-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Releases</p>
                <span className="ml-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs size-5 font-semibold">
                  {releases.length}
                </span>
              </div>
              {releases.map((r, i) => (
                <div key={i} className="pl-6 space-y-1 pb-2 border-b last:border-b-0">
                  <p className="text-xs text-muted-foreground font-medium">{releaseLabel(i + 1)}</p>
                  <p className="text-sm font-medium">
                    {r.name || (
                      <span className="text-muted-foreground italic">Name not entered</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.ward || <span className="italic">Ward not selected</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.calling || <span className="italic">Calling not selected</span>}
                  </p>
                  {r.missingCount === 0 ? (
                    <div className="flex items-center gap-1.5 text-xs text-green-500">
                      <span className="size-2 rounded-full bg-green-500 inline-block" />
                      Complete
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs text-yellow-500">
                        <span className="size-2 rounded-full bg-yellow-500 inline-block" />
                        Incomplete
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.missingCount} required field{r.missingCount !== 1 ? "s" : ""} remaining
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Before you submit + info note + buttons — always pinned to the bottom */}
        <div className="mt-auto shrink-0 space-y-4">
          <div className="border-t" />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Before you submit
            </p>
            <ul className="space-y-1.5">
              {[
                "Review all information for accuracy",
                "Ensure all required fields are complete",
                "You can add multiple releases if needed",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CircleCheck className="size-3.5 shrink-0 mt-0.5 text-green-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Info className="size-3.5 shrink-0 mt-0.5 text-primary" />
            <p className="text-xs text-muted-foreground">
              All submissions will be reviewed by the Stake Presidency. You will be notified of the
              decision.
            </p>
          </div>

          <div className="space-y-2">
            <Button type="submit" className="w-full gap-2" disabled={isPending}>
              <Send className="size-4" />
              {isPending ? "Submitting…" : "Submit for Review"}
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/leader/calling-system">Cancel</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- SubmitCalling ----------

export default function SubmitCalling() {
  const [, setLocation] = useLocation();
  const [showOtherCalling, setShowOtherCalling] = useState(false);
  const [releaseOtherCalling, setReleaseOtherCalling] = useState<Record<string, boolean>>({});
  const [submittedItems, setSubmittedItems] = useState<SubmittedItem[] | null>(null);

  const currentUser = useAuthStore((s) => s.user);

  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const { data: allCallings = [] } = useQuery<ApiCalling[]>({
    queryKey: ["/api/callings/"],
  });

  const { data: board } = useQuery<KanbanBoard>({
    queryKey: ["/api/calling-kanban/board"],
  });

  const bishopWardId = useMemo(() => {
    if (!currentUser?.callings || !wards.length || !allCallings.length) return undefined;
    const bishopCalling = allCallings.find(
      (c) => c.name.toLowerCase() === BISHOP_CALLING_NAME.toLowerCase(),
    );
    if (!bishopCalling) return undefined;
    const bishopUserCalling = currentUser.callings.find(
      (uc) => uc.calling_id === bishopCalling.id,
    );
    if (!bishopUserCalling) return undefined;
    return wards.find((w) => w.bishop_id === bishopUserCalling.id)?.id;
  }, [currentUser, allCallings, wards]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      submissionType: "calling",
      memberFirstName: "",
      memberLastName: "",
      spouseName: "",
      wardId: undefined,
      proposedCalling: "",
      notes: "",
      releases: [],
    },
  });

  useEffect(() => {
    if (bishopWardId !== undefined) {
      form.setValue("wardId", bishopWardId);
    }
  }, [bishopWardId, form]);

  const { fields: releaseFields, append: appendRelease, remove: removeRelease } = useFieldArray({
    control: form.control,
    name: "releases",
  });

  const watched = form.watch();
  const submissionType = watched.submissionType;

  const wardMap = useWardMap(wards);

  const showCallingSection = hasCalling(submissionType);
  const showReleasesSection = hasReleases(submissionType);

  const showCallingDuplicate = useMemo(
    () =>
      board !== undefined &&
      showCallingSection &&
      isDuplicateProposal(
        board,
        watched.memberFirstName ?? "",
        watched.memberLastName ?? "",
        watched.wardId,
        watched.proposedCalling ?? "",
      ),
    [board, showCallingSection, watched.memberFirstName, watched.memberLastName, watched.wardId, watched.proposedCalling],
  );

  const callingMissingCount = useMemo(() => {
    if (!showCallingSection) return 0;
    return countMissingFields(watched.memberFirstName, watched.memberLastName, watched.wardId, watched.proposedCalling);
  }, [showCallingSection, watched.memberFirstName, watched.memberLastName, watched.wardId, watched.proposedCalling]);

  const releaseSummaryData = useMemo(() => {
    if (!showReleasesSection) return [];
    return (watched.releases ?? []).map((r) => ({
      name: [r.memberFirstName?.trim(), r.memberLastName?.trim()].filter(Boolean).join(" "),
      ward: r.wardId ? (wardMap.get(r.wardId) ?? "") : "",
      calling: r.proposedCalling?.trim() ?? "",
      missingCount: countMissingFields(r.memberFirstName, r.memberLastName, r.wardId, r.proposedCalling),
    }));
  }, [showReleasesSection, watched.releases, wardMap]);

  function handleTypeChange(type: "calling" | "release" | "calling_and_release") {
    form.setValue("submissionType", type);
    if ((type === "release" || type === "calling_and_release") && releaseFields.length === 0) {
      appendRelease(makeEmptyRelease(bishopWardId));
    }
  }

  function addRelease() {
    appendRelease(makeEmptyRelease(bishopWardId));
  }

  function removeReleaseAt(index: number) {
    const fieldId = releaseFields[index].id;
    removeRelease(index);
    setReleaseOtherCalling((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  const submitMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const requests: Promise<Response>[] = [];

      if (hasCalling(values.submissionType)) {
        requests.push(
          apiRequest("POST", "/api/calling-kanban/proposals", {
            fname: values.memberFirstName,
            lname: values.memberLastName,
            spouse_name: values.spouseName ?? "",
            proposed_calling: values.proposedCalling,
            ward_id: values.wardId,
            is_release: false,
          }),
        );
      }

      if (hasReleases(values.submissionType)) {
        for (const r of values.releases) {
          requests.push(
            apiRequest("POST", "/api/calling-kanban/proposals", {
              fname: r.memberFirstName,
              lname: r.memberLastName,
              spouse_name: r.spouseName ?? "",
              proposed_calling: r.proposedCalling,
              ward_id: r.wardId,
              is_release: true,
            }),
          );
        }
      }

      return Promise.all(requests);
    },
    onSuccess: (_, values) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });

      const snapshot: SubmittedItem[] = [];

      if (hasCalling(values.submissionType)) {
        const fname = values.memberFirstName?.trim() ?? "";
        const lname = values.memberLastName?.trim() ?? "";
        snapshot.push({
          label: "Calling",
          name: [fname, lname].filter(Boolean).join(" "),
          calling: values.proposedCalling?.trim() ?? "",
          ward: values.wardId ? (wardMap.get(values.wardId) ?? "") : "",
        });
      }

      if (hasReleases(values.submissionType)) {
        for (const r of values.releases) {
          snapshot.push({
            label: "Release",
            name: [r.memberFirstName?.trim(), r.memberLastName?.trim()].filter(Boolean).join(" "),
            calling: r.proposedCalling?.trim() ?? "",
            ward: r.wardId ? (wardMap.get(r.wardId) ?? "") : "",
          });
        }
      }

      setSubmittedItems(snapshot);
    },
    onError: () => {
      toast.error("Submission Failed", {
        description: "Could not submit. Please try again.",
      });
    },
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Submit a Calling</h1>
          <p className="text-muted-foreground mt-2">
            Submit a calling or release for stake review and approval.
          </p>
        </div>

        {submittedItems !== null && (
          <Card className="max-w-lg mx-auto text-center">
            <CardContent className="pt-10 pb-10 space-y-6">
              <CircleCheck className="size-12 text-primary mx-auto" />
              <h2 className="text-2xl font-bold">Submitted Successfully</h2>
              <ul className="space-y-2 text-left inline-block">
                {submittedItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="size-4 shrink-0 mt-0.5 text-primary" />
                    <span>
                      <span className="font-medium">{item.label}</span>
                      {" — "}
                      {item.name && (
                        <>
                          <span>{item.name}</span>
                          {item.calling && (
                            <span className="text-muted-foreground">
                              {" "}→ {item.calling}
                              {item.ward ? ` (${item.ward})` : ""}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => setLocation("/leader/calling-system")}
                >
                  View on Board
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    form.reset();
                    setReleaseOtherCalling({});
                    setShowOtherCalling(false);
                    setSubmittedItems(null);
                  }}
                >
                  Submit Another
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {submittedItems === null && (
          <>
            {/* Type Selector */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {(
                [
                  {
                    type: "calling",
                    icon: UserPlus,
                    title: "New Calling",
                    description: "Recommend a new calling",
                  },
                  {
                    type: "release",
                    icon: UserMinus,
                    title: "Release Only",
                    description: "Release a member from a calling",
                  },
                  {
                    type: "calling_and_release",
                    icon: Users,
                    title: "Calling + Release",
                    description: "Recommend and release",
                  },
                ] as const
              ).map(({ type, icon: Icon, title, description }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={[
                    "flex flex-col gap-1 items-start p-4 rounded-lg border cursor-pointer transition-colors text-left",
                    submissionType === type
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted/50",
                  ].join(" ")}
                >
                  <Icon className="size-5 mb-1" />
                  <span className="font-semibold text-sm">{title}</span>
                  <span className="text-xs opacity-70">{description}</span>
                </button>
              ))}
            </div>


            <Form {...form}>
              <form
                id="submit-calling-form"
                onSubmit={form.handleSubmit((v) => {
                  submitMutation.mutate(v);
                })}
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                  <div className="flex-1 space-y-6">
                    {/* Calling Recommendation Card */}
                    {showCallingSection && (
                      <Card>
                        <CardHeader className="pb-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <UserPlus className="size-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle>Calling Recommendation</CardTitle>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="grid gap-6">
                          <p className="text-sm font-medium">Person being recommended</p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                              control={form.control}
                              name="memberFirstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>First Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="John" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="memberLastName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Last Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Doe" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                              control={form.control}
                              name="spouseName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Spouse's First Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Jane" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="wardId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Ward</FormLabel>
                                  <Select
                                    onValueChange={(val) => field.onChange(Number(val))}
                                    value={field.value?.toString() ?? ""}
                                    disabled={bishopWardId !== undefined}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a ward" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {wards.map((ward) => (
                                        <SelectItem key={ward.id} value={ward.id.toString()}>
                                          {ward.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name="proposedCalling"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Calling / Assignment</FormLabel>
                                {showOtherCalling ? (
                                  <div className="flex gap-4">
                                    <FormControl>
                                      <Input placeholder="Enter custom calling" {...field} />
                                    </FormControl>
                                    <Button
                                      type="button"
                                      className={BUTTON_HOVER}
                                      variant="secondary"
                                      size="icon"
                                      onClick={() => {
                                        setShowOtherCalling(false);
                                        field.onChange("");
                                      }}
                                    >
                                      <X />
                                    </Button>
                                  </div>
                                ) : (
                                  <Select
                                    onValueChange={(value) => {
                                      if (value === "Other") {
                                        setShowOtherCalling(true);
                                        field.onChange("");
                                      } else {
                                        field.onChange(value);
                                      }
                                    }}
                                    value={field.value ?? ""}
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a calling" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="max-h-[300px]">
                                      {getCallingList(watched.wardId).map((calling) => (
                                        <SelectItem key={calling} value={calling}>
                                          {calling}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {showCallingDuplicate && (
                            <DuplicateWarning
                              name={[
                                watched.memberFirstName?.trim(),
                                watched.memberLastName?.trim(),
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              calling={watched.proposedCalling?.trim() ?? ""}
                            />
                          )}

                          <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Notes{" "}
                                  <span className="text-muted-foreground font-normal">
                                    (Optional)
                                  </span>
                                </FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Add any additional context or notes about this recommendation..."
                                    className="min-h-[100px] resize-none"
                                    maxLength={500}
                                    {...field}
                                  />
                                </FormControl>
                                <div className="flex justify-end">
                                  <span className="text-xs text-muted-foreground">
                                    {(field.value ?? "").length} / 500
                                  </span>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>
                    )}

                    {/* Releases Section */}
                    {showReleasesSection && (
                      <Card>
                        <CardHeader className="pb-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <FileText className="size-5 text-primary" />
                            </div>
                            <div>
                              <CardTitle>Release(s)</CardTitle>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {releaseFields.map((releaseField, index) => (
                            <ReleaseCard
                              key={releaseField.id}
                              index={index}
                              canRemove={
                                submissionType === "calling_and_release" ||
                                releaseFields.length > 1
                              }
                              onRemove={() => removeReleaseAt(index)}
                              wards={wards}
                              bishopWardId={bishopWardId}
                              showOtherCalling={releaseOtherCalling[releaseField.id] ?? false}
                              onShowOtherCallingChange={(v) =>
                                setReleaseOtherCalling((prev) => ({
                                  ...prev,
                                  [releaseField.id]: v,
                                }))
                              }
                              board={board}
                            />
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2 w-full"
                            onClick={addRelease}
                          >
                            <CirclePlus className="h-4 w-4" />
                            Add another release
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-4">
                    <SubmissionSummary
                      submissionType={submissionType}
                      showCallingSection={showCallingSection}
                      showReleasesSection={showReleasesSection}
                      callingName={[
                        watched.memberFirstName?.trim(),
                        watched.memberLastName?.trim(),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      callingWard={watched.wardId ? (wardMap.get(watched.wardId) ?? "") : ""}
                      callingCalling={watched.proposedCalling?.trim() ?? ""}
                      callingMissingCount={callingMissingCount}
                      releases={releaseSummaryData}
                      isPending={submitMutation.isPending}
                    />
                  </div>
                </div>
              </form>
            </Form>
          </>
        )}
      </div>

    </Layout>
  );
}
