import assert from 'node:assert/strict'

/** Test wire builder: all comment mutations use the shared record command door. */
export const recordAction = action => action.startsWith('comment.') ? action : 'launch.' + action
export function recordInput(action,input,expected) {
 if(!action.startsWith('comment.'))return input
 const {campaignId,...value}=input
 const subject=value.subject??expected.find(item=>item.ref.recordId===campaignId||!campaignId)?.ref
 assert.ok(subject,'A comment command requires its current record reference')
 return {...value,subject}
}
export async function recordComment(h,action,input,expected,session=h.ownerSession){
 const response=await h.request(session,`/api/v1/commands/${action}`,{method:'POST',body:JSON.stringify({commandId:h.r?.createUlid?.()??(await import('../../src/core/shared/ids.ts')).createUlid(),input:recordInput(action,input,expected),expected})})
 assert.equal(response.status,200,await response.clone().text())
 return (await response.json()).data.value
}
export async function recordThread(h,subject,session=h.ownerSession){
 const response=await h.request(session,'/api/v1/comments?'+new URLSearchParams(subject))
 assert.equal(response.status,200,await response.clone().text())
 return (await response.json()).data
}
export async function commentNotices(db,id){
 return (await db.prepare('SELECT n.* FROM notifications n JOIN channel_events e ON e.notification_id=n.id WHERE e.event_id=? AND n.kind=\'comment-mentioned\' ORDER BY n.id').bind(id).all()).results
}
