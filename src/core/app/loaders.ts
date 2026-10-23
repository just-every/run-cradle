import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'

export const loadOperatorDocument = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { loadDocumentSession } = await import('./document.server')
    return loadDocumentSession()
  })

export const loadDocumentData = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => {
    if (!Array.isArray(value) || value.length === 0 || value.length > 3 || !value.every((path) => typeof path === 'string' && /^\/api\/(portfolio|campaigns|risks|milestones|lenses|decisions|automations|notifications|settings)(\/[A-Za-z0-9]+)?(\?[^#]*)?$/.test(path))) throw notFound()
    return value as string[]
  })
  .handler(async ({ data }) => {
    const { loadDocumentResources } = await import('./document.server')
    return loadDocumentResources(data)
  })

export const loadPublicDocument = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { publicDocument } = await import('./public-document.server')
    return publicDocument()
  })

export const loadSignInDocument = createServerFn({ method: 'GET' })
  .inputValidator((value: { returnTo?: string }) => value)
  .handler(async ({ data }) => {
    const { signInDocument } = await import('./sign-in-document.server')
    return signInDocument(data)
  })

export const loadSetupDocument = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { setupDocument } = await import('../features/setup/document.server')
    return setupDocument()
  })
