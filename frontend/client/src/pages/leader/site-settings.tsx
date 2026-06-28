import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Chip, ChipInput } from "@/components/ui/chip-input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSettings, SETTINGS_FALLBACKS } from "@/hooks/useSettings";
import { useChipInput } from "@/hooks/useChipInput";
import { HIDEABLE_PAGES } from "@/lib/constants";
import type { SiteSettingsResponse } from "@/types";

// ── Schemas ──────────────────────────────────────────────────────────────────

const generalSchema = z.object({
  stake_name: z.string().min(1, "Required").max(200),
  stake_address: z.string().max(500),
});

const appearanceSchema = z.object({
  hero_title: z.string().max(200),
  hero_subtitle: z.string().max(500),
});

const contactSchema = z.object({
  contact_email: z.string().email("Invalid email").or(z.literal("")),
  reply_to_email: z.string().email("Invalid email").or(z.literal("")),
});

const featuresSchema = z.object({
  hidden_pages: z.array(z.string()),
});

type GeneralFields = z.infer<typeof generalSchema>;
type AppearanceFields = z.infer<typeof appearanceSchema>;
type ContactFields = z.infer<typeof contactSchema>;
type FeaturesFields = z.infer<typeof featuresSchema>;

// ── Helper ────────────────────────────────────────────────────────────────────

async function saveSettings(data: Partial<SiteSettingsResponse>) {
  const res = await apiRequest("PUT", "/api/settings", data);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<SiteSettingsResponse>;
}

// ── General Tab ───────────────────────────────────────────────────────────────

