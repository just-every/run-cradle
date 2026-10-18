import { createConnectionJobs } from '../../../domains/connections/jobs.server'
import { connectionRelease } from '../../../domains/connections/provenance.server'
import { registerConnectionCommands } from '../../../domains/connections/commands.server'
import { createConnectionSetupHttp } from '../../../domains/connections/setup.server'
import { createConnectionHttp } from '../../../domains/connections/routes.server'
import { createExecutionCollections } from '../../../domains/execution/collections.server'
import { createModelProfileReader } from '../../../domains/execution/profiles.server'
import { modelSchemaKey } from '../../../domains/execution/model.server'
import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import { createProviderRuntime } from '../../../domains/execution/runtime.server'
import { createExecutionGuards } from './execution-guards.server'
import { createDeliveryObservations } from '../../../domains/channels/delivery.server'
import { applicationSourceModelSchema } from '../../../domains/construction/model-schema'
import { operationModelSchema } from '../../../domains/operations/model.server'
import { formulationModelSchema } from '../../../domains/intelligence/model'
import { createExecutionHttp } from '../../../domains/execution/routes.server'
import { registerExecutionCommands } from '../../../domains/execution/commands.server'
import { createUlid } from '../../shared/ids'
import { ApiError } from '../../registry/errors'
import type { ModelSchema } from '../../../domains/execution/model-ports'
export function createProvidersComposition(platform:Platform,foundation:ServerFoundation){
 const env=platform.bindings
 const connectionKeyVersion=env.CONNECTION_ENCRYPTION_KEY_VERSION??'v1'
 const schemas=new Map<string,ModelSchema>([[modelSchemaKey('cradle.application-source',1),applicationSourceModelSchema],[modelSchemaKey('operation.next-action',1),operationModelSchema],[modelSchemaKey('intelligence.formulation',1),formulationModelSchema]])
 const secrets=new Map<string,{dispatch?:string;readback?:string}>()
 if(env.MAIL_PROVIDER_API_KEY)secrets.set('MAIL_PROVIDER_API_KEY',{dispatch:env.MAIL_PROVIDER_API_KEY,readback:env.MAIL_PROVIDER_API_KEY})
 if(env.AI_PROVIDER_API_KEY)secrets.set('AI_PROVIDER_API_KEY',{dispatch:env.AI_PROVIDER_API_KEY,readback:env.AI_PROVIDER_API_KEY})
 const runtime=createProviderRuntime({db:env.DB,notificationEntities:foundation.entities,admission:foundation.admission,policy:foundation.policy,bucket:env.FILES,auth:platform.auth.configuration,workspaceId:'workspace',
  keyVersion:connectionKeyVersion,encryptionKey:version=>version===connectionKeyVersion?env.CONNECTION_ENCRYPTION_KEY:undefined,secrets,schemas,
  oauth(provider){const clientId=provider==='xero'?env.XERO_CLIENT_ID:env.GOOGLE_CLIENT_ID,clientSecret=provider==='xero'?env.XERO_CLIENT_SECRET:env.GOOGLE_CLIENT_SECRET;if(!clientId||!clientSecret)throw new ApiError('unconfigured',`${provider} OAuth credentials are required.`);return{clientId,clientSecret,redirectUri:`${platform.auth.configuration.appOrigin}/oauth/${provider==='xero'?'xero':'google'}/callback`}},
  currentGuards:createExecutionGuards(env.DB,foundation),observations:createDeliveryObservations(env.DB).prepare,
 })
 const jobs=createConnectionJobs({db:env.DB,admission:foundation.admission,policy:foundation.policy,service:runtime.connections,releaseId:connectionRelease(env.DB,foundation.policy),backgroundContext:runtime.background.connectionJob})
 registerConnectionCommands(foundation.commands,runtime.connections,jobs)
 registerExecutionCommands(foundation.commands,runtime.dependencies)
 const authenticate=(request:Request)=>foundation.authenticate(request,'http',createUlid())
 const connectionHttp=createConnectionHttp({service:runtime.connections,authenticate,webhook:runtime.webhook,webhookSecret:runtime.webhookSecret})
 const setupHttp=createConnectionSetupHttp({authenticate,writeCredentials:runtime.writeCredentials})
 const collectionsHttp=createExecutionCollections({db:env.DB,execution:runtime.execution,connections:runtime.connections,profiles:createModelProfileReader({db:env.DB,policy:foundation.policy}),cursorSecret:platform.auth.configuration.sessionSecret,authenticate})
 return {...runtime,schemas,jobs,connectionHttp,setupHttp,collectionsHttp,http:createExecutionHttp(runtime.execution,request=>foundation.authenticate(request,'http',createUlid()))}
}
