import { XCircle } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";

export default function CancelledPage() {
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col items-center text-center gap-4">
          <XCircle className="size-12 text-muted-foreground" aria-hidden="true" />
          <h1 className="font-serif text-3xl font-bold">
            Your appointment has been cancelled.
          </h1>
          <p className="text-muted-foreground max-w-md">
            If this was a mistake or you'd like to schedule a new time, you can
            book again below.
          </p>
          <Button asChild>
            <Link href="/stake-info/temple-recommend">
              Schedule a New Appointment
            </Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
}
