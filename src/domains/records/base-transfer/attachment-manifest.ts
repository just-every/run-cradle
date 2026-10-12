import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'

export type ParsedAttachments = { parsed: true; names: string[]; urls: string[] } | { parsed: false; reason: string }
export type ManifestLine = { sourceFile: string; rowOrdinal: number; sourceLine?: number; primary: string; column: string; raw: string; attachments: ParsedAttachments }

/** Airtable's view guide says a CSV attachment cell holds each file's name and URL;
 * its attachment URL guide reads the name as the text before "(". A cell is parsed
 * only when the whole cell reads as `name (https://…)` items separated by ", ".
 * Any other text is kept raw and marked not parsed; nothing is guessed. */
export function parseCsvAttachmentCell(raw:string):ParsedAttachments {
 const item=/([^\r\n]+?) \((https:\/\/[^\s()]+)\)(?:, |$)/y,names:string[]=[],urls:string[]=[]
 let offset=0
 while(offset<raw.length){item.lastIndex=offset;const match=item.exec(raw);if(!match)break;names.push(match[1]!);urls.push(match[2]!);offset=item.lastIndex}
 return names.length&&offset===raw.length&&!raw.endsWith(', ')?{parsed:true,names,urls}:{parsed:false,reason:'Not parsed: the cell does not read as file name (https URL) items.'}
}
/** Airtable's Web API documents an attachment value as an array of objects with
 * `filename` and `url`. Anything else stays raw and unparsed. */
export function parseApiAttachmentValue(value:Json):ParsedAttachments {
 const fail={parsed:false as const,reason:'Not parsed: the value is not an array of attachment objects with filename and url.'}
 if(!Array.isArray(value)||!value.length)return fail
 const names:string[]=[],urls:string[]=[]
 for(const item of value){if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.filename!=='string'||typeof item.url!=='string')return fail;names.push(item.filename);urls.push(item.url)}
 return {parsed:true,names,urls}
}
const cell=(value:string|number|undefined)=>{const text=value===undefined?'':String(value);return /[",\r\n]/.test(text)||/^\s|\s$/.test(text)?`"${text.replaceAll('"','""')}"`:text}
export const MANIFEST_NOTICE='Source attachment links can expire. Download the files from the source while it still allows it; this list fetched nothing.'
/** One CSV record per nonempty skipped cell. Parsed names and URLs are JSON arrays in their cells. */
export function attachmentManifestCsv(lines:ManifestLine[]):string {
 const header=['source file','row ordinal','source line','primary value','column','raw cell text','parsed','file names','source urls','note']
 const body=lines.map(line=>[line.sourceFile,line.rowOrdinal,line.sourceLine,line.primary,line.column,line.raw,line.attachments.parsed?'yes':'no',
  line.attachments.parsed?JSON.stringify(line.attachments.names):'',line.attachments.parsed?JSON.stringify(line.attachments.urls):'',line.attachments.parsed?MANIFEST_NOTICE:line.attachments.reason+' '+MANIFEST_NOTICE].map(cell).join(','))
 return [header.join(','),...body].join('\r\n')+'\r\n'
}
