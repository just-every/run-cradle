/** Consumer declarations live outside the byte-identical Base source copy. */
declare module '*vendor/base/modules/mail/index.mjs' {
  export class MailValidationError extends Error { readonly code: string }
  type MailMessage = Omit<import('../../../vendor/base/modules/operator-auth/index.mjs').MailMessage, 'html' | 'headers'> & { html?: string; headers?: Record<string, string> }
  export function createMailSender(config: { provider: 'rer' | 'sendgrid' | 'resend' | 'development'; mode: 'production' | 'development'; apiKey?: string; relayUrl?: string }, dependencies?: { outbox: object }): { send(message: MailMessage): ReturnType<import('../../../vendor/base/modules/operator-auth/index.mjs').MailSender['send']> }
}
