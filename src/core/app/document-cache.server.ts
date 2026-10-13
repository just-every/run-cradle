/**
 * Start documents carry `no-transform` in Cache-Control, keeping their other directives, so no proxy rewrites the HTML
 * React hydrates (Cloudflare's email address obfuscation; src/base/hydration/README.md). Other responses pass unchanged.
 */
export function noTransformDocument(response: Response): Response {
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  const kept = (response.headers.get('cache-control') ?? '').split(',').map(directive => directive.trim()).filter(directive => directive && directive.toLowerCase() !== 'no-transform')
  const headers = new Headers(response.headers)
  headers.set('cache-control', [...kept, 'no-transform'].join(', '))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
