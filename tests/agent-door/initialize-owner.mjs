import assert from 'node:assert/strict'

/** Verification uses the production signed claim and native session projection. */
export default async function initializeOwner({ request, origin, token, claim, displayName, returnTo = '/app' }) {
  assert.equal(claim?.mode, 'signed', 'Cradle requires its real signed owner-claim lifecycle')
  const send = value => request(new URL(claim.path, origin).href, {
    method: 'POST', redirect: 'manual',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ token: value, displayName, returnTo }),
  })
  const raw = await send(token)
  assert.equal(raw.status, 403, 'A raw setup token cannot satisfy the signed claim door')
  await raw.body?.cancel()
  const admitted = await send(claim.token)
  assert.equal(admitted.status, 303, 'The signed claim admits the actual installation owner')
  assert.equal(admitted.redirected, false, 'The original native session response is retained')
  const cookie = admitted.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ')
  assert.ok(cookie, 'Native signed admission returns its session cookie')
  const replay = await send(claim.token)
  assert.equal(replay.status, 409, 'An already admitted signed claim cannot replay')
  await replay.body?.cancel()
  // This ordinary session door invokes the installation coordinator and native
  // owner projection. No database write or verification-only route substitutes it.
  const csrf = await request(new URL('/auth/csrf', origin).href, { headers: { cookie } })
  assert.equal(csrf.status, 200, 'The claimed owner initializes the native product through its session')
  assert.equal(typeof (await csrf.json()).csrfToken, 'string', 'Native owner CSRF is available')
  console.log('Cradle owner bootstrap: raw setup=403 signed claim=303 replay=409 native session=200')
  return admitted
}
