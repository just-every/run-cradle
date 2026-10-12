import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { LensBuilderPage } from '../core/features/lenses/ui/lens-builder-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/lenses/new')({ loader: () => loadDocumentData({ data: [`/api/lenses`] }), component: editorLeaf(Page) })
function Page() {
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="New Lens"><LensBuilderPage /></OperatorFeaturePage></DocumentDataContext>
}
