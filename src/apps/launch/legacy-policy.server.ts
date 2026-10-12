import { LAUNCH_APP_ID, launchEntities, launchInputs } from './contracts'
import { launchFieldIds, type LaunchKind } from './descriptors.server'

/** The retained application's closed policy surface. This is not a provider grant. */
export function legacyLaunchSurface(entityId:string) {
 const kind=Object.entries(launchEntities).find(([,id])=>id===entityId)?.[0] as LaunchKind|undefined
 if(!kind)return null
 const actions=Object.keys(launchInputs).filter(a=>(a.split('.')[0]==='custom-field'?'customField':a.split('.')[0])===kind||a.startsWith('bulk.')||a.startsWith('samples.')||a==='analysis.request').map(a=>'launch.'+a)
 if(kind==='campaign')actions.push('launch.comment.create')
 if(['campaign','deliverable','milestone'].includes(kind))actions.push('import.preview','import.commit','import.delete')
 const purposes:('read'|'export'|'provider_context')[]=['read']
 if(['campaign','deliverable','milestone','risk','decision'].includes(kind))purposes.push('export','provider_context')
 if(kind==='lens')purposes.push('provider_context')
 if(purposes.includes('provider_context'))actions.push('evidence.context')
 return {appId:LAUNCH_APP_ID,fields:Object.values(launchFieldIds[kind]),actions,purposes}
}
