import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { editorLeaf } from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
import { CurrentLensPage } from '../core/features/lenses/ui/current-lens-page'

export const Route = createFileRoute('/app/lenses/$lensId')({
 staleTime: 0,
 loader: ({params,location}) => location.pathname.endsWith('/edit') ? {} : loadDocumentData({data:[`/api/lenses/${params.lensId}?view=results`]}),
 component: editorLeaf(Page),
})
function Page() {
 const {lensId} = Route.useParams()
 const path = useRouterState({select:state => state.location.pathname})
 const data = Route.useLoaderData()
 if (path.endsWith('/edit')) return <Outlet />
 return <DocumentDataContext key={path} value={data}><OperatorFeaturePage currentPath={path} title="Saved Lens"><CurrentLensPage lensId={lensId}/></OperatorFeaturePage></DocumentDataContext>
}
