import type { Database } from '../shared/repository'
import { queryAll } from '../shared/repository'

const resultPositions=Array.from({length:20},(_,position)=>`(${position})`).join(',')
/** FTS token syntax is constructed from literal unicode tokens, never raw query syntax. */
export const createSearchRepository=(database:Database)=>({
 async search(query:string,includeArchived:boolean){
  const tokens=query.match(/[\p{L}\p{N}]+/gu)??[];if(!tokens.length)return[]
  const match=tokens.map(token=>'"'+token.replaceAll('"','""')+'"*').join(' AND ')
  // Aggregate ordered index identities once in SQLite binary JSON. Twenty positions per type avoid a
  // second full window/JSON-iterator scan; only selected identities are hydrated.
  return queryAll(database,`WITH grouped AS MATERIALIZED (
   SELECT s.record_type AS recordType,count(*) AS size,
    jsonb_group_array(jsonb_object('id',s.record_id,'campaignId',s.campaign_id) ORDER BY s.record_id) AS records
   FROM launch_search s
   WHERE launch_search MATCH ? AND (?=1 OR s.campaign_id NOT IN (
    SELECT id FROM campaigns WHERE archived_at IS NOT NULL
   )) GROUP BY s.record_type
  ), positions(position) AS (VALUES ${resultPositions}), selected AS MATERIALIZED (
   SELECT g.recordType,json_extract(g.records,'$['||p.position||'].id') AS id,
    json_extract(g.records,'$['||p.position||'].campaignId') AS campaignId
   FROM grouped g CROSS JOIN positions p WHERE p.position<g.size
  )
   SELECT s.id,s.recordType,c.code AS campaignCode,
    CASE s.recordType WHEN 'Campaign' THEN c.name
     WHEN 'Deliverable' THEN (SELECT title FROM deliverables WHERE id=s.id)
     WHEN 'Risk' THEN (SELECT title FROM risks WHERE id=s.id)
     WHEN 'Milestone' THEN (SELECT title FROM milestones WHERE id=s.id)
     WHEN 'Decision' THEN (SELECT title FROM decisions WHERE id=s.id) END AS name,
    c.code AS code
   FROM selected s CROSS JOIN campaigns c ON c.id=s.campaignId
   ORDER BY s.recordType,s.id`,[match,Number(includeArchived)])
 },
})
