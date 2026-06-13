import { Layout } from "@/components/layout/Layout";

export default function SiteSettings() {
  return (
    <Layout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-semibold mb-6">Site Settings</h1>
        <div className="py-16 text-center text-muted-foreground">
          <p className="text-sm">Site content management — coming soon.</p>
        </div>
      </div>
    </Layout>
  );
}
