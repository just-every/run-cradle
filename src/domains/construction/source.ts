import type { SourceFile, AppSource } from './contracts';
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
export async function digest(bytes: string | Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes)))).map(b => b.toString(16).padStart(2,'0')).join('');
}
export function validateFiles(files: unknown): SourceFile[] {
  if (!Array.isArray(files) || !files.length || files.length > 2000) throw new Error('invalid_source_files');
  const seen = new Set<string>(); let bytes = 0;
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string' || file.path.length > 240 || file.path.startsWith('/') || file.path.includes('\\') || !/^[a-zA-Z0-9_./@+ -]+$/.test(file.path) || file.path.split('/').some((part: string) => !part || part === '.' || part === '..') || seen.has(file.path)) throw new Error('unsafe_source_file');
    seen.add(file.path); bytes += new TextEncoder().encode(file.content).length;
  }
  if (bytes > 12 * 1024 * 1024) throw new Error('source_too_large');
  return files;
}
export function validateAppSource(value: unknown): AppSource {
  const v = value as AppSource; validateFiles(v?.files);
  if (!v.schemaRevision || (!Number.isSafeInteger(v.policyVersion)||v.policyVersion<1) || (!Number.isSafeInteger(v.actionVersion)||v.actionVersion<1) || !v.migrationPlanId || !v.recoveryPlanId || v.sourcePolicy?.grantsActive !== false || v.sourcePolicy?.contextExpanded !== false) throw new Error('invalid_application_source');
  for (const key of ['schema','source','permissions','egress','migrations','backfill','inFlight'] as const) if (!Array.isArray(v.diff?.[key]) || v.diff[key].some(x => typeof x !== 'string')) throw new Error('missing_release_effects');
  if (!v.impact || !Array.isArray(v.impact.spend) || !Array.isArray(v.impact.egress) || !Array.isArray(v.impact.accessChanges)) throw new Error('missing_impact');
  if(typeof v.impact.summary!=='string'||!Array.isArray(v.impact.commitments)||!Array.isArray(v.impact.affected)||!Array.isArray(v.impact.uncertainty)||v.impact.spend.some(m=>!m||!/^\d+$/.test(m.minor)||typeof m.currency!=='string'||!Number.isSafeInteger(m.scale)||m.scale<0||m.scale>9)||v.impact.egress.some(e=>typeof e.destination!=='string'||typeof e.purpose!=='string'||!Array.isArray(e.fields)||e.fields.some(f=>typeof f!=='string')))throw new Error('invalid_impact');
  const manifest = v.files.find(f => f.path === 'cradle-build.json');
  if (!manifest) throw new Error('missing_build_manifest');
  const parsed = JSON.parse(manifest.content);
  for (const kind of ['build','evaluate','invoke']) if (!Array.isArray(parsed.commands?.[kind]) || !parsed.commands[kind].length) throw new Error(`missing_${kind}_command`);
  return v;
}
/** A conflict preserves all three versions for an owner's agent; it never overwrites current bytes. */
export function mergeSources(baseline: SourceFile[], current: SourceFile[], generated: SourceFile[]): { files: SourceFile[]; conflicts: { path: string; baseline: string | null; current: string | null; generated: string | null }[] } {
  [baseline,current,generated].forEach(validateFiles);
  const [b,c,g] = [baseline,current,generated].map(files => new Map(files.map(f => [f.path,f.content])));
  const files: SourceFile[] = [], conflicts = [];
  for (const path of [...new Set([...b.keys(),...c.keys(),...g.keys()])].sort()) {
    const before = b.get(path), now = c.get(path), next = g.get(path);
    if (now !== before && next !== before && now !== next) { conflicts.push({ path, baseline: before ?? null, current: now ?? null, generated: next ?? null }); if (now !== undefined) files.push({path,content:now}); }
    else { const content = now === before ? next : now; if (content !== undefined) files.push({path,content}); }
  }
  return { files, conflicts };
}
export function bundle(files: SourceFile[]): string {
  validateFiles(files);
  return canonical({ version: 1, files: [...files].sort((a,b) => a.path.localeCompare(b.path)).map(f => ({ path: f.path, content: encodeBase64(f.content) })) });
}

function encodeBase64(content:string){const bytes=new TextEncoder().encode(content);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
export async function stableId(value:unknown):Promise<string>{let number=BigInt('0x'+(await digest(canonical(value))).slice(0,32)),id='';const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';for(let i=0;i<26;i++){id=alphabet[Number(number&31n)]+id;number>>=5n;}return id;}
