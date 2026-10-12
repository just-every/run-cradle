import {useEditorLeafReady} from '../../../editor/react'
import { useRouter } from '@tanstack/react-router'
import type { CurrentSession } from '../../shared/session'
import type { SeedConfig } from '../../shared/config'
import { OperatorShell } from './operator'
import { PublicLayout } from './public-layout'

export const documentForbiddenMessage = 'Your current access does not permit this page.'

export function DocumentFailure({ error, retry, session, config, path }: {
  error: unknown; retry: () => void; session?: CurrentSession; config: SeedConfig; path: string
}) {
  useEditorLeafReady(path)
  const forbidden = error instanceof Error && error.message === documentForbiddenMessage
  const content = <section className="cr-state cr-document-failure" role="alert">
    <p className="cr-eyebrow">{forbidden ? 'Access changed' : 'Could not load'}</p>
    <h1>{forbidden ? 'This page is outside your access' : 'Could not load this page'}</h1>
    <p>{forbidden ? documentForbiddenMessage : 'The current page data could not be read. Try again to check the latest state.'}</p>
    <p className="cr-muted">Page: {path}</p>
    <div className="cr-actions"><button className="cr-button" onClick={retry}>Retry</button><a className="cr-button cr-button--quiet" href="/app/records">Open records</a><a className="cr-link" href="/app">Return home</a></div>
  </section>
  return session ? <OperatorShell currentPath={path} title="Page unavailable" identity={{ name: session.operator.name, initials: session.operator.initials, workspaceName: session.workspace.name, unreadNotifications: session.unreadNotifications }}><div className="cr-page">{content}</div></OperatorShell> : <PublicLayout config={config}>{content}</PublicLayout>
}

// Use the same boundary for server-rendered child loader failures and client
// navigation errors. The root document shell retains styles and hydration.
export function DocumentError({ error, reset }: { error: unknown; reset?: () => void }) {
  const router = useRouter()
  const config = router.options.context!.config
  const session = router.state.matches.find(match => match.routeId === '/app')?.loaderData as CurrentSession | undefined
  return <DocumentFailure error={error} config={config} session={session} path={router.state.location.pathname} retry={() => { void router.invalidate().then(() => reset?.()) }} />
}
