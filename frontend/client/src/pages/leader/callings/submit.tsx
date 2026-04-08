import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Save } from "lucide-react";
import { Link, useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import type { Ward } from "@/types";

const CALLINGS = [
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

const formSchema = z.object({
  memberFirstName: z.string().min(1, "First name is required"),
  memberLastName: z.string().min(1, "Last name is required"),
  spouseName: z.string().optional(),
  wardId: z.number({ required_error: "Ward is required" }).int().positive("Ward is required"),
  proposedCalling: z.string().min(1, "Proposed calling is required"),
  isRelease: z.boolean().default(false),
  notes: z.string().optional(),
});

export default function SubmitCalling() {
  const [, setLocation] = useLocation();
  const [showOtherCalling, setShowOtherCalling] = useState(false);

  const { data: wards = [] } = useQuery<Ward[]>({
    queryKey: ["/api/wards/"],
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      memberFirstName: "",
      memberLastName: "",
      spouseName: "",
      wardId: undefined,
      proposedCalling: "",
      isRelease: false,
      notes: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) =>
      apiRequest("POST", "/api/calling-kanban/proposals", {
        fname: values.memberFirstName,
        lname: values.memberLastName,
        spouse_name: values.spouseName ?? "",
        proposed_calling: values.proposedCalling,
        ward_id: values.wardId,
        is_release: values.isRelease,
      }),
    onSuccess: (_, values) => {
      toast.success("Calling Submitted", {
        description: `Recommendation for ${values.memberFirstName} ${values.memberLastName} has been submitted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/calling-kanban/board"] });
      setLocation("/leader/calling-system");
    },
    onError: () => {
      toast.error("Submission Failed", { description: "Could not submit the calling. Please try again." });
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    submitMutation.mutate(values);
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href="/leader/calling-system">
          <Button variant="ghost" className="gap-2 mb-6 pl-0 hover:bg-transparent hover:text-primary">
            <ChevronLeft className="h-4 w-4" />
            Back to Calling System
          </Button>
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Submit a Calling</h1>
          <p className="text-muted-foreground mt-2">
            Submit a new calling recommendation for Stake Approval and Action.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Member Information</CardTitle>
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
                        <FormLabel>Spouse Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Doe" {...field} />
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
                      <FormLabel>Proposed Calling</FormLabel>
                      {showOtherCalling ? (
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="Enter custom calling" {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowOtherCalling(false);
                              field.onChange("");
                            }}
                          >
                            Cancel
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
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a calling" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[300px]">
                            {CALLINGS.map((calling) => (
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

                <FormField
                  control={form.control}
                  name="isRelease"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">This is a release (not a new calling)</FormLabel>
                    </FormItem>
                  )}
                />

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

            <div className="flex justify-end gap-4">
              <Link href="/leader/calling-system">
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" className="gap-2" disabled={submitMutation.isPending}>
                <Save className="h-4 w-4" />
                {submitMutation.isPending ? "Submitting…" : "Submit Recommendation"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
