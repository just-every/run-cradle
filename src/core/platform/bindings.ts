/** Resource bindings come from wrangler types; application variables augment Env. */
export type PlatformBindings = Cloudflare.Env
// This assignment makes a wrongly declared generated resource a type error.
type RequiredResources = { DB: D1Database; FILES: R2Bucket; WORK_QUEUE: Queue; ASSETS: Fetcher }
type AssertResources<T extends RequiredResources> = T
export type CheckedPlatformBindings = AssertResources<PlatformBindings>
