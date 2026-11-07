export type Role = "superadmin" | "admin" | "officer";
export type Account = { id: string; name: string; email: string; role: Role; passwordHash: string; createdAt: string };
export type ScoringRules = Record<string, Record<string, number>>;
export type ScoreResult = { collegeId: string; place: string; points: number };
export type ScoreSubmission = { id: string; event: string; category: string; detail?: string; format?: string; results: ScoreResult[]; by: string; status: "Pending" | "Approved" | "Rejected"; createdAt: string; reviewedBy?: string; reviewedAt?: string };
export type Database = { users: Account[]; scores: ScoreSubmission[]; rules: ScoringRules; rulesConfirmed: boolean; updatedAt: string };
