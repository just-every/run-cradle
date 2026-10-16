import type {LaunchContext,ChangeSet} from './domain.server'
import type {Json} from '../../contracts/primitives'
import {trustedPredicate} from '../../domains/admission/sql.server'
/** The event carries the definitions that were enabled when its mutation committed. */
export async function captureAutomationEventState(context:LaunchContext,set:ChangeSet){
 if(!set.events.length)return
 const definitions=(await context.db.prepare("SELECT id,version,definition_version,enabled,shipped_key FROM automations WHERE trigger_type='event' ORDER BY id").all<{id:string;version:number;definition_version:number;enabled:number;shipped_key:string|null}>()).results
 const settings=await context.db.prepare('SELECT version,ai_enabled FROM workspace_settings LIMIT 1').first<{version:number;ai_enabled:number}>()
 const eligible=Object.fromEntries(definitions.filter(d=>d.enabled&&(d.shipped_key!=='campaign-brief'||settings?.ai_enabled)).map(d=>[d.id,d.definition_version]))
 for(const event of set.events)event.payload={...event.payload as Record<string,Json>,launchAutomationDefinitions:eligible}
 for(const d of definitions)set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM automations WHERE id=? AND version=?)',[d.id,d.version]))
 if(settings)set.guards.push(trustedPredicate('EXISTS(SELECT 1 FROM workspace_settings WHERE version=?)',[settings.version]))
}
