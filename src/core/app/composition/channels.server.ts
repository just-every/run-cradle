import {createLocalChannelDelivery} from '../../../domains/channels/local-delivery.server'
import {capturedMailEnabled} from '../../platform/local-auth.server'
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
      const aiMissing=[...(!env.AI_PROVIDER_API_KEY?.trim()?['AI_PROVIDER_API_KEY']:[]),...(!env.AI_MODEL?.trim()?['AI_MODEL']:[])]
      const mailConfigured = platform.auth.configuration.baseMailConfigured === true
      return { capabilities: [{id:'mail.sender.v1',state:mailConfigured?'ready' as const:'unconfigured' as const,checkedAt:null,missing:mailConfigured?[]:['installation mail provider, sender and API key'],reason:mailConfigured?'The installation mail sender is configured. Provider acceptance and delivery are recorded separately.':'Configure the installation mail sender.',supportedActions:['notification.email.send']},{id:'ai.provider.v1',state:aiMissing.length?'unconfigured' as const:'ready' as const,checkedAt:null,missing:aiMissing,reason:'Configuration permits enabling AI; measured results are recorded separately.',supportedActions:['launch.campaign-brief','launch.risk-readout','launch.lens-proposal']}], requiredSetup, limits: await measureChannelLimits(db, seed.limits) }
    },
  })
  const dependencies = { db, policy: foundation.policy, configuration }
  const access: Parameters<typeof registerChannelCommands>[2] = async(ctx,ref)=>{
    if(!ref.subjectId||!ref.subjectType)return false
    try{
      const scope=await foundation.policy.scope(ctx,{appId:ref.appId,entityId:ref.subjectType,purpose:'read'})
      await foundation.descriptors.get(ref.appId,ref.subjectType)
      const entity=foundation.entities.get(ref.appId,ref.subjectType)
      if(!entity)return false
      const {identifier}=await import('../../../domains/admission/sql.server')
      return !!await db.prepare(`SELECT 1 FROM ${identifier(entity.table)} WHERE ${identifier(entity.idColumn)}=? AND (${scope.rowPredicate.sql})`)
       .bind(ref.subjectId,...scope.rowPredicate.values).first()
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
  const delivery = capturedMailEnabled(platform.bindings)&&platform.bindings.MAIL_PROVIDER==='development'?createLocalChannelDelivery(platform.bindings,foundation.admission):createChannelDelivery(db, foundation.admission, mail)
  return { ...services, configuration, http, delivery }
}
