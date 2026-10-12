// Only these notices are presentation states. Query parameters never establish
// identity or authority, and unknown values are not reflected into the page.
export const signInErrors = {
  invalid_email: 'Enter a complete email address and try again.',
  invalid_input: 'Check your email address and try again.',
  input_too_large: 'The sign-in request was too large. Enter your email address and try again.',
  unsupported_media_type: 'The sign-in request could not be read. Use the form below to try again.',
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  mail_unavailable: 'Sign-in email is not available right now. Ask the workspace owner to check email delivery.',
  client_ip_unavailable: 'Sign-in is not available right now. Please try again later.',
  auth_unavailable: 'Sign-in is not available right now. Please try again later.',
  invalid_origin: 'The sign-in request could not be accepted. Use the form below to try again.',
  invalid_host: 'The sign-in request could not be accepted. Use the form below to try again.',
  forbidden: 'The sign-in request could not be accepted. Use the form below to try again.',
} as const
export type SignInNotice = keyof typeof signInErrors | 'sent' | 'step_up_sent' | 'signed_out'
export type SignInSearch = { notice?: SignInNotice; returnTo?: string }

function destination(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return
  let decoded = value
  for (let index = 0; index < 4; index++) {
    try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next } catch { return }
    if (decoded.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(decoded)) return
  }
  const url = new URL(value, 'https://signin.invalid')
  if (url.origin !== 'https://signin.invalid' || !(url.pathname === '/setup' || url.pathname === '/app' || url.pathname.startsWith('/app/'))) return
  return url.pathname + url.search + url.hash
}

export function normalizeSignInSearch(search: Record<string, unknown>): SignInSearch {
  const notice = typeof search.notice === 'string' && (['sent', 'step_up_sent', 'signed_out'].includes(search.notice) || Object.hasOwn(signInErrors, search.notice))
    ? search.notice as SignInNotice : undefined
  return { notice, returnTo: destination(search.returnTo) ?? destination(search.next) }
}
