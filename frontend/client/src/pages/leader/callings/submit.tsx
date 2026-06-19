import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useFieldArray, useForm, useFormContext } from "react-hook-form";
import { BUTTON_HOVER, BISHOP_CALLING_NAME } from "@/lib/constants";
import { useWardMap } from "@/lib/hooks";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Save, X, Plus, Diamond, TriangleAlert, CircleCheck, Check } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
    submissionType: z.enum(["calling", "release"]),
    memberFirstName: z.string().optional(),
    memberLastName: z.string().optional(),
    spouseName: z.string().optional(),
    wardId: z.number().optional(),
    proposedCalling: z.string().optional(),
    notes: z.string().optional(),
    includeReleases: z.boolean().default(false),
    releases: z.array(releaseEntrySchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.submissionType === "calling") {
      if (!data.memberFirstName?.trim())
        ctx.addIssue({ code: "custom", path: ["memberFirstName"], message: "First name is required" });
      if (!data.memberLastName?.trim())
        ctx.addIssue({ code: "custom", path: ["memberLastName"], message: "Last name is required" });
      if (!data.wardId)
        ctx.addIssue({ code: "custom", path: ["wardId"], message: "Ward is required" });
      if (!data.proposedCalling?.trim())
        ctx.addIssue({ code: "custom", path: ["proposedCalling"], message: "Calling is required" });
    }
    if (data.submissionType === "release" && data.releases.length === 0)
      ctx.addIssue({ code: "custom", path: ["releases"], message: "At least one release is required" });
    if (data.submissionType === "release" || data.includeReleases) {
      data.releases.forEach((r, i) => {
        if (!r.wardId)
          ctx.addIssue({ code: "custom", path: ["releases", i, "wardId"], message: "Ward is required" });
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

// ---------- Helpers ----------

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
  return Object.values(board).some((proposals) =>
    proposals.some(
      (p) =>
        p.fname.toLowerCase() === fname.trim().toLowerCase() &&
        p.lname.toLowerCase() === lname.trim().toLowerCase() &&
        p.ward_id === wardId &&
        p.proposed_calling.toLowerCase() === proposedCalling.trim().toLowerCase(),
    ),
  );
}

function buildButtonLabel(isPending: boolean, callingCount: number, releaseCount: number): string {
  if (isPending) return "Submitting…";
  const parts = [
    callingCount > 0 && `${callingCount} Calling`,
    releaseCount > 0 && `${releaseCount} Release${releaseCount > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return parts.length > 0 ? `Submit ${parts.join(" + ")}` : "Submit";
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
    `releases.${index}.wardId`,
    `releases.${index}.memberFirstName`,
    `releases.${index}.memberLastName`,
    `releases.${index}.proposedCalling`,
  ] as Path<FormValues>[]) as [number | undefined, string, string, string];

  const callingList = getCallingList(releaseWardId);

  const showDuplicate =
    board !== undefined &&
    isDuplicateProposal(board, releaseFname ?? "", releaseLname ?? "", releaseWardId, releaseCalling ?? "");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Release {index + 1}</CardTitle>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-6">
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
      </CardContent>
    </Card>
  );
}

// ---------- SubmissionSummary ----------

interface SummaryItem {
  label: "Calling" | "Release";
  name: string;
  calling: string;
  ward: string;
}

interface SubmissionSummaryProps {
  items: SummaryItem[];
  isPending: boolean;
  callingCount: number;
  releaseCount: number;
}

function SubmissionSummary({ items, isPending, callingCount, releaseCount }: SubmissionSummaryProps) {
  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Submission Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Diamond className="size-3 mt-0.5 shrink-0 text-primary fill-primary" />
                <span>
                  <span className="font-medium">{item.label}</span>
                  {" — "}
                  {item.name ? (
                    <>
                      <span>{item.name}</span>
                      {item.calling && (
                        <>
                          {" "}
                          <span className="text-muted-foreground">
                            → {item.calling}
                            {item.ward ? ` (${item.ward})` : ""}
                          </span>
                        </>
                      )}
                    </>
                  ) : item.calling ? (
                    <span className="text-muted-foreground">
                      {item.calling}
                      {item.ward ? ` (${item.ward})` : ""}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Fill in the form to see a summary.</p>
        )}

        <Button type="submit" className="w-full gap-2" disabled={isPending}>
          <Save className="size-4" />
          {buildButtonLabel(isPending, callingCount, releaseCount)}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- SubmitCalling ----------

export default function SubmitCalling() {
  const [, setLocation] = useLocation();
  const [showOtherCalling, setShowOtherCalling] = useState(false);
  const [releaseOtherCalling, setReleaseOtherCalling] = useState<Record<string, boolean>>({});
  const [submittedItems, setSubmittedItems] = useState<SummaryItem[] | null>(null);
  const summarySnapshot = useRef<SummaryItem[]>([]);

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
      includeReleases: false,
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
  const includeReleases = watched.includeReleases;

  const wardMap = useWardMap(wards);
  const showReleasesSection = submissionType === "release" || includeReleases;

  const showCallingDuplicate = useMemo(
    () =>
      board !== undefined &&
      submissionType === "calling" &&
      isDuplicateProposal(
        board,
        watched.memberFirstName ?? "",
        watched.memberLastName ?? "",
        watched.wardId,
        watched.proposedCalling ?? "",
      ),
    [board, submissionType, watched.memberFirstName, watched.memberLastName, watched.wardId, watched.proposedCalling],
  );

  const summaryItems = useMemo((): SummaryItem[] => {
    const items: SummaryItem[] = [];

    if (submissionType === "calling") {
      const fname = watched.memberFirstName?.trim() ?? "";
      const lname = watched.memberLastName?.trim() ?? "";
      const calling = watched.proposedCalling?.trim() ?? "";
      const wardName = watched.wardId ? (wardMap.get(watched.wardId) ?? "") : "";

      if (fname || lname || calling) {
        items.push({ label: "Calling", name: [fname, lname].filter(Boolean).join(" "), calling, ward: wardName });
      }
    }

    if (showReleasesSection) {
      for (const r of watched.releases ?? []) {
        const fname = r.memberFirstName?.trim() ?? "";
        const lname = r.memberLastName?.trim() ?? "";
        const calling = r.proposedCalling?.trim() ?? "";
        const wardName = r.wardId ? (wardMap.get(r.wardId) ?? "") : "";

        if (fname || lname || calling) {
          items.push({ label: "Release", name: [fname, lname].filter(Boolean).join(" "), calling, ward: wardName });
        }
      }
    }

    return items;
  }, [submissionType, includeReleases, watched.memberFirstName, watched.memberLastName,
      watched.proposedCalling, watched.wardId, watched.releases, wardMap, showReleasesSection]);

  const summaryReleaseCount = showReleasesSection ? (watched.releases?.length ?? 0) : 0;

  function handleTypeChange(type: "calling" | "release") {
    form.setValue("submissionType", type);
    if (type === "release" && releaseFields.length === 0) {
      appendRelease(makeEmptyRelease(bishopWardId));
    }
  }

  function handleIncludeReleasesToggle(checked: boolean) {
    form.setValue("includeReleases", checked);
    if (checked && releaseFields.length === 0) {
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

      if (values.submissionType === "calling") {
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

      const releaseList =
        (values.submissionType === "release" || values.includeReleases) ? values.releases : [];

      for (const r of releaseList) {
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

      return Promise.all(requests);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });
      setSubmittedItems(summarySnapshot.current);
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
                <Button type="button" variant="default" onClick={() => setLocation("/leader/calling-system")}>
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
            <div className="inline-flex rounded-lg border overflow-hidden mb-6">
              <Button
                type="button"
                variant={submissionType === "calling" ? "default" : "ghost"}
                className="rounded-none"
                onClick={() => handleTypeChange("calling")}
              >
                New Calling
              </Button>
              <Button
                type="button"
                variant={submissionType === "release" ? "default" : "ghost"}
                className="rounded-none border-l"
                onClick={() => handleTypeChange("release")}
              >
                Release Only
              </Button>
            </div>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => {
                  summarySnapshot.current = summaryItems;
                  submitMutation.mutate(v);
                })}
              >
                <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                  <div className="flex-1 space-y-6">
                    {submissionType === "calling" && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Calling Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-6">
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
                              name={[watched.memberFirstName?.trim(), watched.memberLastName?.trim()]
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
                                <FormLabel>Notes (Optional)</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Add any additional context or notes about this recommendation..."
                                    className="min-h-[100px]"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>
                    )}

                    {submissionType === "calling" && (
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="include-releases"
                          checked={includeReleases}
                          onCheckedChange={(checked) => handleIncludeReleasesToggle(checked === true)}
                        />
                        <label
                          htmlFor="include-releases"
                          className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Also submit release(s)
                        </label>
                      </div>
                    )}

                    {showReleasesSection && (
                      <div className="space-y-4">
                        {releaseFields.map((releaseField, index) => (
                          <ReleaseCard
                            key={releaseField.id}
                            index={index}
                            canRemove={submissionType === "calling" || releaseFields.length > 1}
                            onRemove={() => removeReleaseAt(index)}
                            wards={wards}
                            bishopWardId={bishopWardId}
                            showOtherCalling={releaseOtherCalling[releaseField.id] ?? false}
                            onShowOtherCallingChange={(v) =>
                              setReleaseOtherCalling((prev) => ({ ...prev, [releaseField.id]: v }))
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
                          <Plus className="h-4 w-4" />
                          Add Release
                        </Button>
                      </div>
                    )}

                    <div className="flex justify-start">
                      <Button variant="destructive" className="gap-2" size="default" asChild>
                        <Link href="/leader/calling-system">Cancel</Link>
                      </Button>
                    </div>
                  </div>

                  <div className="w-full lg:w-80 shrink-0">
                    <SubmissionSummary
                      items={summaryItems}
                      isPending={submitMutation.isPending}
                      callingCount={submissionType === "calling" ? 1 : 0}
                      releaseCount={summaryReleaseCount}
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
