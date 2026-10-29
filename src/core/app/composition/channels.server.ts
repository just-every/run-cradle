import {createRecordAutomationHistory} from '../../../domains/automations/history.server'
import {createHostedChannelDelivery} from '../../../domains/channels/hosted-delivery.server'
import seed from '../../../../seed.json'
import { measureChannelLimits } from '../../../domains/channels/limits.server'
import { ApiError } from '../../registry/errors'
import { createChannelMailBridge } from '../../../domains/channels/mail-bridge.server'
import { createChannelDelivery } from '../../../domains/channels/delivery.server'
import { NOTIFICATION_APP } from '../../../domains/channels/mail-authority.server'
import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import type { createProvidersComposition } from './providers.server'
import { createConfigurationEvidence } from '../../../domains/channels/configuration.server'
import { registerChannelCommands } from '../../../domains/channels/registry.server'
import { createChannelHttp } from '../../../domains/channels/routes.server'
import { createModelProfileReader } from '../../../domains/execution/profiles.server'
import { createUlid } from '../../shared/ids'

/** Configuration reads project current authorized provider evidence, never synthetic probes. */
export function createChannelsComposition(platform: Platform, foundation: ServerFoundation, providers: ReturnType<typeof createProvidersComposition>) {
  const db = platform.bindings.DB
  const profiles = createModelProfileReader({ db, policy: foundation.policy })
  const configuration = createConfigurationEvidence({
    db,policy:foundation.policy,
    connection: (ctx, id) => providers.connections(ctx).read(ctx, id),
    profile: profiles.read,
    async platform() {
      const env = platform.bindings
      const requiredSetup = [
        ...(!env.CONNECTION_ENCRYPTION_KEY ? ['CONNECTION_ENCRYPTION_KEY'] : []),
        ...(!env.CONNECTION_ENCRYPTION_KEY_VERSION ? ['CONNECTION_ENCRYPTION_KEY_VERSION'] : []),
        ...(!env.MAIL_FROM ? ['MAIL_FROM'] : []),
        ...(!env.INSTALLATION_RELEASE_ID ? ['INSTALLATION_RELEASE_ID'] : []),
      ]
      const aiMissing=env.RER_DEMO==='1'?[]:[...(!env.AI_PROVIDER_API_KEY?.trim()?['AI_PROVIDER_API_KEY']:[]),...(!env.AI_MODEL?.trim()?['AI_MODEL']:[])]
      const mailConfigured = platform.auth.configuration.baseMailConfigured === true
      return { capabilities: [{id:'mail.sender.v1',state:mailConfigured?'ready' as const:'unconfigured' as const,checkedAt:null,missing:mailConfigured?[]:['installation mail provider, sender and API key'],reason:mailConfigured?'The installation mail sender is configured. Provider acceptance and delivery are recorded separately.':'Configure the installation mail sender.',supportedActions:['notification.email.send']},{id:'ai.provider.v1',state:aiMissing.length?'unconfigured' as const:'ready' as const,checkedAt:null,missing:aiMissing,reason:'Configuration permits enabling AI; measured results are recorded separately.',supportedActions:['launch.campaign-brief','launch.risk-readout','launch.lens-proposal']}], requiredSetup, limits: await measureChannelLimits(db, seed.limits) }
    },
  })
  const dependencies = { db, policy: foundation.policy, configuration, entities:foundation.entities }
  // A readable subject also carries its title as this reader may read it now, so a
  // notice can name its record in words. Nothing read here is stored in the notice.
  const access: Parameters<typeof registerChannelCommands>[2] = async(ctx,ref)=>{
    if(!ref.subjectId||!ref.subjectType)return false
    try{
      if(ref.subjectType==='automation-run'){const run=await db.prepare('SELECT automation_id FROM automation_runs WHERE id=?').bind(ref.subjectId).first<{automation_id:string}>();return !!run&&(await createRecordAutomationHistory(db,foundation.policy,foundation.descriptors).runs(ctx,run.automation_id)).some(row=>row.id===ref.subjectId)&&{title:null}}
      const scope=await foundation.policy.scope(ctx,{appId:ref.appId,entityId:ref.subjectType,purpose:'read'})
      const descriptor=await foundation.descriptors.get(ref.appId,ref.subjectType)
      const entity=foundation.entities.get(ref.appId,ref.subjectType)
      if(!entity)return false
      const {identifier}=await import('../../../domains/admission/sql.server')
      const titleId=descriptor.schema.primaryFieldId??descriptor.schema.fields.find(field=>field.type==='text')?.id
      const title=titleId&&scope.readableFieldIds.includes(titleId)?descriptor.fields.get(titleId):undefined
      const row=await db.prepare(`SELECT ${title?.column?identifier(title.column):'NULL'} AS title FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${scope.rowPredicate.sql})`)
       .bind(ref.subjectId,...scope.rowPredicate.values).first<{title:unknown}>()
      if(!row)return false
      // Only words name a record here: a select by its option label, never a stored id
      // (Launch's retained Readiness requests title is its milestone_id text column).
      const value=title?.field.type==='select'?title.field.options?.find(option=>option.id===row.title)?.label:['text','email','phone','url','date'].includes(title?.field.type??'')?row.title:null
      return {title:typeof value==='string'&&value.trim()&&!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value.trim())?value.trim():null}
    }catch{return false}
  }
  const services = registerChannelCommands(foundation.commands, dependencies,access)
  const http = createChannelHttp({ ...dependencies, access, commands: foundation.commands, authenticate: request => foundation.authenticate(request, 'http', createUlid()) })
  const mail = createChannelMailBridge({ authority: providers.notificationAuthority, execution: providers.execution, async connection() {
    const env = platform.bindings
    if (!env.NOTIFICATION_MAIL_CONNECTION_ID || !env.MAIL_FROM || !env.INSTALLATION_RELEASE_ID) throw new ApiError('unconfigured', 'Notification mail requires its explicit connection, sender and installation release.')
    const row = await db.prepare("SELECT id,version FROM provider_connections WHERE id=? AND app_id=? AND adapter_id='resend' AND account_id=? AND state='connected' AND revoked_at IS NULL").bind(env.NOTIFICATION_MAIL_CONNECTION_ID, NOTIFICATION_APP, env.MAIL_FROM).first<{id:string;version:number}>()
    if (!row) throw new ApiError('unconfigured', 'The configured notification sender connection is unavailable.')
    return { ...row, from: env.MAIL_FROM, releaseId: env.INSTALLATION_RELEASE_ID }
  } })
  const delivery = platform.bindings.NOTIFICATION_MAIL_CONNECTION_ID?createChannelDelivery(db, foundation.admission, mail):createHostedChannelDelivery(platform.bindings,foundation.admission,foundation.entities)
  return { ...services, configuration, http, delivery }
}
