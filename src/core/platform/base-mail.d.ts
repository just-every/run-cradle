/** Consumer declarations live outside the byte-identical Base source copy. */
declare module '*vendor/base/modules/mail/index.mjs' {
  export function createMailSender(config: { provider: 'sendgrid' | 'resend' | 'development'; mode: 'production' | 'development'; apiKey?: string }, dependencies?: { outbox: object }): import('../../../vendor/base/modules/operator-auth/index.mjs').MailSender
}
