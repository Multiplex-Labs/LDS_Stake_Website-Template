import {
  Shield,
  ShieldCheck,
  Heart,
  Star,
  Users,
  User,
  Calendar,
  CalendarCheck,
  Clock,
  Key,
  Home,
  Building2,
  BookOpen,
  Flag,
  Landmark,
  Crown,
  Sparkles,
  Award,
  Badge,
  CheckCircle,
  Globe,
  MapPin,
  Church,
  Scroll,
  Link2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Curated icon map for appointment type icon_name strings.
// "Rings" is not exported by lucide-react; Link2 is used as the fallback
// for sealing appointment types that use icon_name="Rings".
export const ICON_MAP: Record<string, LucideIcon> = {
  Shield,
  ShieldCheck,
  Heart,
  Star,
  Users,
  User,
  Calendar,
  CalendarCheck,
  Clock,
  Key,
  Home,
  Building2,
  BookOpen,
  Flag,
  Landmark,
  Crown,
  Sparkles,
  Award,
  Badge,
  CheckCircle,
  Globe,
  MapPin,
  Church,
  Scroll,
  // Fallback for sealing types seeded with "Rings"
  Rings: Link2,
  Link2,
};

export const ICON_NAMES = Object.keys(ICON_MAP).filter((k) => k !== "Rings") as string[];
