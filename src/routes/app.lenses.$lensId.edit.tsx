import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { LensBuilderPage } from '../core/features/lenses/ui/lens-builder-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/lenses/$lensId/edit')({ loader: ({ params }) => loadDocumentData({ data: [`/api/lenses`, `/api/lenses/${params.lensId}`] }), component: editorLeaf(Page) })
function Page() {
  const { lensId } = Route.useParams()
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Edit Lens"><LensBuilderPage lensId={lensId} /></OperatorFeaturePage></DocumentDataContext>
}
