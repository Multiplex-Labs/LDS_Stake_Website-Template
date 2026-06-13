export const SELECT_NONE = "__none__";
export const HC_CALLING_NAME = "High Councilor";

export const WARDS = [
  "9th Ward", "10th Ward", "11th Ward", "12th Ward",
  "13th Ward", "14th Ward", "15th Ward", "16th Ward", "17th Ward",
] as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));

export const BUTTON_HOVER = "hover:scale-105 hover:shadow-lg transition-all duration-200";
export const ICON_BTN_HOVER = "text-muted-foreground/50 hover:text-foreground transition-colors";

export const KANBAN_STAGES = [
  { key: "0", id: "pending-stake-approval", label: "Stake Presidency Approval", badgeVariant: "outline",    cssClass: "stage-sp-approval"  },
  { key: "1", id: "pending-hc-approval",    label: "High Council Approval",     badgeVariant: "ghost",      cssClass: "stage-hc-approval"  },
  { key: "2", id: "pending-interview",      label: "Interview",                 badgeVariant: "secondary",  cssClass: "stage-interview"    },
  { key: "3", id: "pending-sustainment",    label: "Sustainment",               badgeVariant: "secondary",  cssClass: "stage-sustain"      },
  { key: "4", id: "pending-setting-apart",  label: "Setting Apart",             badgeVariant: "neutral",    cssClass: "stage-set-apart"    },
  { key: "5", id: "pending-lcr",            label: "LCR Update",                badgeVariant: "default",    cssClass: "stage-lcr-update"   },
] as const;

export const SK_SUSTAIN = KANBAN_STAGES[3].key;
export const SK_DONE = "6";

export const STAGE_LABELS: Record<string, string> = Object.fromEntries(
  KANBAN_STAGES.map((s) => [s.key, s.label]),
);

export const STAGE_BADGE_VARIANT: Record<string, string> = Object.fromEntries(
  KANBAN_STAGES.map((s) => [s.key, s.badgeVariant]),
);

export const Permission = {
  MANAGE_USERS: 1,
  MANAGE_CALLINGS: 2,
  MANAGE_ASSIGNMENTS: 4,
  MANAGE_SPEAKING_SCHEDULE: 8,
  SUBMIT_CALLING_PROPOSALS: 16,
  MANAGE_CALLING_PROPOSALS: 32,
  VIEW_CALLING_PROPOSALS: 64,
} as const;

type PermissionFlag = typeof Permission[keyof typeof Permission];

export function hasPermission(perms: number, flag: PermissionFlag): boolean {
  return (perms & flag) !== 0;
}
