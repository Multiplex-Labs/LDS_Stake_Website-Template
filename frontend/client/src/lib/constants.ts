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
