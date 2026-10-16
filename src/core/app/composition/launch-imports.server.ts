import type { Platform } from '../../platform'
import type { ServerFoundation } from '../foundation.server'
import type { createRecordsComposition } from './records.server'
import { createLaunchImportHttp } from '../../../apps/launch/import-http.server'
import { launchSourceRelease } from '../../../apps/launch/source-release.server'
import { createChannelsIntegration } from '../../../domains/channels/integration.server'
import { campaignErasure } from '../../../domains/lifecycle/campaigns.server'
import { createFileService } from '../../../domains/evidence/files.server'

/** Launch CSV imports use the same launch domain context as the registered launch commands. */
export function createLaunchImportComposition(platform: Platform, foundation: ServerFoundation, records: ReturnType<typeof createRecordsComposition>) {
 const db = platform.bindings.DB, files = createFileService(records.deps)
 const context = { db, policy: foundation.policy, releaseId: launchSourceRelease(platform.bindings.INSTALLATION_RELEASE_ID), integration: { ...createChannelsIntegration(db), deleteCampaign: (ctx: Parameters<typeof campaignErasure>[1], id: string) => campaignErasure(db, ctx, id) } }
 return createLaunchImportHttp({ db, bucket: platform.bindings.FILES, policy: foundation.policy, admission: foundation.admission, context, authenticate: foundation.authenticate, download: (ctx, id) => files.download(ctx, id) })
}
