import assert from 'node:assert/strict'

const disabledMessage = 'AI is disabled; enable a configured provider in settings'
const resourceMessage = 'Failed to load resource: the server responded with a status of 400 (Bad Request)'

export function recordLaunchConsole(page, receipt, width) {
  page.on('console', message => {
    const event = {
      id: receipt.consoleEvents.length,
      width,
      time: Date.now(),
      path: new URL(page.url()).pathname,
      type: message.type(),
      message: message.text(),
      location: message.location(),
    }
    receipt.consoleEvents.push(event)
    if (event.type === 'error') receipt.consoleErrors.push(event)
  })
}

export async function verifyDisabledAiReadout({ page, runtime, receipt, width, action, readout }) {
  const endpoint = `${runtime.origin}/api/v1/commands/launch.analysis.request`
  const lens = await runtime.db.prepare("SELECT id FROM lenses WHERE shipped_key='risks'").first()
  assert.ok(lens, 'The risk readout uses the installed Risks lens')
  const analysisCounts = () => runtime.db.prepare('SELECT (SELECT COUNT(*) FROM launch_analysis_requests) requests,(SELECT COUNT(*) FROM launch_analyses) results').first()
  const beforeReadout = await analysisCounts()
  const requests = [], responses = []
  const onRequest = request => {
    if (request.url() === endpoint) requests.push({ request, time: Date.now() })
  }
  const onResponse = response => {
    if (response.url() === endpoint) responses.push({ response, time: Date.now() })
  }
  // Install the network observers before the ordinary mouse/keyboard action.
  page.on('request', onRequest)
  page.on('response', onResponse)
  try {
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url() === endpoint),
      action(readout),
    ])
    assert.equal(await response.finished(), null, 'The refusal response finishes normally')
    const responseFinishedAt = Date.now()
    assert.equal(requests.length, 1, 'Exactly one analysis request was sent')
    assert.equal(responses.length, 1, 'Exactly one analysis response was received')
    const request = requests[0].request
    assert.equal(response.request(), request, 'The observed response belongs to the observed request')
    assert.equal(request.method(), 'POST')
    const body = request.postDataJSON()
    assert.deepEqual(body.input, { feature: 'risk-readout', lensId: lens.id })
    assert.deepEqual(body.expected, [])
    assert.equal(response.status(), 400)
    const refusal = await response.json()
    assert.equal(refusal.error.code, 'validation')
    assert.equal(refusal.error.message, disabledMessage, 'The server refuses disabled AI, not a schema error')
    assert.doesNotMatch(JSON.stringify(refusal), /schema/i)
    const readoutRefusal = page.getByRole('status').filter({ hasText: disabledMessage })
    await readoutRefusal.waitFor()
    assert.equal(await readoutRefusal.isVisible(), true)
    assert.doesNotMatch(await readoutRefusal.innerText(), /schema/i)
    const afterReadout = await analysisCounts()
    assert.deepEqual(afterReadout, beforeReadout, 'Disabled AI request creates neither an analysis request nor an immutable result')

    // Resource logging can follow response completion. Bound that delivery to
    // one second, and never extend it past this refusal's verified UI state.
    const window = { start: requests[0].time, end: Math.min(Date.now(), responseFinishedAt + 1000) }
    const matching = receipt.consoleErrors.filter(event =>
      event.width === width && event.location.url === endpoint &&
      event.message === resourceMessage && event.time >= window.start && event.time <= window.end)
    assert.equal(matching.length, 1, 'Only one browser resource error accompanies this verified disabled-AI refusal')
    receipt.expectedConsoleErrors.push({
      eventId: matching[0].id, width, reason: 'Verified disabled-AI refusal',
      request: { url: request.url(), method: request.method(), body, time: requests[0].time },
      response: { url: response.url(), status: response.status(), body: refusal, time: responses[0].time, finishedAt: responseFinishedAt },
      window, beforeReadout, afterReadout,
    })
  } finally {
    page.off('request', onRequest)
    page.off('response', onResponse)
  }
}

export function assertNoUnexpectedLaunchConsoleErrors(receipt, widths) {
  assert.deepEqual(receipt.expectedConsoleErrors.map(event => event.width), widths, 'One verified disabled-AI refusal per viewport')
  const expectedIds = new Set(receipt.expectedConsoleErrors.map(event => event.eventId))
  assert.equal(expectedIds.size, receipt.expectedConsoleErrors.length, 'Every expected error identifies a distinct original event')
  receipt.unexpectedConsoleErrors = receipt.consoleErrors.filter(event => !expectedIds.has(event.id))
  assert.deepEqual(receipt.unexpectedConsoleErrors, [], 'No unexpected browser console errors')
}
