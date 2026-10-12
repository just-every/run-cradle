import type { PlatformBindings } from '../src/core/platform/bindings'
declare const env: Cloudflare.Env
const actual: PlatformBindings = env
const resources: { DB: D1Database; FILES: R2Bucket; WORK_QUEUE: Queue; ASSETS: Fetcher } = actual
// Missing or incorrect generated resources must fail ordinary type checking.
// @ts-expect-error FILES is required
const missing: PlatformBindings = { DB: env.DB, WORK_QUEUE: env.WORK_QUEUE, ASSETS: env.ASSETS }
// @ts-expect-error Queue is not an R2 bucket
const incorrect: PlatformBindings = { ...env, FILES: env.WORK_QUEUE }
void resources; void missing; void incorrect
