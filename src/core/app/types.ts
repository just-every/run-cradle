import type { PlatformBindings } from '../platform/bindings'
import type { CurrentSession } from '../shared/session'

export type AppEnv = {
  Bindings: PlatformBindings
  Variables: {
    session: CurrentSession
  }
}
