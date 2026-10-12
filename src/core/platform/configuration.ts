import { localMailEnabled } from './local-auth.server'
import type { PlatformBindings } from './bindings'

export class ConfigurationError extends Error {
  constructor(readonly missing: string[]) { super(`Missing or invalid configuration: ${missing.join(', ')}`) }
}

export function configurationFaults(bindings: PlatformBindings): string[] {
  const faults: string[] = []
  const hasOwner = !!bindings.OWNER_EMAIL?.trim()
  if (!hasOwner) faults.push('OWNER_EMAIL')
  if (!bindings.DB?.prepare) faults.push('DB')
  if (!bindings.FILES?.head) faults.push('FILES')
  if (!bindings.WORK_QUEUE?.send) faults.push('WORK_QUEUE')
  if (!bindings.ASSETS?.fetch) faults.push('ASSETS')
  // Development is an explicit installation mode, never inferred from a host header.
  for (const key of ['APP_ORIGIN', 'SESSION_SECRET'] as const) if (!bindings[key]?.trim()) faults.push(key)
  if (bindings.SESSION_SECRET && bindings.SESSION_SECRET.length < 32) faults.push('SESSION_SECRET (minimum 32 characters)')
  if (!localMailEnabled(bindings)) {
    for (const key of ['MAIL_FROM', 'MAIL_PROVIDER_API_KEY'] as const) if (!bindings[key]?.trim()) faults.push(key)
  }
  if (hasOwner && !bindings.INSTALLATION?.get) faults.push('INSTALLATION')
  if (hasOwner && bindings.MAIL_PROVIDER !== 'sendgrid' && bindings.MAIL_PROVIDER !== 'resend' && !(bindings.MAIL_PROVIDER === 'development' && localMailEnabled(bindings))) faults.push('MAIL_PROVIDER (sendgrid or resend)')
  if (bindings.APP_ORIGIN) {
    try {
      const origin = new URL(bindings.APP_ORIGIN)
      if (origin.origin !== bindings.APP_ORIGIN || (origin.protocol !== 'https:' && !(localMailEnabled(bindings) && origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) faults.push('APP_ORIGIN (canonical HTTPS origin)')
    } catch { faults.push('APP_ORIGIN (valid origin)') }
  }
  return [...new Set(faults)]
}

export function assertConfiguration(bindings: PlatformBindings): void {
  const faults = configurationFaults(bindings)
  if (faults.length) throw new ConfigurationError(faults)
}
