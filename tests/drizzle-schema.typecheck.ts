import { eq } from 'drizzle-orm'

import { createDatabase } from '../src/core/platform/database'
import { campaigns, schema } from '../src/core/platform/schema'

declare const database: ReturnType<typeof createDatabase>

const campaignQuery = database
  .select({ id: campaigns.id, launchDate: campaigns.launchDate, ownerId: campaigns.ownerId })
  .from(campaigns)
  .where(eq(campaigns.id, '01ARZ3NDEKTSV4RRFFQ69G5FAA'))

void campaignQuery
void schema.workspaceSettings.aiDailyCeiling
