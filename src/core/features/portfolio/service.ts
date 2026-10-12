import { readActivityMessage } from '../../../apps/launch/activity-message'
import type { Platform } from '../../platform'
import { toInitials } from '../../shared/people'
import { createCampaignService } from '../campaigns/service'
import { createPortfolioRepository } from './repository'

export const createPortfolioService = (platform: Platform) => {
  const campaigns = createCampaignService(platform)
  const repository = createPortfolioRepository(platform.database)

  return {
    async get() {
      const [metrics, allCampaigns, upcomingMilestones, recentActivity] = await Promise.all([
        repository.metrics(), campaigns.list(), repository.upcomingMilestones(), repository.recentActivity(),
      ])
      if (!metrics) throw new Error('Portfolio metrics query returned no result.')
      return {
        attention: allCampaigns.filter((campaign) => campaign.status === 'At risk' || campaign.status === 'Blocked'),
        metrics: {
          liveCampaigns: metrics.liveCampaigns,
          needsAttention: metrics.needsAttention,
          openDecisions: metrics.openDecisions,
          portfolioHealth: metrics.healthCount ? Math.round((metrics.healthSum ?? 0) / metrics.healthCount) : null,
          staleHealthCount: metrics.staleHealthCount,
        },
        recentActivity: recentActivity.map((entry) => ({
          id: entry.id,
          type:entry.type, subjectId:entry.subjectId, subjectTitle:entry.subjectTitle, fieldName:entry.fieldName, previousValue:entry.previousValue, nextValue:entry.nextValue, actionId:readActivityMessage(entry.message).actionId,
          description: readActivityMessage(entry.message).message || entry.type,
          occurredAt: entry.createdAt,
          actor: entry.actorId && entry.actorName ? {
            id: entry.actorId,
            initials: toInitials(entry.actorName),
            name: entry.actorName,
          } : null,
        })),
        upcomingMilestones: upcomingMilestones.map((milestone) => ({
          id: milestone.id,
          title: milestone.title,
          owner: {
            id: milestone.ownerId,
            initials: toInitials(milestone.ownerName),
            name: milestone.ownerName,
          },
          type: milestone.type,
          status: milestone.status,
          startDate: milestone.startDate,
          endDate: milestone.endDate,
          overdue: milestone.status !== 'Complete' && milestone.startDate < new Date().toISOString().slice(0, 10),
          dependencyConflict: milestone.conflictReason !== null,
          version: milestone.version,
        })),
      }
    },
  }
}
