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
  bishop_id: number | null;
}

export interface ApiCalling {
  id: number;
  name: string;
  max_slots: number;
  is_public: boolean;
  system_defined: boolean;
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
  { flag: 1,  label: "Manage Users" },
  { flag: 2,  label: "Manage Callings" },
  { flag: 4,  label: "Manage Assignments" },
  { flag: 8,  label: "Manage Speaking Schedule" },
  { flag: 16, label: "Submit Calling Proposals" },
  { flag: 32, label: "Manage Calling Proposals" },
  { flag: 64, label: "View Calling Proposals" },
] as const;
