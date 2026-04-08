import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useState } from "react";

const roomOptions = [
  "N. Cultural Hall (N. Gym)",
  "S. Cultural Hall (S. Gym)",
  "N. Kitchen",
  "S. Kitchen",
  "NE Multi-Purpose Room (Connected to N. Kitchen)",
  "SE Multi-Purpose Room (Connected to S. Kitchen)",
  "SW Multi-Purpose Room",
  "NW Multi-Purpose Room",
  "N. Nursery Room",
  "S. Nursery Room",
  "N. Chapel",
  "S. Chapel",
  "High Council Room",
  "Family History Room",
  "S. Meeting Room",
  "N. Relief Society Room",
  "S. Relief Society Room",
  "N. Pavilion",
  "S. Pavilion",
  "Fire Pit",
  "N. Softball Field",
  "S. Softball Field",
  "N. Volleyball Courts",
  "S. Volleyball Courts",
  "Grass Field Area",
];

const timeOptions = [
  "15m", "30m", "45m", "1h", "2h", "3h", "4h"
];

const affiliationOptions = [
  "Stake Activity Reservation",
  "Ward Activity Reservation",
  "Stake Member Reservation",
  "Out-of-Stake Member Reservation",
  "Not Affiliated Reservation"
];

const organizationOptions = [
  "Logan Married Student 9th Ward",
  "Logan Married Student 10th Ward",
  "Logan Married Student 11th Ward",
  "Logan Married Student 12th Ward",
  "Logan Married Student 13th Ward",
  "Logan Married Student 14th Ward",
  "Logan Married Student 15th Ward",
  "Logan Married Student 16th Ward",
  "Logan Married Student 17th Ward",
  "Logan Married Student Stake",
  "Other"
];

const formSchema = z.object({
  eventName: z.string().min(2, "Event name must be at least 2 characters."),
  eventDescription: z.string().optional(),
  date: z.date({ required_error: "A date is required." }),
  startTime: z.string({ required_error: "Start time is required." }),
  endTime: z.string({ required_error: "End time is required." }),
  setupTime: z.string({ required_error: "Setup time is required." }),
  cleanupTime: z.string({ required_error: "Cleanup time is required." }),
  rooms: z.array(z.string()).refine((value) => value.length > 0, {
    message: "You have to select at least one room or area.",
  }),
  organizerName: z.string().min(2, "Name is required."),
  organizerEmail: z.string().email("Invalid email address."),
  organizerPhone: z.string().min(10, "Phone number is required."),
  organization: z.string({ required_error: "Please select an organization." }),
  organizationOther: z.string().optional(),
  affiliation: z.string({ required_error: "Please select an affiliation." }),
  agreement: z.boolean().default(false).refine((val) => val === true, {
    message: "You must agree to the guidelines.",
  }),
}).refine((data) => {
  if (data.organization === "Other" && (!data.organizationOther || data.organizationOther.length < 2)) {
    return false;
  }
  return true;
}, {
  message: "Please specify your organization.",
  path: ["organizationOther"],
});

