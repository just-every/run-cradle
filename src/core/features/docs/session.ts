import { createServerFn } from '@tanstack/react-start'

/** Whether this visit has an open session, so the docs header offers the workspace instead of Sign in (VE18). */
export const loadDocsSession = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { docsSessionOpen } = await import('./session.server')
    return docsSessionOpen()
  })
