import { COLLEGES, type PointsRule, type Category } from './catalog';
import type { AwardRow, Entry, Placing, ResultBody, Schedule } from './model';
export function pointsFor(rank: number | null, eligible: boolean, rule: PointsRule) {
  if (!eligible) return 0;
  return rank !== null && rank <= rule.podium.length ? rule.podium[rank - 1] : rule.participation;
}
export function validatePlacings(rows: Placing[], entries: string[]) {
  if (rows.length !== entries.length || new Set(rows.map(r => r.entryId)).size !== entries.length || rows.some(r => !entries.includes(r.entryId))) throw new Error('Include each scheduled entry exactly once.');
  const ranked = rows.filter(r => r.rank !== null);
  if (ranked.some(r => !r.eligible || !Number.isInteger(r.rank) || r.rank! < 1 || r.rank! > entries.length)) throw new Error('A placing must belong to an eligible entry and be within the field size.');
  if (new Set(ranked.map(r => r.rank)).size !== ranked.length) throw new Error('Resolve tied placings with an official ruling before submitting.');
  const ranks = ranked.map(r => r.rank!).sort((a,b) => a-b);
  if (ranks.some((n,i) => n !== i+1)) throw new Error('Ranked placings must start at 1 without gaps.');
  if (rows.some(r=>r.eligible) && !ranks.length) throw new Error('Enter at least the champion placing.');
}
export function directAwards(category: Category, rows: Placing[], entries: Entry[]): AwardRow[] {
  if (!category.confirmed) throw new Error(category.hold || 'Official scoring configuration is not confirmed.');
  validatePlacings(rows, entries.map(e => e.id));
  if(rows.filter(r=>r.rank!==null).length < Math.min(category.rule.podium.length,rows.filter(r=>r.eligible).length)) throw new Error('Complete all available podium placings before awarding official points.');
  const awards = rows.map(row => ({ collegeId: entries.find(e => e.id === row.entryId)!.collegeId, entryId: row.entryId, rank: row.rank, eligible: row.eligible, points: pointsFor(row.rank, row.eligible, category.rule) }));
  if (category.policy === 'college' && new Set(awards.map(r=>r.collegeId)).size !== awards.length) throw new Error('This category awards once per college.');
  if (category.policy === 'best_entry') return COLLEGES.flatMap(c => awards.filter(r=>r.collegeId===c.id).sort((a,b)=>b.points-a.points).slice(0,1));
  return awards;
}
export function aggregateAwards(category: Category, totals: Record<string, number>, tieOrder: string[], ruling: string): AwardRow[] {
  if (!category.confirmed) throw new Error('Official rule is not confirmed.');
  const rows = COLLEGES.filter(c => (totals[c.id] || 0)>0).map(c => ({ collegeId:c.id, subPoints:totals[c.id] }));
  const tied = rows.some((r,i) => rows.some((s,j) => i!==j && r.subPoints === s.subPoints));
  if (tied && (!ruling.trim() || tieOrder.length !== rows.length || new Set(tieOrder).size!==rows.length || rows.some(r=>!tieOrder.includes(r.collegeId)))) throw new Error('Record the official playoff/tie ruling and a complete college order.');
  rows.sort((a,b) => b.subPoints-a.subPoints || tieOrder.indexOf(a.collegeId)-tieOrder.indexOf(b.collegeId));
  return rows.map((r,i) => ({...r, rank:i+1, eligible:true, points:pointsFor(i+1,true,category.rule)}));
}
export function overall(awards: {rows: AwardRow[]}[]) {
  const rows = COLLEGES.map(c => ({...c, points:0, gold:0, silver:0, bronze:0, rank:0}));
  for (const award of awards) for (const row of award.rows) {
    const college = rows.find(c=>c.id===row.collegeId)!;
    college.points += row.points;
    if(row.eligible && row.rank===1) college.gold++;
    if(row.eligible && row.rank===2) college.silver++;
    if(row.eligible && row.rank===3) college.bronze++;
  }
  rows.sort((a,b)=>b.points-a.points || a.id.localeCompare(b.id));
  rows.forEach((r,i)=>r.rank = awards.length ? (i && rows[i-1].points===r.points ? rows[i-1].rank : i+1) : 0);
  return rows;
}
export function tournamentTable(matches: {schedule: Schedule; body: ResultBody}[], entries: Entry[], mode: 'codm'|'mlbb') {
  const ids = [...new Set(matches.flatMap(m=>m.schedule.entryIds))];
  const rows = ids.map(id => ({id, label:entries.find(e=>e.id===id)?.label||id, collegeId:entries.find(e=>e.id===id)?.collegeId, played:0, wins:0, losses:0, for:0, against:0, points:0, tied:false}));
  for (const {schedule:s,body:b} of matches) {
    if (s.entryIds.length!==2 || b.scoreA===null || b.scoreB===null) continue;
    const a=rows.find(r=>r.id===s.entryIds[0])!, c=rows.find(r=>r.id===s.entryIds[1])!;
    a.played++; c.played++;
    if(b.outcome==='double_forfeit') {a.losses++;c.losses++;a.against+=2;c.against+=2;continue;}
    a.for+=b.scoreA;c.for+=b.scoreB;a.against+=b.scoreB;c.against+=b.scoreA;
    const win=b.scoreA>b.scoreB?a:c, lose=win===a?c:a;
    win.wins++;lose.losses++;
    if(mode==='mlbb') { win.points+=Math.min(b.scoreA,b.scoreB)===0?3:2;lose.points+=Math.min(b.scoreA,b.scoreB)===0?0:1; }
  }
  const primary = (a:typeof rows[number],b:typeof rows[number]) => mode==='mlbb' ? b.points-a.points : b.wins-a.wins || (b.for-b.against)-(a.for-a.against) || b.for-a.for;
  rows.sort(primary);
  // CODM: direct encounter for two-way ties, mini-table wins then map difference for 3+.
  for(let i=0;i<rows.length;) {
    let end=i+1; while(end<rows.length && primary(rows[i],rows[end])===0) end++;
    const group=rows.slice(i,end);
    if(group.length>1) {
      const mini=new Map(group.map(r=>[r.id,{wins:0,diff:0}]));
      for(const {schedule:s,body:b} of matches) if(mini.has(s.entryIds[0])&&mini.has(s.entryIds[1])&&b.scoreA!==null&&b.scoreB!==null&&b.outcome!=='double_forfeit') {
        const a=mini.get(s.entryIds[0])!, c=mini.get(s.entryIds[1])!;
        a.wins+=Number(b.scoreA>b.scoreB);c.wins+=Number(b.scoreB>b.scoreA);a.diff+=b.scoreA-b.scoreB;c.diff+=b.scoreB-b.scoreA;
      }
      const cmp=(a:typeof rows[number],b:typeof rows[number]) => mode==='mlbb'?0:mini.get(b.id)!.wins-mini.get(a.id)!.wins || (group.length>2?mini.get(b.id)!.diff-mini.get(a.id)!.diff:0);
      group.sort(cmp); group.forEach(r=>r.tied=group.some(other=>other.id!==r.id&&cmp(r,other)===0)); rows.splice(i,group.length,...group);
    }
    i=end;
  }
  return rows;
}