export default function ReserveBuilding() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      eventName: "",
      eventDescription: "",
      startTime: "",
      endTime: "",
      rooms: [],
      organizerName: "",
      organizerEmail: "",
      organizerPhone: "",
      organization: "",
      organizationOther: "",
      agreement: false,
    },
  });

  const selectedOrganization = form.watch("organization");

  function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success("Reservation Request Submitted", {
        description: "Your request has been sent to the Stake Executive Secretary for approval.",
      });
      form.reset();
    }, 2000);
  }

  const handleSelectAllRooms = (checked: boolean) => {
    if (checked) {
      form.setValue("rooms", roomOptions);
    } else {
      form.setValue("rooms", []);
    }
  };

  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center mb-4">Reserve Building</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* Guidelines Section */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-l-4 border-l-primary h-fit sticky top-24">
              <CardHeader>
                <CardTitle className="font-serif text-xl">Building Reservation Guidelines</CardTitle>
                <CardDescription>
                  The following guidelines apply to all reservations and use of the Logan Married Student 2nd Stake Center.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 text-sm leading-relaxed text-muted-foreground">
                <section>
                  <h3 className="font-semibold text-foreground mb-2">Reservation Priority</h3>
                  <p className="mb-2">Building reservations are prioritized in the following order:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Stake activities</li>
                    <li>Ward activities</li>
                    <li>Stake member reservations</li>
                    <li>Out-of-stake member reservations</li>
                    <li>Non-affiliate reservations</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-foreground mb-2">Scheduling Policies</h3>
                  <ul className="list-disc pl-4 space-y-2">
                    <li>Reservation requests may be submitted no more than two months in advance, with limited exceptions.</li>
                    <li>All use of the cultural hall must be scheduled in advance, including ward athletic practices and pickup games.</li>
                    <li>Non-sanctioned basketball activities (those not part of ward practices or regularly scheduled games), even if scheduled, do not take priority over ward, Priesthood, Relief Society, Primary, or Sunday School activities.</li>
                    <li>Basketball is not permitted on Sundays.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-foreground mb-2">Building Use and Cleanup</h3>
                  <ul className="list-disc pl-4 space-y-2">
                    <li>The individual scheduling the reservation is responsible for ensuring the building is properly cleaned and left in the same condition as it was prior to use.</li>
                    <li>The scheduler's name and contact information must be provided at the time the reservation is made.</li>
                  </ul>
                </section>

                 <section>
                  <h3 className="font-semibold text-foreground mb-2">Building Hours</h3>
                  <ul className="list-disc pl-4 space-y-2">
                    <li>The building is available for use until 10:00 PM each day.</li>
                    <li>No one may remain in the building after 10:00 PM.</li>
                    <li>Exceptions (such as New Year's Eve or Christmas ward parties) must receive prior approval from the stake presidency.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold text-foreground mb-2">Reservations and Questions</h3>
                  <p className="mb-2">Please use the reservation form to schedule stake center use.</p>
                  <p className="mb-4">For questions regarding this policy, please contact the Stake Executive Secretary.</p>
                </section>
              </CardContent>
            </Card>
          </div>

          {/* Form Section */}
          <div className="lg:col-span-2">
            <Card className="border-t-4 border-t-primary">
              <CardHeader>
                <CardTitle className="font-serif text-2xl">Reservation Request Form</CardTitle>
                <CardDescription>Fill out the details below to request a reservation.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="eventName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Event Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Ward Christmas Party" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                       <FormField
                        control={form.control}
                        name="affiliation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Event Affiliation</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select affiliation" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {affiliationOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
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
                      name="eventDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Briefly describe the event details..."
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid md:grid-cols-3 gap-6">
                       <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={"outline"}
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(field.value, "PPP")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  disabled={(date) =>
                                    date < new Date() || date < new Date("1900-01-01")
                                  }
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Start Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>End Time</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="setupTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Setup Time Needed</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select setup time" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {timeOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cleanupTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cleanup Time Needed</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select cleanup time" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {timeOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
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
                      name="rooms"
                      render={() => (
                        <FormItem>
                          <div className="mb-4">
                            <FormLabel className="text-base">Rooms or Areas to Reserve</FormLabel>
                            <FormDescription>
                              Select all areas required for your event.
                            </FormDescription>
                          </div>
                           <div className="flex items-center space-x-2 mb-4">
                              <Checkbox
                                id="select-all"
                                onCheckedChange={handleSelectAllRooms}
                              />
                              <label
                                htmlFor="select-all"
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                Entire Facility (Please only check if the entire building is truly needed)
                              </label>
                            </div>
                          <div className="grid sm:grid-cols-2 gap-4 border p-4 rounded-md h-[300px] overflow-y-auto bg-muted/10">
                            {roomOptions.map((item) => (
                              <FormField
                                key={item}
                                control={form.control}
                                name="rooms"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={item}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(item)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, item])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== item
                                                  )
                                                )
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="font-normal text-sm cursor-pointer">
                                        {item}
                                      </FormLabel>
                                    </FormItem>
                                  )
                                }}
                              />
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4 pt-4 border-t">
                      <h3 className="font-semibold text-lg">Event Organizer Information</h3>
                      <div className="grid md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="organizerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Full Name" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="organizerPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input placeholder="(555) 555-5555" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                         <FormField
                          control={form.control}
                          name="organizerEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input placeholder="name@example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="organization"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Organization</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select organization" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {organizationOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                         {selectedOrganization === "Other" && (
                          <FormField
                            control={form.control}
                            name="organizationOther"
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Other Organization</FormLabel>
                                <FormControl>
                                  <Input placeholder="Please specify organization" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name="agreement"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-muted/20">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>
                              I have reviewed all reservation guidelines and accept the usage policy.
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <Button type="submit" className="w-full hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl" size="lg" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting Request...
                        </>
                      ) : (
                        "Submit Reservation Request"
                      )}
                    </Button>
                    <p className="text-sm text-center text-muted-foreground mt-2">
                        By submitting this form, you agree to adhere to all building use policies.
                    </p>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-12 text-center max-w-4xl mx-auto px-4">
           <p className="italic text-muted-foreground text-lg leading-relaxed">
            The stake center has been dedicated to the Lord for His work and service, which is its first priority. We appreciate your cooperation and support in honoring this purpose by following these guidelines.
          </p>
        </div>
      </div>
    </Layout>
  );
}
