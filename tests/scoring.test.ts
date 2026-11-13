import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, DISCIPLINES } from '../src/lib/catalog';
import { aggregateAwards, directAwards, overall, pointsFor, validatePlacings } from '../src/lib/scoring';
const entry={id:'ccs',categoryId:'',collegeId:'CCS' as const,label:'CCS'};
const win=[{entryId:'ccs',rank:1,eligible:true}];
test('CODM and MLBB championships contribute 40; no generic E-games award',()=>{
 const awards=['CODM','MLBB'].map(event=>({rows:directAwards(CATEGORIES.find(c=>c.event===event)!,win,[entry])}));
 assert.equal(overall(awards).find(r=>r.id==='CCS')!.points,40);
 assert(!CATEGORIES.some(c=>c.event==='E-Games'));
});
test('Dance Sports 24 and Instrumental Solo 10 across independent categories',()=>{
 for(const [event,total] of [['Dance Sports',24],['Instrumental Solo',10]] as const) assert.equal(overall(CATEGORIES.filter(c=>c.event===event).map(c=>({rows:directAwards(c,win,[entry])})))[0].points,total);
});
test('both athletes count; relay points differ; one final award',()=>{
 const individual=DISCIPLINES.find(d=>d.name==='100m Dash')!,relay=DISCIPLINES.find(d=>d.name==='4x100m Relay')!;
 assert.equal(pointsFor(1,true,individual.rule)+pointsFor(2,true,individual.rule),9);
 assert.equal(pointsFor(1,true,relay.rule),10);
 assert.equal(pointsFor(null,false,individual.rule),0);
 assert.equal(aggregateAwards(CATEGORIES.find(c=>c.id==='athletics-men')!,{CCS:19,CAS:8},[],'')[0].points,25);
});
test('unresolved rules and tied championships block final awards',()=>{
 for(const c of CATEGORIES.filter(c=>!c.confirmed)) assert.throws(()=>directAwards(c,win,[entry]));
 const c=CATEGORIES.find(c=>c.id==='athletics-men')!;
 assert.throws(()=>aggregateAwards(c,{CCS:5,CAS:5},[],''));
 assert.equal(aggregateAwards(c,{CCS:5,CAS:5},['CAS','CCS'],'Playoff won by CAS')[0].collegeId,'CAS');
});
test('overall ties share a rank and no awards shows unranked',()=>{
 assert(overall([]).every(r=>r.rank===0));
 const rows=overall([{rows:[{collegeId:'CCS',points:20,eligible:true,rank:1},{collegeId:'CAS',points:20,eligible:true,rank:1}]}]);
 assert.deepEqual(rows.slice(0,3).map(r=>r.rank),[1,1,3]);
});
test('placements reject duplicates, missing entrants, tied ranks and rank gaps',()=>{
 for(const rows of [[...win,...win],[{...win[0],rank:2}],[{...win[0],eligible:false}]]) assert.throws(()=>validatePlacings(rows,['ccs']));
});
test('catalog uses offered categories and exact weight labels',()=>{
 assert.equal(CATEGORIES.filter(c=>c.event==='Sepak Takraw').length,1);
 assert(DISCIPLINES.some(d=>d.id==='taekwondo-men-63kg'));
 assert(!DISCIPLINES.some(d=>/Poomsae|Anyo|5000|Hurdle/.test(d.name)));
 assert(DISCIPLINES.filter(d=>/Relay|Jump/.test(d.name)).every(d=>!d.active));
});
