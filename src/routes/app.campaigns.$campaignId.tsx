import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { CampaignDetailPage } from '../core/features/portfolio/ui'
export const Route = createFileRoute('/app/campaigns/$campaignId')({ loader: ({ params }) => loadDocumentData({ data: [`/api/campaigns/${params.campaignId}`] }), component: editorLeaf(Page) })
function Page() {
  const { campaignId } = Route.useParams()
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><CampaignDetailPage campaignId={campaignId} /></DocumentDataContext>
}
