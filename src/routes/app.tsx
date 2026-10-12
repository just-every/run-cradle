import {OwnerEditorShell} from '../core/features/editor/owner-shell'
import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router'
import { loadOperatorDocument } from '../core/app/loaders'
import { DocumentSession } from '../core/app/document-context'
import { DocumentFailure } from '../core/app/ui/document-failure'
export const Route = createFileRoute('/app')({
  loader: () => loadOperatorDocument(),
  staleTime: 0,
  component: App,
})
function App() {
  const session = Route.useLoaderData()
  const router = useRouter()
  const { config } = Route.useRouteContext()
  return <DocumentSession value={session}><OwnerEditorShell session={session}/>{session.launchAvailability === 'unavailable'
    ? <DocumentFailure error={new Error('The current page data could not be read.')} session={session} config={config} path={router.state.location.pathname} retry={() => { void router.invalidate() }} />
    : <Outlet />}</DocumentSession>
}
