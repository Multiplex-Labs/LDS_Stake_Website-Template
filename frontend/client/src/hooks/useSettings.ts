import { useQuery } from "@tanstack/react-query";
import type { SiteSettingsResponse } from "@/types";

export const SETTINGS_FALLBACKS: SiteSettingsResponse = {
  stake_name: "Logan Married Student 2nd Stake",
  stake_address: "1550 N 400 E, Logan, UT 84321",
  contact_email: "lmssecondstake@gmail.com",
  reply_to_email: "",
  hero_title: "Welcome to the Logan Married Student 2nd Stake",
  hero_subtitle: "A community dedicated to faith, service, and fellowship. Join us in worship and activities.",
  hero_image_url: null,
  logo_url: null,
  sacrament_times: ["8:30am", "10:00am", "11:30am", "1:00pm"],
  hidden_pages: [],
};

export function useSettings() {
  return useQuery<SiteSettingsResponse>({
    queryKey: ["/api/settings"],
    placeholderData: SETTINGS_FALLBACKS,
  });
}
