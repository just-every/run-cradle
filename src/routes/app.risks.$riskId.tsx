import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { RiskDetailPage } from '../core/features/risks/ui/risk-detail-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/risks/$riskId')({ loader: ({ params }) => loadDocumentData({ data: [`/api/risks/${params.riskId}`] }), component: editorLeaf(Page) })
function Page() {
  const { riskId } = Route.useParams()
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Risk detail"><RiskDetailPage riskId={riskId} /></OperatorFeaturePage></DocumentDataContext>
}
