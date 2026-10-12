import './helpers/launch-ui-source.mjs'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contract } from './contract.mjs'
import {readFile} from 'node:fs/promises'
const { RiskDetailPage } = await import('../src/core/features/risks/ui/risk-detail-page.tsx')
const { DocumentDataContext } = await import('../src/core/app/document-data.tsx')

contract('RISK-001 VIEW-002 ACT-003', 'E14 default local Owner appears once with its assigned risk and human date', async () => {
  const manifest=JSON.parse(await readFile('rer-setup.json','utf8'))
  const defaults={name:manifest.fields.find(field=>field.name==='OWNER_NAME').default}
  for (const name of [defaults.name, 'Mira Example']) {
    const risk = {
      id: 'risk-detail', version: 3, title: 'Supplier delay', severity: 'Critical', state: 'Watching',
      owner: { id: 'assigned-owner', name, initials: name === defaults.name ? 'O' : 'ME' },
      dueDate: '2026-10-20', signal: 'Parts are late', mitigation: 'Review supplier',
      campaign: { id: 'assigned-campaign', name: 'October launch', code: 'OCT', launchDate: '2026-10-25' },
      resolvedAt: null, resolutionNote: null, linkedDecision: null,
    }
    const before = structuredClone(risk)
    const html = renderToStaticMarkup(createElement(DocumentDataContext.Provider,
      { value: { '/api/risks/risk-detail': { risk } } }, createElement(RiskDetailPage, { riskId: risk.id })))
    assert.ok(html.includes(`Owned by ${name} · Due Oct 20, 2026`))
    assert.equal(html.split(name).length - 1, 1, 'The assigned owner name is displayed exactly once')
    assert.doesNotMatch(html, /Owner Owner|2026-10-20/)
    for (const value of [risk.title, risk.severity, risk.state, risk.signal, risk.mitigation, risk.campaign.code]) assert.ok(html.includes(value))
    assert.match(html, /href="\/app\/campaigns\/assigned-campaign"/)
    assert.ok(html.includes('Back to October launch'))
    assert.ok(html.includes('Escalate this risk'))
    assert.deepEqual(risk, before, 'Rendering preserves the assigned owner identity and every record field')
  }
})
