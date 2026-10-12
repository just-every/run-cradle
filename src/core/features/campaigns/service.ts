import { HTTPException } from 'hono/http-exception'

import type { Platform } from '../../platform'
import { createUlid } from '../../shared/ids'
import { createCampaignRepository } from './repository'

export const createCampaignService = (platform: Platform) => {
  const repository = createCampaignRepository(platform.database)

  return {
    list: () => repository.list(),

    async detail(id: string) {
      const campaign = await repository.findDetail(id)
      if (!campaign) throw new HTTPException(404, { message: `Campaign ${id} was not found.` })
      return { campaign, ...(await repository.detailParts(id)) }
    },

    async deliverable(id: string) { const row=await repository.findDeliverable(id); if(!row)throw new HTTPException(404,{message:`Deliverable ${id} was not found.`});return row },
  }
}
