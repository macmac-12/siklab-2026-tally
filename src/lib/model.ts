import type { Category, Discipline, CollegeId } from "./catalog";
export type User = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "officer";
  active: boolean;
  assignments: string[];
  mustReset: boolean;
};
export type Entry = {
  id: string;
  categoryId: string;
  collegeId: CollegeId;
  label: string;
};
export type Schedule = {
  id: string;
  categoryId: string;
  disciplineId: string | null;
  title: string;
  kind: "match" | "placing";
  stage: string;
  isFinal: boolean;
  table: "none" | "codm" | "mlbb";
  bestOf: number | null;
  entryIds: string[];
  venue: string;
  startsAt: string | null;
  endsAt: string | null;
  followsId: string | null;
  date: string;
  status: "upcoming" | "ongoing" | "completed" | "postponed" | "cancelled";
  reason: string;
  version: number;
  /** Changes only when participants, result scope or lifecycle changes. */
  scoringVersion?: number;
  publishedId: string | null;
};
export type Placing = {
  entryId: string;
  rank: number | null;
  eligible: boolean;
};
export type ResultBody = {
  scoreA: number | null;
  scoreB: number | null;
  outcome: "normal" | "forfeitA" | "forfeitB" | "double_forfeit";
  decision?: { kind: "winner"; entryId: string } | { kind: "draw" };
  placings: Placing[];
  note: string;
  ruling: string;
  awardPlacings?: Placing[];
  awardTieOrder?: string[];
  awardRuling?: string;
  impact?: AwardBody;
};
export type AwardRow = {
  collegeId: CollegeId;
  rank: number | null;
  eligible: boolean;
  points: number;
  subPoints?: number;
  entryId?: string;
};
export type AwardBody = {
  method?: "calculated" | "certified";
  /** Editor inputs are retained only on unpublished draft history. */
  draftInputs?: {
    placings: Placing[];
    collegePlacings: CollegePlacing[];
    tieOrder: string[];
  };
  rows: AwardRow[];
  source: string;
  ruleVersion: number;
  ruling: string;
};
export type AwardMethod = NonNullable<AwardBody["method"]>;
export type CollegePlacing = {
  collegeId: CollegeId;
  rank: number | null;
  eligible: boolean;
};
export type Revision = {
  id: string;
  categoryId: string;
  scheduleId: string | null;
  kind: "result" | "award";
  status: "draft" | "pending" | "approved" | "rejected" | "superseded";
  body: ResultBody | AwardBody;
  baseId: string | null;
  actorId: string;
  reason: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewerId: string | null;
};
export type Audit = {
  id: string;
  actorId: string;
  action: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string;
  createdAt: string;
};
export type TallyTotals = {
  points: number;
  gold: number;
  silver: number;
  bronze: number;
};
/** Signed official corrections, independent from championship awards. */
export type TallyAdjustment = TallyTotals & { collegeId: CollegeId };
export type Snapshot = {
  categories: Category[];
  disciplines: Discipline[];
  entries: Entry[];
  schedules: Schedule[];
  revisions: Revision[];
  updatedAt: string;
  version: number;
};
export type StaffSnapshot = Snapshot & {
  brackets: import("./brackets").BracketRecord[];
  user: User;
  users: User[];
  audit: Audit[];
  revisionActors: Array<{ id: string; name: string }>;
  tallyAdjustments: TallyAdjustment[];
};
export type PublicSnapshot = Omit<Snapshot, "revisions"> & {
  tallyAdjustments: TallyAdjustment[];
  results: Array<{
    id: string;
    categoryId: string;
    scheduleId: string;
    body: ResultBody;
    publishedAt: string;
  }>;
  awards: Array<{
    id: string;
    categoryId: string;
    body: AwardBody;
    publishedAt: string;
  }>;
};
