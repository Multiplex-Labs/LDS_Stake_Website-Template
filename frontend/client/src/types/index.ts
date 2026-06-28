export interface ActiveCalling {
  id: string;
  firstName: string;
  lastName: string;
  spouseName?: string;
  calling: string;
  ward: string;
  stage: string;
  dateSubmitted: string;
  dateLastModified: string;
  stakePresApprovalDate?: string;
  hcApprovalDate?: string;
  interviewDate?: string;
  interviewer?: string;
  sustainedReleasedDate?: string;
  setApartDate?: string;
  lcrUpdatedDate?: string;
  hpInterviewDate?: string;
  hpInterviewer?: string;
  notes?: string;
}

export interface Ward {
  id: number;
  name: string;
  /** ID of the UserCalling row (usercalling.id) for this ward's bishop slot — not a user id. */
  bishop_id: number | null;
  /** Decimal hours since midnight (e.g., 9.0 = 9:00 AM, 13.5 = 1:30 PM). */
  start_time: number;
  location: string | null;
  bishop_slot_number: number | null;
}

export interface ApiCalling {
  id: number;
  name: string;
  max_slots: number;
  is_public: boolean;
  system_defined: boolean;
  /**
   * `display_group` and `display_order` are always null or non-null together.
   * A calling is only shown on the public leadership page when both are set
   * and `is_public` is true. Treat either being null as "ungrouped / hidden".
   */
  display_group: string | null;
  display_order: number | null;
  group_order: number | null;
  lock_slots: boolean;
}

export interface ApiUserCalling {
  id: number;
  user_id: number;
  calling_id: number;
  slot_number: number;
  calling?: ApiCalling;
}

export interface ApiUser {
  id: number;
  email: string;
  fname: string;
  lname: string;
  active: boolean;
  force_password_reset: boolean;
  phone: string | null;
  bio: string | null;
  profile_image: string | null;
  callings: ApiUserCalling[] | null;
}

export interface CallingProposal {
  id: number;
  fname: string;
  lname: string;
  spouse_name: string;
  proposed_calling: string;
  ward_id: number;
  is_release: boolean;
  submitted_at: string;
  updated_at: string;
  submitter: number;
}

export interface CallingProposalWithCounts extends CallingProposal {
  stage_approval_count: number;
  stage_denial_count: number;
  current_stage_vote: boolean | null;
}

// Keys are KanbanStages enum values serialized as numeric strings:
// "0"=SP_APPROVAL, "1"=HC_APPROVAL, "2"=INTERVIEW, "3"=SUSTAIN,
// "4"=SET_APART, "5"=LCR_UPDATE, "6"=DONE
export type KanbanBoard = Record<string, CallingProposalWithCounts[]>;

export interface CallingComment {
  id: number;
  proposal_id: number;
  commenter_id: number;
  comment_text: string;
  created_at: string;
  edited_at: string | null;
}

export interface CallingInterview {
  id: number;
  proposal_id: number;
  interviewer_id: number | null;
  interview_date: string | null;
}

// Numeric literal union for KanbanStages (0–6), mirrors backend KanbanStages enum.
export type KanbanStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface KanbanTransition {
  id: number;
  proposal_id: number;
  updater_id: number;
  from_stage: KanbanStage | null;
  to_stage: KanbanStage;
  updated_at: string;
}

export interface HcAssignment {
  id: number;
  slot_number: number;
  high_councilor_id: number | null;
  responsibility: string | null;
  committee: string | null;
}

export interface SpeakingAssignmentEntry {
  ward_id: number | null;
  speaker2: string | null;
}

export interface SpeakerSchedule {
  high_councilor_id: number; // UserCalling.id
  assignments: SpeakingAssignmentEntry[]; // 12 entries, index = month-1
}

export interface SpeakingCalendar {
  year: number;
  speakers: SpeakerSchedule[];
}

export interface SpeakingTopic {
  id: number;
  topic: string;
  reference_material: string | null;
  month: string; // ISO datetime: "2026-01-01T00:00:00"
}

// Sustaining Prep localStorage types
export interface OrdinationEntry {
  id: string;
  fname: string;
  lname: string;
  office: "Elder" | "High Priest";
}

export type SustainingItem =
  | { type: "proposal"; proposalId: number }
  | { type: "ordination"; ordinationId: string };

