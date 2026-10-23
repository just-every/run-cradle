import type { Runtime } from './runtime.server'
import { createOutboxReader } from '../../../domains/admission/outbox.server'
import { ApiError } from '../../registry/errors'
import type { Platform } from '../../platform'

/** Durable state decides routing; queue payloads carry identifiers, never effect authority. */
export function createRuntimeEvents(platform: Platform, runtime: Runtime,clock=()=>new Date()) {
  const outbox = createOutboxReader(platform.bindings.DB)
  async function dispatch(outboxId: string) {
    const entry = await outbox.get(outboxId)
    if (!entry) throw new ApiError('not_found', 'Durable outbox entry is missing.')
    if (entry.state !== 'pending') return
    if (entry.notBefore > clock().toISOString()) throw new ApiError('version_conflict', 'Durable work is not due.')
    if (entry.action.startsWith('launch.'))return runtime.launch.dispatch(entry)
    if (entry.action === 'connection.operation') return runtime.providers.jobs.dispatch(entry.id)
    if (['execution.dispatch', 'execution.reconcile', 'execution.recover'].includes(entry.action)) {
      const input = entry.input
      if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.runId !== 'string') throw new ApiError('validation', 'Durable execution lineage is invalid.')
      const ctx = await runtime.providers.background.run(input.runId, 'queue')
      await runtime.providers.execution.dispatch(ctx, entry.id)
      return
    }
    throw new ApiError('unconfigured', 'This durable action does not have a mounted worker handler.')
  }
  async function channels() {
    await runtime.channels.delivery.scheduled(clock().getTime())
    await runtime.providers.handlers.scheduled()
  }
  async function scheduled() {
    await runtime.launch.scheduled()
    await runtime.lifecycle.cleanup.maintain()
    await runtime.trashPurge()
    await runtime.warehouse.runtime.scheduled()
    // Admit due notifications before dispatching effects in this same invocation.
    await channels()
    await runtime.providers.jobs.scheduled()
    await runtime.sheets.scheduled()
    await runtime.calendarSync.service.tick()
    await runtime.automations.runtime.tick()
    await runtime.changeDelivery.tick()
  }
  return { dispatch, channels, scheduled,changes:(commandId:string)=>runtime.changeDelivery.tick(commandId),warehouse:()=>runtime.warehouse.runtime.scheduled(),launch:(commandId:string)=>runtime.launch.events(commandId),automations:async(commandId:string)=>{await runtime.calendarSync.service.tick();await runtime.automations.runtime.tick(commandId,'queue')} }
}
