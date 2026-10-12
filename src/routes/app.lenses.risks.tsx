import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { RisksLensPage } from '../core/features/risks/ui/risks-lens-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/lenses/risks')({ loader: () => loadDocumentData({ data: [`/api/risks/lens`] }), component: editorLeaf(Page) })
function Page() {
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Risks Lens"><RisksLensPage /></OperatorFeaturePage></DocumentDataContext>
}
