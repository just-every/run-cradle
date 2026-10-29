export {}
declare global {
  namespace Cloudflare {
    interface Env {
      RER_DEMO?: string
      RER_DEMO_EXPIRES?: string
      RER_MANAGEMENT_ORIGIN?: string
      RER_INSTALLATION_ID?: string
      RER_OWNER_CLAIM_ISSUER?: string
      RER_OWNER_CLAIM_INSTALLATION_ID?: string
      RER_OWNER_CLAIM_APP_ORIGIN?: string
      RER_OWNER_CLAIM_PUBLIC_KEYS?: string
      RER_EDITOR_ENABLED?: string
      INSTALLATION: DurableObjectNamespace
      IDENTITY_PROVIDER?: string
      OWNER_EMAIL?: string
      OWNER_NAME?: string
      SETUP_TOKEN?: string
      RER_DEV_ORIGIN?: string
      RER_DEV_KEY?: string
      RER_DEV_IDENTITY?: string
      AUTH_LOCAL?: string
      AUTH_ALLOW_LIST?: string
      AUTH_ORIGIN?: string
      WORKSPACE_NAME?: string
      WORKSPACE_TIMEZONE?: string
      WORKSPACE_CURRENCY?: string
      MAIL_PROVIDER?: 'rer' | 'sendgrid' | 'resend' | 'development'
      RER_DEPLOY_SOURCE?: string
      RER_DEPLOY_FINGERPRINT?: string
      RER_VERSION?: { id: string }
      APP_ORIGIN?: string
      SESSION_SECRET?: string
      INSTALLATION_KEY?: string
      INSTALLATION_KEY_PREVIOUS?: string
      MAIL_FROM?: string
      MAIL_PROVIDER_API_KEY?: string
      MAIL_API_KEY?: string
      MAIL_RELAY_URL?: string
      AI_PROVIDER_API_KEY?: string
      AI_MODEL?: string
      CANDIDATE_RUNNER_URL?: string
      CANDIDATE_RUNNER_TOKEN?: string
      CANDIDATE_DEPLOY_TOKEN?: string
      CANDIDATE_RUNNER_PUBLIC_KEY?: string
      CONNECTION_ENCRYPTION_KEY_VERSION?: string
      NOTIFICATION_MAIL_CONNECTION_ID?: string
      INSTALLATION_RELEASE_ID?: string
      GOOGLE_CLIENT_ID?: string
      GOOGLE_CLIENT_SECRET?: string
      XERO_CLIENT_ID?: string
      XERO_CLIENT_SECRET?: string
      MICROSOFT_CLIENT_ID?: string
      MICROSOFT_CLIENT_SECRET?: string
      DROPBOX_CLIENT_ID?: string
      DROPBOX_CLIENT_SECRET?: string
      BOX_CLIENT_ID?: string
      BOX_CLIENT_SECRET?: string
      CONNECTION_ENCRYPTION_KEY?: string
      EGRESS_RELAY_URL?: string
      EGRESS_RELAY_SECRET?: string
      SETUP_OPERATOR_EMAIL?: string
    }
  }
}
