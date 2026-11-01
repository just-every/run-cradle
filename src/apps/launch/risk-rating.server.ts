import type { SqlPredicate } from '../../domains/admission/ports'
import type { PolicyScope } from '../../domains/authority/ports'
import { launchFieldIds } from './descriptors.server'
import type { LaunchCampaign } from './contracts'

export type RiskRating = LaunchCampaign['riskRating']

/** CAMP-012: the highest severity among a campaign's open (not Resolved) risks,
 * or None. Every surface that lists campaigns selects this one expression, so
 * the Campaign Grid, detail, Portfolio Overview, lenses and search agree. */
export const riskRatingSql = (campaignId: string) => `COALESCE((SELECT rating_source.severity FROM risks rating_source WHERE rating_source.campaign_id=${campaignId} AND rating_source.state<>'Resolved' ORDER BY CASE rating_source.severity WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,rating_source.id LIMIT 1),'None')`

const ratingInputs = ['campaignId', 'severity', 'state'].map(name => launchFieldIds.risk[name]!)

/** A rating discloses the severities of a campaign's open risks. Records surfaces
 * (global search) project it only for a reader whose current risk scope reads
 * every risk row with its campaign, severity and state; any narrower scope gets
 * no rating rather than one computed from risks it cannot see. */
export async function projectCampaignRiskRatings(db: D1Database, riskScope: () => Promise<PolicyScope>, campaignIds: readonly string[]) {
 const ratings = new Map<string, RiskRating>(), guards: SqlPredicate[] = []
 if (!campaignIds.length) return { ratings, guards }
 const scope = await riskScope().catch((error: unknown) => {
  if (error instanceof Error && 'code' in error && error.code === 'forbidden') return null
  throw error
 })
 if (!scope?.unrestrictedRows || ratingInputs.some(id => !scope.readableFieldIds.includes(id))) return { ratings, guards }
 guards.push(...scope.currentAuthorityGuards)
 const rows = (await db.prepare(`SELECT c.id,${riskRatingSql('c.id')} AS rating FROM campaigns c WHERE c.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(campaignIds)).all<{ id: string; rating: RiskRating }>()).results
 for (const row of rows) ratings.set(row.id, row.rating)
 return { ratings, guards }
}