function GeneralTab({ settings }: { settings: SiteSettingsResponse }) {
  const chipInput = useChipInput();

  const form = useForm<GeneralFields>({
    resolver: zodResolver(generalSchema),
    defaultValues: {
      stake_name: settings.stake_name,
      stake_address: settings.stake_address,
    },
  });

  // Sync form and chips when settings load / change
  useEffect(() => {
    form.reset({
      stake_name: settings.stake_name,
      stake_address: settings.stake_address,
    });
    chipInput.reset(settings.sacrament_times);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.stake_name, settings.stake_address, settings.sacrament_times.join(",")]);

  const mutation = useMutation({
    mutationFn: (data: GeneralFields) =>
      saveSettings({ ...data, sacrament_times: chipInput.flushDraft() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("General settings saved");
      form.reset(form.getValues());
    },
    onError: (err: unknown) => {
      console.error("[site-settings] general save error:", err);
      toast.error("Failed to save settings");
    },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="stake_name">Stake Name</Label>
        <Input id="stake_name" {...form.register("stake_name")} />
        {form.formState.errors.stake_name && (
          <p className="text-xs text-destructive">{form.formState.errors.stake_name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="stake_address">Stake Center Address</Label>
        <Input id="stake_address" {...form.register("stake_address")} />
      </div>

      <ChipInput
        chipInput={chipInput}
        id="sacrament_times"
        label="Sacrament Meeting Times"
        placeholder="Type a time and press Enter (e.g. 9:00am)"
        hint="Press Enter or comma to add. Backspace removes the last time."
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Appearance Tab ─────────────────────────────────────────────────────────────

function AppearanceTab({ settings }: { settings: SiteSettingsResponse }) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLInputElement>(null);

  const form = useForm<AppearanceFields>({
    resolver: zodResolver(appearanceSchema),
    defaultValues: {
      hero_title: settings.hero_title,
      hero_subtitle: settings.hero_subtitle,
    },
  });

  useEffect(() => {
    form.reset({ hero_title: settings.hero_title, hero_subtitle: settings.hero_subtitle });
  }, [settings.hero_title, settings.hero_subtitle]);

  function handleFileSelect(file: File, type: "logo" | "hero") {
    const url = URL.createObjectURL(file);
    if (type === "logo") {
      setLogoFile(file);
      setLogoPreview(url);
    } else {
      setHeroFile(file);
      setHeroPreview(url);
    }
  }

  const mutation = useMutation({
    mutationFn: async (data: AppearanceFields) => {
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        const res = await apiRequest("POST", "/api/settings/upload/logo", fd);
        if (!res.ok) throw new Error("Logo upload failed");
      }
      if (heroFile) {
        const fd = new FormData();
        fd.append("file", heroFile);
        const res = await apiRequest("POST", "/api/settings/upload/hero", fd);
        if (!res.ok) throw new Error("Hero image upload failed");
      }
      await saveSettings(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("Appearance settings saved");
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      if (heroPreview) URL.revokeObjectURL(heroPreview);
      setLogoFile(null);
      setLogoPreview(null);
      setHeroFile(null);
      setHeroPreview(null);
      form.reset(form.getValues());
    },
    onError: (err: unknown) => {
      console.error("[site-settings] appearance save error:", err);
      toast.error("Failed to save appearance settings");
    },
  });

  const isDirty = form.formState.isDirty || !!logoFile || !!heroFile;

  return (
    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
      {/* Logo */}
      <div className="space-y-2">
        <Label>Stake Logo</Label>
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-lg border bg-muted/30 flex items-center justify-center overflow-hidden">
            {(logoPreview ?? settings.logo_url) && (
              <img
                src={logoPreview ?? settings.logo_url ?? undefined}
                alt="Logo preview"
                className="h-full w-full object-contain"
              />
            )}
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
              Choose File
            </Button>
            {logoFile && <p className="text-xs text-muted-foreground mt-1">{logoFile.name}</p>}
          </div>
        </div>
        <input
          ref={logoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f, "logo"); }}
        />
      </div>

      {/* Hero Image */}
      <div className="space-y-2">
        <Label>Hero Image</Label>
        <div className="space-y-2">
          {(heroPreview ?? settings.hero_image_url) && (
            <div className="w-full aspect-video rounded-lg border bg-muted/30 overflow-hidden">
              <img
                src={heroPreview ?? settings.hero_image_url ?? undefined}
                alt="Hero preview"
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => heroRef.current?.click()}>
            Choose File
          </Button>
          {heroFile && <p className="text-xs text-muted-foreground">{heroFile.name}</p>}
        </div>
        <input
          ref={heroRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f, "hero"); }}
        />
      </div>

      {/* Text fields */}
      <div className="space-y-2">
        <Label htmlFor="hero_title">Hero Title</Label>
        <Input id="hero_title" {...form.register("hero_title")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hero_subtitle">Hero Subtitle</Label>
        <Input id="hero_subtitle" {...form.register("hero_subtitle")} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!isDirty || mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Contact Tab ───────────────────────────────────────────────────────────────

function ContactTab({ settings }: { settings: SiteSettingsResponse }) {
  const form = useForm<ContactFields>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contact_email: settings.contact_email,
      reply_to_email: settings.reply_to_email,
    },
  });

  useEffect(() => {
    form.reset({ contact_email: settings.contact_email, reply_to_email: settings.reply_to_email });
  }, [settings.contact_email, settings.reply_to_email]);

  const mutation = useMutation({
    mutationFn: (data: ContactFields) => saveSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("Contact settings saved");
      form.reset(form.getValues());
    },
    onError: (err: unknown) => {
      console.error("[site-settings] contact save error:", err);
      toast.error("Failed to save contact settings");
    },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="contact_email">Public Contact Email</Label>
        <Input id="contact_email" type="email" {...form.register("contact_email")} />
        <p className="text-xs text-muted-foreground">Displayed in the site footer.</p>
        {form.formState.errors.contact_email && (
          <p className="text-xs text-destructive">{form.formState.errors.contact_email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="reply_to_email">System Reply-To Email</Label>
        <Input id="reply_to_email" type="email" {...form.register("reply_to_email")} placeholder="Optional" />
        <p className="text-xs text-muted-foreground">
          Used as the reply-to address on system emails (temple recommend reminders, building reservation notices, etc.).
          Falls back to the <code className="text-xs">REPLY_TO_EMAIL</code> environment variable if left blank.
        </p>
        {form.formState.errors.reply_to_email && (
          <p className="text-xs text-destructive">{form.formState.errors.reply_to_email.message}</p>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!form.formState.isDirty || mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Features Tab ──────────────────────────────────────────────────────────────

function FeaturesTab({ settings }: { settings: SiteSettingsResponse }) {
  const form = useForm<FeaturesFields>({
    defaultValues: { hidden_pages: settings.hidden_pages },
  });

  useEffect(() => {
    form.reset({ hidden_pages: settings.hidden_pages });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.hidden_pages.join(",")]);

  const hiddenPages = form.watch("hidden_pages");

  function togglePage(key: string) {
    const current = form.getValues("hidden_pages");
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    form.setValue("hidden_pages", next, { shouldDirty: true });
  }

  const mutation = useMutation({
    mutationFn: (data: FeaturesFields) => saveSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success("Feature settings saved");
      form.reset(form.getValues());
    },
    onError: (err: unknown) => {
      console.error("[site-settings] features save error:", err);
      toast.error("Failed to save feature settings");
    },
  });

  return (
    <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Hidden pages are removed from navigation but remain accessible at their URL.
      </p>
      <div className="divide-y divide-border rounded-lg border">
        {HIDEABLE_PAGES.map((page) => {
          const isHidden = hiddenPages.includes(page.key);
          return (
            <div key={page.key} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{page.label}</p>
                <p className="text-xs text-muted-foreground">{page.href}</p>
              </div>
              <Switch
                checked={!isHidden}
                onCheckedChange={() => togglePage(page.key)}
                aria-label={`Toggle ${page.label}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!form.formState.isDirty || mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SiteSettings() {
  const { data: settings } = useSettings();
  const s = settings ?? SETTINGS_FALLBACKS;

  return (
    <Layout>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-3xl">
        <h1 className="text-2xl font-semibold mb-6">Site Settings</h1>
        <Tabs defaultValue="general">
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="contact">Contact</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <GeneralTab settings={s} />
          </TabsContent>
          <TabsContent value="appearance">
            <AppearanceTab settings={s} />
          </TabsContent>
          <TabsContent value="contact">
            <ContactTab settings={s} />
          </TabsContent>
          <TabsContent value="features">
            <FeaturesTab settings={s} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
