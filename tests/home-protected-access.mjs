import './helpers/launch-ui-source.mjs'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { contract } from './contract.mjs'

// Render the actual Home and its resource/session hooks. CSS is exercised by
// the unchanged emitted-Worker authority browser suite at both viewport sizes.
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }
    return next(url, context)
  },
})
const { HomePage } = await import('../src/core/features/portfolio/ui/home-page.tsx')
const { DocumentDataContext } = await import('../src/core/app/document-data.tsx')
const { DocumentSession } = await import('../src/core/app/document-context.tsx')
const session = {
  operator: { id: 'owner', name: 'Workspace owner', initials: 'WO', email: 'owner@example.test' },
  workspace: { id: 'workspace', name: 'Records workspace', timezone: 'UTC', currency: 'USD' },
  unreadNotifications: 0, launchInUse: false,
}
const renderHome = async (portfolio, current = session) => {
  const routeTree = createRootRoute({ component: () => h(DocumentSession, { value: current }, h(DocumentDataContext, { value: { '/api/portfolio': portfolio } }, h(HomePage))) })
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return renderToStaticMarkup(h(RouterProvider, { router }))
}

contract('VIEW-004 APP-SCOPE-001 BASE-ACCESS-003', 'Home exposes a protected resource denial independently of the navigation hint and never calls it an empty workspace', async () => {
  for (const launchInUse of [false, true]) {
    const html = await renderHome({
      error: { code: 'forbidden', message: 'Current authority does not permit this action.' },
      // A denied resource cannot render any other payload, including a value
      // from an earlier resource snapshot or a malformed response envelope.
      metrics: { liveCampaigns: 987654321 },
      attention: [{ id: 'protected-record-id', name: 'Protected record name' }],
    }, { ...session, launchInUse })
    assert.match(html, /<h2>This work is outside your access<\/h2>/)
    assert.match(html, /Current authority does not permit this action\./)
    assert.match(html, /href="\/app\/records">Open records<\/a>/)
    assert.doesNotMatch(html, /Your business, organised your way|No records|No data|987654321|protected-record-id|Protected record name|portfolio-metric-grid/)
  }
})

contract('RECORDS-001 RECORDS-005 VIEW-001 VIEW-004', 'An authorized empty Home keeps records template and build steps without Launch content or navigation', async () => {
  const html = await renderHome({
    metrics: { liveCampaigns: 0, needsAttention: 0, openDecisions: 0, portfolioHealth: null, staleHealthCount: 0 },
    attention: [], upcomingMilestones: [], recentActivity: [],
  })
  assert.match(html, /Your business, organised your way/)
  assert.match(html, /Start from a template or build your own tables and fields in Records/)
  assert.match(html, /href="\/app\/records\/\?import=base">Import a base<\/a>/)
  assert.match(html, /href="\/app\/records">Open records<\/a>/)
  assert.doesNotMatch(html, /Launch|Campaign|campaigns|This work is outside your access|portfolio-metric-grid/)
})
