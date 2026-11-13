import type { Category, Discipline, CollegeId } from './catalog';
export type User = { id: string; name: string; email: string; role: 'superadmin' | 'admin' | 'officer'; active: boolean; assignments: string[]; mustReset: boolean };
export type Entry = { id: string; categoryId: string; collegeId: CollegeId; label: string };
export type Schedule = {
 id: string; categoryId: string; disciplineId: string | null; title: string; kind: 'match' | 'placing';
 stage: string; isFinal: boolean; table: 'none' | 'codm' | 'mlbb'; bestOf: number | null; entryIds: string[];
 venue: string; startsAt: string | null; endsAt: string | null; followsId: string | null; date: string;
 status: 'upcoming' | 'ongoing' | 'completed' | 'postponed' | 'cancelled'; reason: string;
 version: number; publishedId: string | null;
};
export type Placing = { entryId: string; rank: number | null; eligible: boolean };
export type ResultBody = { scoreA: number | null; scoreB: number | null; outcome: 'normal' | 'forfeitA' | 'forfeitB' | 'double_forfeit'; placings: Placing[]; note: string; ruling: string; awardPlacings?: Placing[]; awardTieOrder?: string[]; awardRuling?: string; impact?: AwardBody };
export type AwardRow = { collegeId: CollegeId; rank: number | null; eligible: boolean; points: number; subPoints?: number; entryId?: string };
export type AwardBody = { rows: AwardRow[]; source: string; ruleVersion: number; ruling: string };
export type Revision = { id: string; categoryId: string; scheduleId: string | null; kind: 'result' | 'award'; status: 'draft' | 'pending' | 'approved' | 'rejected' | 'superseded'; body: ResultBody | AwardBody; baseId: string | null; actorId: string; reason: string; reviewNote: string; createdAt: string; reviewedAt: string | null; reviewerId: string | null };
export type Audit = { id: string; actorId: string; action: string; entityId: string; before: unknown; after: unknown; reason: string; createdAt: string };
export type Snapshot = { categories: Category[]; disciplines: Discipline[]; entries: Entry[]; schedules: Schedule[]; revisions: Revision[]; updatedAt: string; version: number };
export type StaffSnapshot = Snapshot & { user: User; users: User[]; audit: Audit[] };
export type PublicSnapshot = Omit<Snapshot, 'revisions'> & { results: Array<{id: string; categoryId: string; scheduleId: string; body: ResultBody; publishedAt: string}>; awards: Array<{id: string; categoryId: string; body: AwardBody; publishedAt: string}> };
