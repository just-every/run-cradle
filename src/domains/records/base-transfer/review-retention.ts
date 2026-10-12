import { canonicalJson, sha256 } from '../../../../vendor/base/modules/import-kit/src/provenance/identity'
import { checkSql } from '../../../../vendor/base/modules/import-kit/src/d1/budget'
import type { BasePreview } from './contracts'

/** Prepare the exact retained-review statements before any review is written.
 * This checks the complete preview/report/options, in addition to the Kit plan.
 * No source content is removed and no second plan-size limit is invented. */
export function prepareReviewRetention(detail:BasePreview) {
 const text=canonicalJson(detail),chunks:string[]=[]
 let chunk=''
 for(const cp of text){chunk+=cp;if(chunk.length>=32000){chunks.push(chunk);chunk=''}}
 if(chunk)chunks.push(chunk)
 const batches:{ordinal:number;body:string}[][]=[]
 let group:{ordinal:number;body:string}[]=[],size=2
 for(const [ordinal,body] of chunks.entries()){
  const row={ordinal,body},bytes=new TextEncoder().encode(JSON.stringify(row)).length
  if(group.length&&size+bytes>1500000){batches.push(group);group=[];size=2}
  group.push(row);size+=bytes+1
 }
 if(group.length)batches.push(group)
 const statements=batches.map(rows=>({sql:"INSERT INTO record_import_review_chunks(review_id,ordinal,body) SELECT ?,json_extract(value,'$.ordinal'),json_extract(value,'$.body') FROM json_each(?)",params:['0'.repeat(26),JSON.stringify(rows)]}))
 for(const statement of statements)checkSql(statement)
 return {manifest:JSON.stringify({chunks:chunks.length}),detailHash:sha256(text),statements}
}
export type ReviewRetention=ReturnType<typeof prepareReviewRetention>
