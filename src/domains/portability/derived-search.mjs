const quote=name=>'\"'+name.replaceAll('\"','\"\"')+'\"';
export async function derivedSearch(db){
 const virtual=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name").all()).results;
 const derived=['launch_search'];
 for(const {name} of virtual){
  if(name==='launch_search')continue;
  if(!/^r_[a-z0-9_]+_search$/.test(name))continue;
  const source=name.slice(0,-7);
  if(!(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(source).first()))continue;
  const columns=(await db.prepare(`PRAGMA table_xinfo(${quote(name)})`).all()).results.filter(c=>!c.hidden).map(c=>c.name);
  const base=new Set((await db.prepare(`PRAGMA table_xinfo(${quote(source)})`).all()).results.map(c=>c.name));
  if(columns[0]!=='record_id'||!columns.slice(1).every(c=>base.has(c)))continue;
  derived.push(name);
 }
 return derived;
}
