import { DurableObject } from 'cloudflare:workers'
import {restoreOwner} from './restored-owner.server'
import type { PlatformBindings } from './bindings'
import { prepareLaunchSetup } from '../../apps/launch/setup.server'

/** One durable coordinator completes the first owner's product initialization.
 * Base has already admitted the owner; this binding is never a public route. */
export class InstallationCoordinator extends DurableObject<PlatformBindings> {
  async fetch(request: Request) {
    const { operatorId } = await request.json() as { operatorId: string }
    return this.ctx.blockConcurrencyWhile(async () => {
      const owner = await this.env.DB.prepare(`SELECT p.id FROM cradle_base_operators m JOIN oa_operators o ON o.id=m.base_id
        JOIN authority_principals p ON p.id=m.principal_id WHERE o.id=? AND o.status='active' AND p.state='active' AND p.initial_owner=1`)
        .bind(operatorId).first<{id:string}>()
      if (!owner) return new Response('Current first owner required', {status:403})
      const archive=await this.env.DB.prepare('SELECT source_owner_id FROM cradle_restore WHERE singleton=1').first<{source_owner_id:string|null}>()
      await restoreOwner(this.env.DB,operatorId,owner.id)
      if (!await this.ctx.storage.get('initialized')) {
        const now=Date.now()
        const name=this.env.WORKSPACE_NAME?.trim()||'Cradle records',timezone=this.env.WORKSPACE_TIMEZONE||'UTC',currency=this.env.WORKSPACE_CURRENCY||'USD'
        // Configuration that names the workspace (rer setup, Managed hosting) already holds the
        // owner's answers; /setup asks only when the installation left them unset.
        const configured=[this.env.WORKSPACE_NAME,this.env.WORKSPACE_TIMEZONE,this.env.WORKSPACE_CURRENCY].every(value=>value?.trim())
        new Intl.DateTimeFormat('en',{timeZone:timezone})
        if(name.length>200||!/^\p{Lu}{3}$/u.test(currency))throw new Error('Workspace name, timezone and currency must be valid.')
        await this.env.DB.batch([
          this.env.DB.prepare(`INSERT OR IGNORE INTO workspace(id,created_at,updated_at,name,timezone,currency,version) VALUES('workspace',?,?,?,?,?,1)`).bind(now,now,name,timezone,currency),
          this.env.DB.prepare(`INSERT OR IGNORE INTO workspace_settings(id,created_at,updated_at,version,workspace_name,timezone,currency,quiet_hours_start,quiet_hours_end) SELECT 'workspace-settings',?,?,1,name,timezone,currency,'18:00','08:00' FROM workspace WHERE id='workspace'`).bind(now,now),
          ...configured?[this.env.DB.prepare('UPDATE cradle_first_run SET completed_at=? WHERE singleton=1 AND completed_at IS NULL').bind(now)]:[],
        ])
        if(!archive?.source_owner_id)await this.env.DB.batch(await prepareLaunchSetup(this.env.DB,owner.id))
        await this.ctx.storage.put('initialized',true)
      }
      return new Response(null,{status:204})
    })
  }
}