export interface WardAssignment {
  wardId: number | "stake";
  items: SustainingItem[];
}

export interface SustainingPrepState {
  version: 1;
  sustainingDate: string | null;
  unassigned: SustainingItem[];
  wardAssignments: WardAssignment[];
  ordinations: OrdinationEntry[];
}

export interface PresidencyAssignment {
  id: number;
  calling_id: number;
  calling_name: string;
  current_holder: { id: number; fname: string; lname: string } | null;
  responsibilities: string[];
  wards_overseen: number[];
}

export interface PresidencyAssignmentUpdate {
  responsibilities: string[] | null;
  ward_ids: number[];
}

export interface ApiUserPermissions {
  scopes: number;
  flags: string[];
}

// Must stay in sync with Permission IntFlag in backend/src/models/permissions.py; DISCORD_BOT (128) intentionally excluded.
export const ASSIGNABLE_PERMISSIONS = [
  { flag: 1,   label: "Manage Users" },
  { flag: 2,   label: "Manage Callings" },
  { flag: 4,   label: "Manage Assignments" },
  { flag: 8,   label: "Manage Speaking Schedule" },
  { flag: 16,  label: "Submit Calling Proposals" },
  { flag: 32,  label: "Manage Calling Proposals" },
  { flag: 64,  label: "View Calling Proposals" },
  { flag: 256, label: "Manage Wards" },
  { flag: 512,  label: "Manage Appointments" },
  { flag: 1024, label: "Approve Building Reservations" },
  { flag: 2048, label: "Manage Building Access" },
] as const;

export const PERM_APPROVE_BLDG_RESERVATIONS = 1024;

// --- Building Reservation types ---

export type ReservationStatus = "PENDING" | "APPROVED" | "DENIED";

export interface BuildingReservation {
  id: number;
  event_name: string;
  event_description: string | null;
  date: string;
  start_time: string;
  end_time: string;
  setup_time: string;
  cleanup_time: string;
  rooms: string[];
  organizer_name: string;
  organizer_email: string;
  organizer_phone: string;
  organization: string;
  organization_other: string | null;
  affiliation: string;
  needs_access: boolean;
  status: ReservationStatus;
  denial_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
  has_conflict: boolean;
}

// --- Temple Recommend / Appointment types ---

export interface TempleRecommendConfig {
  id: number;
  location_name: string;
  location_address: string;
  open_hours_text: string;
  exception_note: string;
  timezone: string;
  slot_buffer_mins: number;
  booking_window_days: number;
  booking_cutoff_hours: number;
}

export interface AppointmentType {
  id: number;
  name: string;
  description: string;
  duration_mins: number;
  details: string;
  icon_name: string;
  is_active: boolean;
  display_order: number;
  system_defined: boolean;
}

export interface AvailabilityWindow {
  id: number;
  user_id: number;
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Mon, 6=Sun
  start_minute: number;
  end_minute: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

/** Named recurrence rules; JSON-encoded custom rules are also valid. */
export type RecurrenceRule = "first_sunday_monthly" | (string & Record<never, never>);

export interface AvailabilityException {
  id: number;
  date: string | null;     // null for recurring exceptions
  reason: string;
  is_global: boolean;
  user_id: number | null;
  recurrence: RecurrenceRule | null;
}

export type BookingStatus =
  | "PENDING_EMAIL_CONFIRM"
  | "CONFIRMED"
  | "EXPIRED"
  | "CANCELLED_BY_MEMBER"
  | "CANCELLED_BY_PRESIDENCY"
  | "COMPLETED"
  | "NO_SHOW"
  | "RESCHEDULED";

export interface AppointmentSlot {
  slot_datetime_utc: string;
  interviewer_user_id: number;
  interviewer_name: string;
}

export interface Booking {
  id: number;
  appointment_type_id: number;
  interviewer_user_id: number;
  member_name: string;
  member_email: string;
  member_phone: string;
  booking_date: string;
  start_minute_of_day: number;
  end_minute_of_day: number;
  start_datetime: string;
  end_datetime: string;
  status: BookingStatus;
  confirmation_token: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancelled_by_user_id: number | null;
  notification_sent_at: string | null;
  calendar_sync_status: string | null;
  calendar_event_id: string | null;
  reschedule_token: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}
