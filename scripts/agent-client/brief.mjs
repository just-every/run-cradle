/** Read a plain structured brief into tables, field specs, views and forms. No model, no app knowledge.
 *
 *   Base: NAME                 (or `Change: NAME` to extend the key's existing base)
 *   TABLE: Field (spec), Field (spec), ...        in a change, prefix new fields with `add`
 *   Views: a grid of each table; a board of T by F; a calendar of T by F;
 *          a calendar-ordered grid of T by F; a grid of T sorted by F
 *   Forms: a form for T
 *
 * Field specs: text, number, date, checkbox, url, `select: A | B`, `link to TABLE`,
 * `lookup of LINK's FIELD`; add `, primary` or `, required` after the type. */
export function parseBrief(text){
 const brief={mode:null,name:null,tables:[],views:[],forms:[]}
 for(const raw of text.split('\n')){
  const line=raw.trim();if(!line||line.startsWith('#'))continue
  const colon=line.indexOf(':');if(colon<0)throw new Error(`Brief line has no "Name:" prefix: ${line}`)
  const key=line.slice(0,colon).trim(),rest=line.slice(colon+1).trim()
  if(key==='Base'||key==='Change'){brief.mode=key==='Base'?'create':'change';brief.name=rest;continue}
  if(key==='Views'){brief.views.push(...rest.split(';').map(s=>s.trim()).filter(Boolean).map(parseView));continue}
  if(key==='Forms'){brief.forms.push(...rest.split(';').map(s=>s.trim()).filter(Boolean).map(parseForm));continue}
  brief.tables.push({label:key,fields:splitTop(rest).map(parseField)})
 }
 if(!brief.mode||!brief.name)throw new Error('A brief starts with "Base: NAME" or "Change: NAME".')
 return brief
}
function splitTop(text){const parts=[];let depth=0,current='';for(const ch of text){if(ch==='(')depth++;if(ch===')')depth--;if(ch===','&&depth===0){parts.push(current.trim());current=''}else current+=ch}if(current.trim())parts.push(current.trim());return parts}
function parseField(text){
 const match=text.match(/^(add\s+)?(.+?)\s*\((.+)\)$/);if(!match)throw new Error(`Field needs "Label (type)": ${text}`)
 const [type,...flags]=match[3].split(',').map(s=>s.trim()),field={label:match[2].trim(),added:Boolean(match[1]),primary:flags.includes('primary'),required:flags.includes('required')}
 let m
 if(['text','number','date','url'].includes(type))return {...field,type}
 if(type==='checkbox')return {...field,type:'boolean'}
 if((m=type.match(/^select:\s*(.+)$/)))return {...field,type:'select',options:m[1].split('|').map(s=>s.trim()).filter(Boolean)}
 if((m=type.match(/^link to\s+(.+)$/)))return {...field,type:'relation',target:m[1].trim()}
 if((m=type.match(/^lookup of\s+(.+?)'s\s+(.+)$/)))return {...field,type:'computed',via:m[1].trim(),source:m[2].trim()}
 throw new Error(`Unknown field type "${type}" for ${field.label}`)
}
function parseView(text){
 let m
 if(/^a grid of each table$/i.test(text))return {kind:'each-grid'}
 if((m=text.match(/^a board of (.+) by (.+)$/i)))return {kind:'board',table:m[1].trim(),field:m[2].trim()}
 if((m=text.match(/^a calendar-ordered grid of (.+) by (.+)$/i)))return {kind:'sorted-grid',table:m[1].trim(),field:m[2].trim()}
 if((m=text.match(/^a calendar of (.+) by (.+)$/i)))return {kind:'calendar',table:m[1].trim(),field:m[2].trim()}
 if((m=text.match(/^a grid of (.+) sorted by (.+)$/i)))return {kind:'sorted-grid',table:m[1].trim(),field:m[2].trim()}
 throw new Error(`Unknown view: ${text}`)
}
function parseForm(text){const m=text.match(/^a form for (.+?)(?: titled "(.+)")?$/i);if(!m)throw new Error(`Unknown form: ${text}`);return {table:m[1].trim(),title:m[2]?.trim()}}
