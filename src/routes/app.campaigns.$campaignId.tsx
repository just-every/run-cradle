import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { loadVersionedDocumentData } from '../core/app/versioned-loaders'
import { LAUNCH_APP_ID, launchEntities } from '../apps/launch/contracts'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { CampaignDetailPage } from '../core/features/portfolio/ui'
export const Route = createFileRoute('/app/campaigns/$campaignId')({ loader: async ({ params }) => {
  const subject = { appId: LAUNCH_APP_ID, entityId: launchEntities.campaign, recordId: params.campaignId }
  const resources = await Promise.all([
    loadDocumentData({ data: [`/api/campaigns/${params.campaignId}`] }),
    loadVersionedDocumentData({ data: [
      `/api/v1/apps/${subject.appId}/entities/${subject.entityId}/records/${subject.recordId}`,
      `/api/v1/comments?${new URLSearchParams({ ...subject, q: '', limit: '30' })}`,
    ] }),
  ])
  return Object.assign({}, ...resources)
}, component: editorLeaf(Page) })
function Page() {
  const { campaignId } = Route.useParams()
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><CampaignDetailPage campaignId={campaignId} /></DocumentDataContext>
}
