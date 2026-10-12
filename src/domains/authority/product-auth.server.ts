import { createBaseProductAuth, createBaseSessionReader } from './base-session.server'
import { isLoopbackHostname } from '../../core/shared/loopback'
import type { AuthConfiguration } from './ports'

/** Cradle projects Base sessions into its current application policy. */
export function validateAuthConfiguration(config: AuthConfiguration) {
  const url = new URL(config.appOrigin)
  if (url.origin !== config.appOrigin || url.username || url.password) throw new Error('APP_ORIGIN must be a canonical origin.')
  if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
  if (config.mode === 'production' && url.protocol !== 'https:') throw new Error('APP_ORIGIN must use HTTPS in production.')
  if (config.mode === 'development' && (url.protocol !== 'http:' || !isLoopbackHostname(url.hostname))) throw new Error('Local authentication requires a loopback HTTP origin.')
  if (!config.base) throw new Error('Base operator-auth is required.')
}

export function createProductAuth(db: D1Database, config: AuthConfiguration) {
  validateAuthConfiguration(config)
  return createBaseProductAuth(db, config, config.base!)
}

export function createProductSessionReader(db: D1Database, config: AuthConfiguration) {
  validateAuthConfiguration(config)
  return createBaseSessionReader(db, config, config.base!)
}
