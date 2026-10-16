import type { Json } from '../contracts/primitives'
import type { ProviderResult } from '../adapters/contracts'

/** Demo-only analysis of the authorized records; no model request leaves the demo. */
export async function demoAnalysis(real: () => Promise<ProviderResult>, text: string, id: string): Promise<ProviderResult> {
  const { demoEffect } = await import('../../vendor/base/modules/demo/index.mjs')
  return demoEffect(real, () => {
    const source = JSON.parse(text)
    const campaign = source.campaign
    const risks = source.risks ?? source.risk ?? []
    const deliverables = source.deliverable ?? []
    const content = campaign
      ? `${campaign.name} — launch brief\n\n${campaign.objective || 'Bring the team together around the next launch.'}\n\n${deliverables.length} deliverables are tracked, with ${risks.length} open risks. Confirm owners and dates for remaining work before the next readiness review.\n\nSource: ${campaign.id}, version ${campaign.version}.`
      : risks.length
        ? `Risk readout\n\n${risks.map((risk: Record<string, unknown>) => `${risk.name ?? risk.title ?? risk.description} (${risk.id}, version ${risk.version})`).join('\n')}\n\nReview mitigation owners and resolve the highest-impact open items before launch.`
        : 'Launch readiness\n\nUse a focused view to review open risks with your team. Confirm each mitigation has an owner and a next step.'
    const proposedLens = source.feature === 'lens-proposal' ? { name: 'Open launch risks', description: 'Open risks to review at the next launch check-in.', recordType: 'Risk', conditions: [{field:'state',operator:'not equals',value:'Resolved'}], sort: {field:'severity',direction:'desc'}, fields:['severity','state','owner','dueDate','signal','mitigation','campaign'], display:'Cards' } : null
    return { state: 'confirmed', externalId: id, requestId: id, receiptHash: id,
      value: { model: 'demo-analysis', usage: { inputTokens: 0, outputTokens: 0 }, output: { content, proposedLens } } as Json }
  })
}
