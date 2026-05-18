export const SELECT_NONE = "__none__";

export const WARDS = [
  "9th Ward", "10th Ward", "11th Ward", "12th Ward",
  "13th Ward", "14th Ward", "15th Ward", "16th Ward", "17th Ward",
] as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const CALLING_STAGES = [
  { id: "pending-stake-approval", label: "Pending Stake Presidency Approval" },
  { id: "pending-hc-approval", label: "Pending High Council Approval" },
  { id: "pending-interview", label: "Pending Interview" },
  { id: "pending-sustainment", label: "Pending Sustainment / Release" },
  { id: "pending-setting-apart", label: "Pending Setting Apart" },
  { id: "pending-lcr", label: "Pending LCR Update" },
] as const;

export const KANBAN_STAGES = [
  { key: "0", id: "pending-stake-approval", label: "Stake Presidency Approval", badgeClass: "badge-warning",   cssClass: "stage-sp-approval"  },
  { key: "1", id: "pending-hc-approval",    label: "High Council Approval",     badgeClass: "badge-ghost",     cssClass: "stage-hc-approval"  },
  { key: "2", id: "pending-interview",      label: "Interview",                 badgeClass: "badge-info",      cssClass: "stage-interview"    },
  { key: "3", id: "pending-sustainment",    label: "Sustainment",               badgeClass: "badge-secondary", cssClass: "stage-sustain"      },
  { key: "4", id: "pending-setting-apart",  label: "Setting Apart",             badgeClass: "badge-accent",    cssClass: "stage-set-apart"    },
  { key: "5", id: "pending-lcr",            label: "LCR Update",               badgeClass: "badge-primary",   cssClass: "stage-lcr-update"   },
] as const;

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  KANBAN_STAGES.map((s) => [s.key, s.label]),
);

export const STAGE_BADGE_CLASS: Record<string, string> = Object.fromEntries(
  KANBAN_STAGES.map((s) => [s.key, s.badgeClass]),
);
