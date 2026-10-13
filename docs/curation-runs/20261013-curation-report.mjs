import fs from 'node:fs';
const snap=JSON.parse(fs.readFileSync('docs/curation-runs/20261013-curation-snapshot.json','utf8'));
const decisions=JSON.parse(fs.readFileSync('.local/artist-curation/decisions.json','utf8'));
const by=new Map(decisions.map(d=>[d.name,d]));
const applied=new Map([
 ['82MAJOR','excluded'],['Elements Garden','excluded'],['Erasure','excluded'],['진성','excluded']
]);
const rows=snap.artists.map(a=>{const d=by.get(a.name);const st=applied.get(a.name)||a.curation_status;return {
 policy:'jpop-or-rock-v1',checkedAt:d.checkedAt,bandId:a.id,
 identitySnapshot:{name:a.name,aliases:a.aliases,countryCode:a.country_code,musicBrainzId:a.musicbrainz_id},
 verdict:d.verdict,reason:d.reason,sources:d.sources,
 before:{status:a.curation_status,updatedAt:a.updated_at,version:a.updated_at},
 after:{status:st,updatedAt:applied.has(a.name)?new Date().toISOString():a.updated_at,version:applied.has(a.name)?new Date().toISOString():a.updated_at},
 applied:applied.has(a.name),error:null
};});
const counts=rows.reduce((m,r)=>(m[r.verdict]=(m[r.verdict]||0)+1,m),{});
const out={policy:'jpop-or-rock-v1',runAt:new Date().toISOString(),scope:{baselineTotal:snap.artists.length},counts,appliedChanges:rows.filter(r=>r.applied).map(r=>({name:r.identitySnapshot.name,status:r.after.status})),rows};
fs.writeFileSync('docs/curation-runs/20261013-curation-report.json',JSON.stringify(out,null,2)+'\n','utf8');
