import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { MilestoneDetailPage } from '../core/features/milestones/ui/milestone-detail-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/milestones/$milestoneId')({ loader: ({ params }) => loadDocumentData({ data: [`/api/milestones/${params.milestoneId}`] }), component: editorLeaf(Page) })
function Page() {
  const { milestoneId } = Route.useParams()
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Milestone detail"><MilestoneDetailPage milestoneId={milestoneId} /></OperatorFeaturePage></DocumentDataContext>
}
