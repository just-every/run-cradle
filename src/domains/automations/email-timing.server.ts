import { deliveryTime } from '../channels/clock'

/** Record automation mail follows the workspace clock, including DST boundaries. */
export async function automationEmailDue(db:D1Database,at:number):Promise<number> {
 const settings=await db.prepare('SELECT timezone,quiet_hours_start,quiet_hours_end FROM workspace_settings ORDER BY id LIMIT 1')
  .first<{timezone:string;quiet_hours_start:string;quiet_hours_end:string}>()
 if(!settings)throw new Error('Workspace email timing settings are required')
 return deliveryTime(at,settings.timezone,settings.quiet_hours_start,settings.quiet_hours_end)
}
