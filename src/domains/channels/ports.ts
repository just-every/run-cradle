import type { SqlMutation, SqlPredicate } from '../admission/ports'
import type { RequestContext } from '../authority/ports'
export type ChannelEffects={guards:SqlPredicate[];mutations:SqlMutation[];notificationId?:string}
export type NotificationKind='decision-assigned'|'critical-risk-escalated'|'readiness'|'comment-mentioned'|'automation-failed'|'decision-overdue'|'outage'|'progress'|'weekly-digest'|'record-automation'
export type NotificationInput={kind:NotificationKind;operatorId:string;campaignId:string|null;subjectId:string;eventId:string;appId?:string;subjectType?:string;title?:string;body?:string;runId?:string;delivery?:'in-app'|'email'}
export type RecipientProjection=(ctx:RequestContext,input:NotificationInput)=>Promise<{guards:SqlPredicate[];title:string;body:string}>
