export type Role = "superadmin" | "admin" | "officer";
export type Account = { id: string; name: string; email: string; role: Role; passwordHash: string; createdAt: string };
export type ScoringRules = Record<string, Record<string, number>>;
export type ScoreResult = { collegeId: string; place: string; points: number; subPoints?: number };

export type AuditEntry = {
  action: "Submitted" | "Approved" | "Rejected" | "Edited" | "Reset to Pending";
  by: string;
  timestamp: string;
  notes?: string;
};

export type ScoreSubmission = {
  id: string;
  event: string;
  category: string;
  detail?: string;
  format?: string;
  results: ScoreResult[];
  by: string;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  auditTrail?: AuditEntry[];
  subPoints?: Record<string, number>;
};

export type GameSchedule = {
  id: string;
  event: string;
  category: string;
  detail?: string;
  round: string;
  teamA: string;
  teamB: string;
  date: string;
  time: string;
  venue: string;
  winner?: string;
  scoreA?: string;
  scoreB?: string;
  status: "Upcoming" | "Ongoing" | "Completed";
  createdBy: string;
  createdAt: string;
  isAllColleges?: boolean;
};

export type RuleAuditEntry = {
  updatedBy: string;
  updatedAt: string;
  summary: string;
};

export type Database = {
  users: Account[];
  scores: ScoreSubmission[];
  schedules: GameSchedule[];
  rules: ScoringRules;
  rulesConfirmed: boolean;
  rulesAuditTrail?: RuleAuditEntry[];
  updatedAt: string;
};
