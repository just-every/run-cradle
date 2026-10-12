import assert from 'node:assert/strict'

// Observe the actual export route as well as the browser download. Failed HTTP
// responses must be reported at this public door, not as a later file timeout.
export async function downloadBase(page, buttonName, action = target => target.click()) {
 const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/records/base-export' && response.request().method() === 'POST')
  .then(async response => {
   const body = await response.json()
   assert.equal(response.status(), 200, 'Base export HTTP status; error code: ' + String(body?.error?.code ?? 'none') + '; ' + String(body?.error?.message ?? ''))
   assert.ok(body.data && typeof body.data.content === 'string', 'Base export returns actual encoded file content')
  })
 const download = page.waitForEvent('download')
 const [, file] = await Promise.all([response, download, action(page.getByRole('button', {name: buttonName, exact: true}))])
 return file
}
