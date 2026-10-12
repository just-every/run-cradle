import type { Platform } from '../../core/platform'
import type { Json,CommandInput } from '../../contracts/primitives'
import { HTTPException } from 'hono/http-exception'
import { createUlid } from '../../core/shared/ids'
import { LAUNCH_APP_ID,launchEntities,type LaunchAction } from './contracts'
import type { LaunchKind } from './descriptors.server'
export interface LegacyLaunchExecutor {execute(request:Request,action:LaunchAction,input:CommandInput<unknown>):Promise<Json>}
const executors=new WeakMap<Platform,LegacyLaunchExecutor>()
export function mountLegacyLaunch(platform:Platform,executor:LegacyLaunchExecutor){if(executors.has(platform))throw new Error('Launch already mounted');executors.set(platform,executor)}
export function executeLegacy(platform:Platform,request:Request,action:LaunchAction,input:unknown,record?:{kind:LaunchKind;id:string;version:number}){
 const executor=executors.get(platform);if(!executor)throw new HTTPException(503,{message:'Launch atomic admission executor is not mounted'})
 return executor.execute(request,action,{commandId:createUlid(),expected:record?[{ref:{appId:LAUNCH_APP_ID,entityId:launchEntities[record.kind],recordId:record.id},version:record.version}]:[],input})
}
