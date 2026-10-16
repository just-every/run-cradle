import type { RequestContext } from '../domains/authority/ports'
import type { createLaunchFoundation } from '../core/app/composition/launch.server'
import type { PlatformBindings } from '../core/platform/bindings'
import { LAUNCH_APP_ID, launchEntities } from '../apps/launch/contracts'
import { createUlid } from '../core/shared/ids'

/** Use the same command as a workspace member so the activity has real provenance. */
export async function seedActivity(db: PlatformBindings['DB'], foundation: Awaited<ReturnType<typeof createLaunchFoundation>>, ctx: RequestContext) {
  if (await db.prepare('SELECT 1 FROM activity_entries LIMIT 1').first()) return
  const campaigns = await db.prepare('SELECT id,version,name,status_summary FROM campaigns ORDER BY name LIMIT 3').all<{ id: string; version: number; name: string; status_summary: string }>()
  for (const campaign of campaigns.results) {
    const receipt = await foundation.commands.get('launch.campaign.patch')!.execute(ctx, {
      commandId: createUlid(),
      expected: [{ ref: { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: campaign.id }, version: campaign.version }],
      input: { id: campaign.id, changes: { statusSummary: campaign.status_summary + ' Reviewed with the launch team.' } },
    })
    if (receipt.result.state !== 'committed') throw new Error('Demo campaign activity did not commit')
  }
}
