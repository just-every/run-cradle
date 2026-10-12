import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { TimelineLensPage } from '../core/features/milestones/ui/timeline-lens-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/lenses/timeline')({ loader: () => loadDocumentData({ data: [`/api/milestones/timeline`] }), component: editorLeaf(Page) })
function Page() {
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Timeline Lens"><TimelineLensPage /></OperatorFeaturePage></DocumentDataContext>
}
