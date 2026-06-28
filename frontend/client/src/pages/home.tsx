import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import fallbackHeroImage from "@assets/temple-hero.jpg";
import { motion } from "framer-motion";
import { Users, Building2, BookOpen, UserCheck } from "lucide-react";
import { Link } from "wouter";
import { useSettings } from "@/hooks/useSettings";

export default function Home() {
  const { data: settings } = useSettings();

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative h-[50vh] sm:h-[600px] w-full overflow-hidden flex items-center justify-center">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src={settings?.hero_image_url ?? fallbackHeroImage}
            alt="Church Exterior"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 container mx-auto px-4 text-center text-white space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="font-serif text-2xl sm:text-4xl md:text-6xl font-bold tracking-tight mb-4">
              {settings?.hero_title ?? "Welcome to the Logan Married Student 2nd Stake"}
            </h1>
            <p className="text-base md:text-xl text-white/90 max-w-2xl mx-auto font-light">
              {settings?.hero_subtitle ?? "A community dedicated to faith, service, and fellowship. Join us in worship and activities."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mt-8"
          >
            <Link href="/ward-info/meeting-times">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl font-semibold text-base px-8 h-12">
                Meeting Times
              </Button>
            </Link>
            <Link href="/ward-info/map">
              <Button size="lg" variant="outline" className="bg-white/10 text-white border-white/20 hover:bg-white/20 h-12">
                Find your Ward
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Quick Links / Highlights */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
<Link href="/stake-leadership" className="block h-full">
              <FeatureCard
                icon={<Users className="w-10 h-10 text-primary" />}
                title="Leadership"
              />
            </Link>
            <Link href="/stake-info/reserve" className="block h-full">
              <FeatureCard
                icon={<Building2 className="w-10 h-10 text-primary" />}
                title="Reserve Building"
              />
            </Link>
            <Link href="/ward-info/bishops" className="block h-full">
              <FeatureCard
                icon={<UserCheck className="w-10 h-10 text-primary" />}
                title="Meet Our Bishops"
              />
            </Link>
            <Link href="/resources" className="block h-full">
              <FeatureCard
                icon={<BookOpen className="w-10 h-10 text-primary" />}
                title="Resources"
              />
            </Link>
          </div>
        </div>
      </section>

      {/* Quote Section */}
      <section className="py-24 bg-muted/50">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <blockquote className="font-serif text-2xl md:text-3xl italic text-foreground/80 leading-relaxed">
            "No One Has Failed who Keeps trying and Keeps Praying"
          </blockquote>
          <div className="mt-6 text-primary font-semibold">— Jeffrey R. Holland</div>
        </div>
      </section>
    </Layout>
  );
}

function FeatureCard({ icon, title }: { icon: React.ReactNode, title: string }) {
  return (
    <div className="bg-card p-6 rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-center text-center h-full min-h-[180px]">
      <div className="mb-4 bg-secondary/50 w-16 h-16 rounded-full flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-xl font-bold font-serif">{title}</h3>
    </div>
  )
}