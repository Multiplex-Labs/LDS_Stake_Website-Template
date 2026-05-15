import { Layout } from "@/components/layout/Layout";
import { HandHeart, Clock } from "lucide-react";

export default function ReleasesAndSustainings() {
  return (
    <Layout>
      <div className="bg-muted/30 py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-4xl font-bold text-center">Releases & Sustainings</h1>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
        <div className="bg-primary/10 text-primary p-6 rounded-full mb-6">
          <HandHeart className="size-12" />
        </div>
        <h2 className="font-serif text-3xl font-bold mb-3">Coming Soon</h2>
        <p className="text-muted-foreground max-w-md text-lg">
          The releases and sustainings tracker is under development. Check back soon.
        </p>
        <div className="flex items-center gap-2 mt-8 text-sm text-muted-foreground">
          <Clock className="size-4" />
          <span>Feature in progress</span>
        </div>
      </div>
    </Layout>
  );
}
