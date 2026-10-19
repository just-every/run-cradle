import { formatWorkspaceMoney } from '../../../shared/workspace-money'
import type { CampaignSummary } from './portfolio-types'

export function CampaignMoneyTotals({ campaigns, currency }: {
  campaigns: readonly Pick<CampaignSummary, 'budgetMinor' | 'spendMinor'>[]
  currency: string
}) {
  if (campaigns.length === 0) return null
  const budget = campaigns.reduce((total, campaign) => total + BigInt(campaign.budgetMinor), 0n)
  const spend = campaigns.reduce((total, campaign) => total + BigInt(campaign.spendMinor), 0n)
  return <section className="cr-card" aria-labelledby="campaign-money-totals-title">
    <h2 id="campaign-money-totals-title">Totals for {campaigns.length} shown {campaigns.length === 1 ? 'campaign' : 'campaigns'}</h2>
    <div className="cr-actions">
      <p>Budget ({currency}): <strong>{formatWorkspaceMoney(budget, currency)}</strong></p>
      <p>Spend ({currency}): <strong>{formatWorkspaceMoney(spend, currency)}</strong></p>
    </div>
  </section>
}
