import type { SqlMutation, SqlPredicate } from '../../domains/admission/ports'
import type { RequestContext } from '../../domains/authority/ports'
export type LaunchEffects={guards:SqlPredicate[];mutations:SqlMutation[];notificationId?:string}
/** Effects are prepared only; caller admits them with the domain mutation. */
export interface LaunchIntegration {
 notification(ctx:RequestContext,input:{kind:'comment-mentioned'|'decision-assigned'|'critical-risk-escalated'|'readiness'|'automation-failed'|'record-automation';operatorId:string;campaignId:string|null;subjectId:string;eventId:string;runId?:string;delivery?:'in-app'|'email'|'both'}):Promise<LaunchEffects>
 withdrawNotification(ctx:RequestContext,notificationId:string):Promise<LaunchEffects>
 withdrawCampaign(ctx:RequestContext,campaignId:string):Promise<LaunchEffects>
 deleteCampaign(ctx:RequestContext,campaignId:string):Promise<LaunchEffects>
}
