import { ensureRecordAutomationTriggers } from '../../domains/automations/capture.server'
import { localRuntimeBindings } from '../platform/local-auth.server'
import type { PlatformBindings } from '../platform/bindings'
import { createPlatform } from '../platform'
import { createRuntime, type Runtime } from './composition/runtime.server'
import { createApplication, type AppType } from './application'
import { getServerExtensionConfig } from './mount-server'

/** The composed API is wiring over the bindings and the admitted schema set, so an
 * isolate builds it once per set instead of once per request. Every request still
 * reads the admitted schema pointers, repairs record automation triggers, and
 * resolves its own authentication and authority inside the handlers. */
type Composed = { app: AppType; runtime: Runtime }
const composed = new WeakMap<object, { bindings: PlatformBindings; schemas: string; application: Promise<Composed> }>()

const admittedSchemas = async (db: D1Database) =>
  (await db.prepare("SELECT app_id,id,version,physical_revision,EXISTS(SELECT 1 FROM record_trash t WHERE t.app_id=record_schemas.app_id AND t.entity_id=record_schemas.id AND t.kind='table') AS trashed FROM record_schemas ORDER BY app_id,id").all<{ app_id: string; id: string; version: number; physical_revision: string; trashed:number }>())
    .results.map(row => `${row.app_id}:${row.id}:${row.version}:${row.physical_revision}:${row.trashed}`).join('\n')

const sameBindings = (a: PlatformBindings, b: PlatformBindings) => {
  const keys = Object.keys(a) as (keyof PlatformBindings)[]
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key])
}

export async function currentApplication(input: PlatformBindings): Promise<AppType> {
  return (await currentComposition(input)).app
}

export async function currentComposition(input: PlatformBindings): Promise<Composed> {
  const bindings = localRuntimeBindings(input)
  const schemas = await admittedSchemas(bindings.DB)
  const entry = composed.get(bindings.DB)
  if (entry && entry.schemas === schemas && sameBindings(entry.bindings, bindings)) {
    const current = await entry.application
    await ensureRecordAutomationTriggers(bindings.DB, current.runtime.foundation.descriptors)
    return current
  }
  const application = (async () => {
    const platform = createPlatform(bindings)
    const runtime = await createRuntime(platform)
    return { app: createApplication(platform, getServerExtensionConfig(), runtime), runtime }
  })()
  composed.set(bindings.DB, { bindings, schemas, application })
  application.catch(() => { if (composed.get(bindings.DB)?.application === application) composed.delete(bindings.DB) })
  return application
}
