import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { DecisionQueuePage } from '../core/features/decisions/ui/decision-queue-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/decisions/$decisionId')({ loader: ({ params }) => loadDocumentData({ data: [`/api/decisions`, `/api/decisions/${params.decisionId}`] }), component: editorLeaf(Page) })
function Page() {
  const { decisionId } = Route.useParams()
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Decision Queue"><DecisionQueuePage decisionId={decisionId} /></OperatorFeaturePage></DocumentDataContext>
}
