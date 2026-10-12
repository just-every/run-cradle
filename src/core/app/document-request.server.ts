/** Document loaders select finite API paths. Keep the original admission context
 * for the API's independent authentication, including the actual Host and any
 * origin/forwarding headers; never manufacture loopback evidence from the URL.
 */
export function createDocumentResourceRequest(request: Request, path: string): Request {
  const url = new URL(path, request.url)
  if (!path.startsWith('/api/') || !url.pathname.startsWith('/api/') || url.origin !== new URL(request.url).origin) {
    throw new Error('Document resources require a same-origin API path.')
  }
  return new Request(url, { headers: request.headers, signal: request.signal, redirect: 'manual' })
}
