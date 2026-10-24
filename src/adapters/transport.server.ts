import type { ProviderResult } from './contracts';
import { base64, sha256 } from './crypto.server';
export type Endpoint = 'outlook.calendars' | 'outlook.list' | 'outlook.get' | 'outlook.insert' | 'outlook.update' | 'outlook.delete' | 'drive.root' | 'graph.drive' | 'box.account' | 'box.file' | 'dropbox.metadata' | 'sheets.read' | 'resend.send' | 'resend.read' | 'gmail.profile' | 'gmail.list' | 'gmail.message' | 'calendar.list' | 'calendar.update' | 'calendar.calendars' | 'calendar.insert' | 'calendar.get' | 'calendar.delete' | 'xero.create' | 'xero.read' | 'xero.search' | 'xero.connections' | 'openai.responses' | 'google.token' | 'google.revoke' | 'xero.token' | 'xero.revoke' | 'drive.files' | 'drive.file' | 'drive.thumbnail' | 'graph.children' | 'graph.search' | 'graph.item' | 'graph.thumbnail' | 'dropbox.list' | 'dropbox.continue' | 'dropbox.search' | 'dropbox.thumbnail' | 'box.items' | 'box.search' | 'box.thumbnail' | 'microsoft.token' | 'dropbox.token' | 'dropbox.revoke' | 'box.token' | 'box.revoke';
const segment = (s: string) => { if (!s || s.length > 1024 || /[\x00-\x1f]/.test(s)) throw new Error('Invalid provider identifier'); return encodeURIComponent(s); };
const thumbnailHosts: Record<'drive.thumbnail' | 'graph.thumbnail', (host: string) => boolean> = {
  'drive.thumbnail': host => host.endsWith('.googleusercontent.com') || host === 'drive.google.com',
  'graph.thumbnail': host => ['.sharepoint.com', '.1drv.com', '.files.1drv.com'].some(s => host.endsWith(s)) || host === 'graph.microsoft.com' || host === 'onedrive.live.com',
};
/** A thumbnail URL comes from the provider's own metadata; only that provider's image hosts are fetched. */
function thumbnailUrl(name: 'drive.thumbnail' | 'graph.thumbnail', value: string) { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || !thumbnailHosts[name](url.hostname.toLowerCase())) throw new Error('Invalid provider identifier'); return url.toString(); }
const odata = (s: string) => segment(s.replaceAll("'", "''"));
export function endpoint(name: Endpoint, ids: string[] = []): { url: string; method: string } {
  const a = () => segment(ids[0] ?? ''); const b = () => segment(ids[1] ?? '');
  switch (name) {
    case 'sheets.read': return {url:`https://sheets.googleapis.com/v4/spreadsheets/${a()}`,method:'GET'};
    case 'resend.send': return { url: 'https://api.resend.com/emails', method: 'POST' };
    case 'resend.read': return { url: `https://api.resend.com/emails/${a()}`, method: 'GET' };
    case 'gmail.profile': return { url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile', method: 'GET' };
    case 'gmail.list': return { url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages', method: 'GET' };
    case 'gmail.message': return { url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${a()}`, method: 'GET' };
    case 'outlook.calendars': return {url:'https://graph.microsoft.com/v1.0/me/calendars',method:'GET'};
    case 'outlook.list': return {url:`https://graph.microsoft.com/v1.0/me/calendars/${a()}/events`,method:'GET'};
    case 'outlook.get': return {url:`https://graph.microsoft.com/v1.0/me/calendars/${a()}/events/${b()}`,method:'GET'};
    case 'outlook.insert': return {url:`https://graph.microsoft.com/v1.0/me/calendars/${a()}/events`,method:'POST'};
    case 'outlook.update': return {url:`https://graph.microsoft.com/v1.0/me/calendars/${a()}/events/${b()}`,method:'PATCH'};
    case 'outlook.delete': return {url:`https://graph.microsoft.com/v1.0/me/calendars/${a()}/events/${b()}`,method:'DELETE'};
    case 'calendar.calendars': return {url:'https://www.googleapis.com/calendar/v3/users/me/calendarList',method:'GET'};
    case 'calendar.update': return {url:`https://www.googleapis.com/calendar/v3/calendars/${a()}/events/${b()}`,method:'PUT'};
    case 'calendar.list': return { url: `https://www.googleapis.com/calendar/v3/calendars/${a()}/events`, method: 'GET' };
    case 'calendar.insert': return { url: `https://www.googleapis.com/calendar/v3/calendars/${a()}/events`, method: 'POST' };
    case 'calendar.get': return { url: `https://www.googleapis.com/calendar/v3/calendars/${a()}/events/${b()}`, method: 'GET' };
    case 'calendar.delete': return { url: `https://www.googleapis.com/calendar/v3/calendars/${a()}/events/${b()}`, method: 'DELETE' };
    case 'xero.create': return { url: 'https://api.xero.com/api.xro/2.0/Invoices', method: 'POST' };
    case 'xero.read': return { url: `https://api.xero.com/api.xro/2.0/Invoices/${a()}`, method: 'GET' };
    case 'xero.search': return { url: 'https://api.xero.com/api.xro/2.0/Invoices', method: 'GET' };
    case 'xero.connections': return { url: 'https://api.xero.com/connections', method: 'GET' };
    case 'openai.responses': return { url: 'https://api.openai.com/v1/responses', method: 'POST' };
    case 'google.token': return { url: 'https://oauth2.googleapis.com/token', method: 'POST' };
    case 'google.revoke': return { url: 'https://oauth2.googleapis.com/revoke', method: 'POST' };
    case 'xero.token': return { url: 'https://identity.xero.com/connect/token', method: 'POST' };
    case 'xero.revoke': return { url: 'https://identity.xero.com/connect/revocation', method: 'POST' };
    case 'drive.root': return {url:'https://www.googleapis.com/drive/v3/files/root?fields=id',method:'GET'};
    case 'graph.drive': return {url:'https://graph.microsoft.com/v1.0/me/drive',method:'GET'};
    case 'box.account': return {url:'https://api.box.com/2.0/users/me?fields=id',method:'GET'};
    case 'drive.files': return { url: 'https://www.googleapis.com/drive/v3/files', method: 'GET' };
    case 'drive.file': return { url: `https://www.googleapis.com/drive/v3/files/${a()}`, method: 'GET' };
    case 'drive.thumbnail': return { url: thumbnailUrl(name, ids[0] ?? ''), method: 'GET' };
    case 'graph.children': return { url: 'https://graph.microsoft.com/v1.0/me/drive/root/children', method: 'GET' };
    case 'graph.search': return { url: `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${odata(ids[0] ?? '')}')`, method: 'GET' };
    case 'graph.item': return { url: `https://graph.microsoft.com/v1.0/me/drive/items/${a()}`, method: 'GET' };
    case 'graph.thumbnail': return { url: thumbnailUrl(name, ids[0] ?? ''), method: 'GET' };
    case 'dropbox.metadata': return { url: 'https://api.dropboxapi.com/2/files/get_metadata', method: 'POST' };
    case 'dropbox.list': return { url: 'https://api.dropboxapi.com/2/files/list_folder', method: 'POST' };
    case 'dropbox.continue': return { url: 'https://api.dropboxapi.com/2/files/list_folder/continue', method: 'POST' };
    case 'dropbox.search': return { url: 'https://api.dropboxapi.com/2/files/search_v2', method: 'POST' };
    case 'dropbox.thumbnail': return { url: 'https://content.dropboxapi.com/2/files/get_thumbnail_v2', method: 'POST' };
    case 'box.file': return { url: `https://api.box.com/2.0/files/${a()}`, method: 'GET' };
    case 'box.items': return { url: 'https://api.box.com/2.0/folders/0/items', method: 'GET' };
    case 'box.search': return { url: 'https://api.box.com/2.0/search', method: 'GET' };
    case 'box.thumbnail': return { url: `https://api.box.com/2.0/files/${a()}/thumbnail.png`, method: 'GET' };
    case 'microsoft.token': return { url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', method: 'POST' };
    case 'dropbox.token': return { url: 'https://api.dropboxapi.com/oauth2/token', method: 'POST' };
    case 'dropbox.revoke': return { url: 'https://api.dropboxapi.com/2/auth/token/revoke', method: 'POST' };
    case 'box.token': return { url: 'https://api.box.com/oauth2/token', method: 'POST' };
    case 'box.revoke': return { url: 'https://api.box.com/oauth2/revoke', method: 'POST' };
  }
}
export class TransportError extends Error { constructor(readonly code: string) { super(code); } }
export type WireResponse = { status: number; body: unknown; hash: string; requestId: string | null; retryAfter: string | null };
export class ProviderTransport {
  constructor(private readonly send: typeof fetch = fetch, private readonly now = Date.now) {}
  async request(name: Endpoint, args: { ids?: string[]; query?: URLSearchParams; headers: Record<string, string>; body?: unknown; form?: URLSearchParams; deadline: string; maxBytes?: number; maxRequestBytes?: number; binary?: boolean }): Promise<WireResponse> {
    const route = endpoint(name, args.ids); const url = new URL(route.url);
    if (args.query) url.search = args.query.toString();
    const remaining = Date.parse(args.deadline) - this.now();
    if (!Number.isFinite(remaining) || remaining <= 0) throw new TransportError('deadline_expired');
    const headers = new Headers(args.headers);
    const body = args.form ? args.form.toString() : args.body === undefined ? undefined : JSON.stringify(args.body);
    if (body && new TextEncoder().encode(body).length > (args.maxRequestBytes??2_000_000)) throw new TransportError('request_too_large');
    if (body) headers.set('content-type', args.form ? 'application/x-www-form-urlencoded' : 'application/json');
    const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), Math.min(remaining, 60_000));
    try {
      const send = this.send;
      const response = await send(url.toString(), { method: route.method, headers, body, redirect: 'manual', signal: abort.signal });
      if (response.status >= 300 && response.status < 400) throw new TransportError('redirect_denied');
      const cap = args.maxBytes ?? 2_000_000; const reader = response.body?.getReader(); let total = 0; const chunks: Uint8Array[] = [];
      if (reader) { for (;;) { const chunk = await reader.read(); if (chunk.done) break; total += chunk.value.length; if (total > cap) { await reader.cancel(); throw new TransportError('response_too_large'); } chunks.push(chunk.value); } }
      const raw = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; }
      if (args.binary && response.status === 200) return { status: 200, body: { contentType: (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase(), base64: base64(raw) }, hash: await sha256(raw), requestId: response.headers.get('x-request-id') ?? response.headers.get('request-id'), retryAfter: null };
      const text = new TextDecoder().decode(raw); let parsed: unknown = null;
      if (text) { try { parsed = JSON.parse(text); } catch { throw new TransportError('invalid_json'); } }
      return { status: response.status, body: parsed, hash: await sha256(raw), requestId: response.headers.get('x-request-id') ?? response.headers.get('request-id'), retryAfter: response.headers.get('retry-after') };
    } catch (e) { if (e instanceof TransportError) throw e; throw new TransportError('transport_lost'); }
    finally { clearTimeout(timer); }
  }
}
export function refusal(response: WireResponse): ProviderResult | null {
  if (response.status >= 200 && response.status < 300) return null;
  if (response.status === 429) return { state: 'refused', code: 'rate_limited', message: 'Provider rate limit prevented this request.', retryable: true, ...(response.retryAfter ? { retryAfter: response.retryAfter } : {}) };
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 409) return { state: 'refused', code: 'provider_refused', message: `Provider refused the request (HTTP ${response.status}).` };
  return { state: 'unknown', message: `Provider outcome is unresolved (HTTP ${response.status}).` };
}
export function unknown(): ProviderResult { return { state: 'unknown', message: 'Provider response was unavailable or invalid; reconcile the original effect.' }; }
