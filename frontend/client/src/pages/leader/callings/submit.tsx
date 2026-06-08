import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import {Save, X} from "lucide-react";
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
  FormDescription
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
          <div className="mb-8">
          <h1 className="text-3xl font-bold">Submit a Calling</h1>
          <p className="text-muted-foreground mt-2">
            Submit a calling or release for stake review and approval.
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
                            className="hover:scale-105 hover:shadow-lg transition-all duration-200"
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
                        <FormItem className="flex flex-row items-start gap-3 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>

                            <div className="grid gap-1.5 leading-none">
                                <FormLabel className="font-normal">
                                    Mark as release
                                </FormLabel>
                                <FormDescription>
                                    Select this checkbox when the submission is for a release rather than a new calling.
                                </FormDescription>
                            </div>
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
              <Button
                variant="destructive"
                className="gap-2 hover:scale-105 hover:shadow-lg transition-all duration-200"
                size="default"
                asChild
              >
                <Link href="/leader/calling-system">
                  Cancel
                </Link>
              </Button>
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
