import assert from 'node:assert/strict'

export const recordCalendarScopes = ['https://www.googleapis.com/auth/calendar.events.owned', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly']
const copy = value => structuredClone(value)
const operationFor = method => method === 'POST' ? 'create' : method === 'DELETE' ? 'cancel' : 'move'
const operations = new Set(['create', 'move', 'cancel'])
const keyFor = (calendarId, eventId) => `${calendarId}:${eventId}`
const response = (body, status = 200, headers = {}) => Response.json(body, {status, headers})
const error = (status, reason) => response({error: {code: status, message: `synthetic-cradle-${reason}`, errors: [{reason}]}}, status)

/** Stateful Google network edge. It applies only requests the real adapter sends, with no upstream fetch. */
export function recordCalendarProvider() {
  const ownedCalendarId = 'synthetic-cradle-calendar-owned', foreignCalendarId = 'synthetic-cradle-calendar-foreign'
  const calendars = new Map([
    [ownedCalendarId, {id: ownedCalendarId, summary: 'Synthetic Cradle owned calendar', accessRole: 'owner', primary: true, timeZone: 'UTC'}],
    [foreignCalendarId, {id: foreignCalendarId, summary: 'Synthetic Cradle foreign calendar', accessRole: 'reader', primary: false, timeZone: 'UTC'}],
  ])
  const events = new Map(), seen = [], reads = [], writes = [], denied = new Set()
  const lostAcknowledgements = new Set(), rateLimits = new Set()
  let revision = 0
  const nextEtag = () => `"synthetic-cradle-event-${++revision}"`
  function existing(calendarId, eventId) {
    const event = events.get(keyFor(calendarId, eventId))
    assert.ok(event, `Unknown synthetic event ${calendarId}/${eventId}`)
    return event
  }
  function changed(calendarId, eventId, patch) {
    const prior = existing(calendarId, eventId), event = {...copy(prior), ...copy(patch), id: eventId, etag: nextEtag()}
    events.set(keyFor(calendarId, eventId), event)
    return copy(event)
  }
  function once(target, operation) {assert.ok(operations.has(operation)); target.add(operation)}
  return {
    ownedCalendarId, foreignCalendarId, calendars, events, seen, reads, writes, denied,
    key: keyFor,
    deny(calendarId) {denied.add(calendarId)},
    allow(calendarId) {denied.delete(calendarId)},
    loseAckOnce(operation = 'create') {once(lostAcknowledgements, operation)},
    rateLimitOnce(operation = 'create') {once(rateLimits, operation)},
    externalEdit(calendarId, eventId, patch) {return changed(calendarId, eventId, patch)},
    externalDelete(calendarId, eventId) {return changed(calendarId, eventId, {status: 'cancelled'})},
    async fetch(request) {
      const url = new URL(request.url), method = request.method.toUpperCase()
      const log = {method, url: url.toString(), headers: Object.fromEntries(request.headers), calendarId: null, eventId: null, body: null, applied: false, outcome: null}
      seen.push(log)
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token' && method === 'POST') {
        const form = new URLSearchParams(await request.text()), grant = form.get('grant_type')
        assert.ok(['authorization_code', 'refresh_token'].includes(grant))
        if (grant === 'authorization_code') assert.match(form.get('code') ?? '', /^synthetic-cradle-code-/)
        else assert.match(form.get('refresh_token') ?? '', /^synthetic-cradle-refresh-/)
        log.outcome = 200
        return response({access_token: 'synthetic-cradle-access-1', refresh_token: 'synthetic-cradle-refresh-1', token_type: 'bearer', expires_in: 3600, scope: recordCalendarScopes.join(' ')})
      }
      if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/revoke' && method === 'POST') {
        log.outcome = 200
        return new Response(null, {status: 200})
      }
      assert.equal(url.hostname, 'www.googleapis.com', 'Unexpected calendar provider host')
      assert.match(request.headers.get('authorization') ?? '', /^Bearer synthetic-cradle-access-/)
      const listPath = '/calendar/v3/users/me/calendarList'
      if (url.pathname === listPath && method === 'GET') {
        reads.push(log); log.outcome = 200
        const minimum = url.searchParams.get('minAccessRole'), levels = ['freeBusyReader', 'reader', 'writer', 'owner']
        const items = [...calendars.values()].filter(calendar => !denied.has(calendar.id) && (!minimum || levels.indexOf(calendar.accessRole) >= levels.indexOf(minimum)))
        return response({kind: 'calendar#calendarList', items: copy(items)})
      }
      const listEntry = /^\/calendar\/v3\/users\/me\/calendarList\/([^/]+)$/.exec(url.pathname)
      const calendar = /^\/calendar\/v3\/calendars\/([^/]+)(?:\/events(?:\/([^/]+))?)?$/.exec(url.pathname)
      assert.ok(listEntry || calendar, `Unhandled calendar provider route ${method} ${url.pathname}`)
      const calendarId = decodeURIComponent((listEntry ?? calendar)[1]), eventId = calendar?.[2] ? decodeURIComponent(calendar[2]) : null
      log.calendarId = calendarId; log.eventId = eventId
      const isRead = method === 'GET'; (isRead ? reads : writes).push(log)
      if (!isRead) log.body = request.body ? await request.json() : null
      const calendarInfo = calendars.get(calendarId)
      if (denied.has(calendarId)) {log.outcome = 403; return error(403, 'forbidden')}
      if (!calendarInfo) {log.outcome = 404; return error(404, 'notFound')}
      if (listEntry || !url.pathname.includes('/events')) {
        assert.equal(method, 'GET', 'Calendar metadata is read only')
        log.outcome = 200
        return response(copy(calendarInfo))
      }
      if (isRead && !eventId) {
        const markers = url.searchParams.getAll('privateExtendedProperty'), showDeleted = url.searchParams.get('showDeleted') === 'true'
        const items = [...events.entries()].filter(([key, event]) => key.startsWith(calendarId + ':') && (showDeleted || event.status !== 'cancelled') && markers.every(marker => {
          const equals = marker.indexOf('='); return equals > 0 && event.extendedProperties?.private?.[marker.slice(0, equals)] === marker.slice(equals + 1)
        })).map(([, event]) => copy(event))
        log.outcome = 200
        return response({kind: 'calendar#events', summary: calendarInfo.summary, timeZone: 'UTC', items})
      }
      if (isRead) {
        const event = events.get(keyFor(calendarId, eventId)); log.outcome = event ? 200 : 404
        return event ? response(copy(event)) : error(404, 'notFound')
      }
      assert.ok(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method), `Unhandled event method ${method}`)
      assert.ok(method === 'POST' ? !eventId : eventId, 'Event route does not match its operation')
      if (calendarInfo.accessRole !== 'owner') {log.outcome = 403; return error(403, 'forbidden')}
      const operation = operationFor(method)
      if (rateLimits.delete(operation)) {log.outcome = 429; return response({error: {code: 429, message: 'synthetic-cradle-rate-limit'}}, 429, {'retry-after': '0'})}
      const body = log.body, id = eventId ?? body?.id
      assert.ok(typeof id === 'string' && id.length > 0, 'Event ID must come from the adapter')
      log.eventId = id
      const key = keyFor(calendarId, id), prior = events.get(key)
      if (operation === 'create' && prior) {log.outcome = 409; return error(409, 'duplicate')}
      if (operation !== 'create' && (!prior || prior.status === 'cancelled')) {log.outcome = 404; return error(404, 'notFound')}
      if (request.headers.has('if-match') && request.headers.get('if-match') !== prior?.etag) {log.outcome = 412; return error(412, 'conditionNotMet')}
      let event
      if (operation === 'cancel') event = {...copy(prior), status: 'cancelled', etag: nextEtag()}
      else {
        assert.equal(body.id, id)
        assert.equal(typeof body.summary, 'string'); assert.equal(typeof body.description, 'string')
        assert.ok(body.start?.date || body.start?.dateTime); assert.ok(body.end?.date || body.end?.dateTime)
        for (const field of ['cradleRecord', 'cradleDefinition', 'cradleHash']) assert.equal(typeof body.extendedProperties?.private?.[field], 'string')
        event = {...(method === 'PATCH' ? copy(prior) : {}), ...copy(body), id, etag: nextEtag(), status: 'confirmed'}
      }
      events.set(key, event); log.applied = true
      if (lostAcknowledgements.delete(operation)) {log.outcome = 'acknowledgement-lost'; throw new Error('synthetic-cradle-acknowledgement-lost')}
      log.outcome = operation === 'cancel' ? 204 : operation === 'create' ? 201 : 200
      return operation === 'cancel' ? new Response(null, {status: 204}) : response(copy(event), log.outcome)
    },
  }
}
