/** Other people's names and emails that contain the erased literal ('Jo Leeds' for 'Jo Lee').
 * Copies inside them are another person's identity and are never rewritten.
 */
export async function otherIdentities(db:D1Database,id:string,needles:string[]){
 const sources=["SELECT name value FROM operators WHERE id<>?1 UNION SELECT email FROM operators WHERE id<>?1","SELECT display_name value FROM oa_operators WHERE id NOT IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?1) UNION SELECT email FROM oa_operators WHERE id NOT IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?1)","SELECT name value FROM repair_contractors UNION SELECT email FROM repair_contractors"]
 const values=new Set<string>()
 for(const sql of sources)for(const row of (await db.prepare(`SELECT value FROM (${sql}) WHERE value IS NOT NULL AND (${needles.map((_,i)=>`instr(value,?${i+2})>0`).join(' OR ')})`).bind(id,...needles).all<{value:string}>()).results)if(!needles.includes(row.value))values.add(row.value)
 return [...values]
}
