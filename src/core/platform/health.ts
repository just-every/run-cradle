import type { PlatformBindings } from './bindings'
import { configurationFaults } from './configuration'

export const HEALTH_MESSAGE = 'cradle.health.v1'
export type HealthMessage = { kind: typeof HEALTH_MESSAGE; requestId: string; createdAt: string }

async function bounded(probe: () => Promise<unknown>, milliseconds: number): Promise<'available' | 'unavailable'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([probe(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Health deadline exceeded')), milliseconds) })])
    return 'available'
  } catch { return 'unavailable' } finally { clearTimeout(timer) }
}

/** Checks resource access, not domain completion or provider consent. */
export async function checkHealth(bindings: PlatformBindings) {
  const missing = configurationFaults(bindings)
  const [database, storage, queue] = await Promise.all([
    bounded(() => bindings.DB.prepare('SELECT 1').first(), 800),
    bounded(() => bindings.FILES.head('__cradle_health_probe__'), 800),
    bounded(() => bindings.WORK_QUEUE.send({ kind: HEALTH_MESSAGE, requestId: crypto.randomUUID(), createdAt: new Date().toISOString() } satisfies HealthMessage), 800),
  ])
  const healthy = !missing.length && [database, storage, queue].every(value => value === 'available')
  return { status: healthy ? 'ok' : 'unhealthy', database, storage, queue, ...(missing.length ? { missing } : {}) }
}

export function isHealthMessage(value: unknown): value is HealthMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<HealthMessage>
  return message.kind === HEALTH_MESSAGE && typeof message.requestId === 'string' && typeof message.createdAt === 'string' && Number.isFinite(Date.parse(message.createdAt))
}
