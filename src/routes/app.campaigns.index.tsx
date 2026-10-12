import {editorLeaf} from '../core/features/editor/leaf'
import { parseCampaignQuery } from '../core/features/portfolio/ui/campaign-query'
import { campaignQueryUrl } from '../core/features/portfolio/ui/portfolio-api'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { CampaignGridPage } from '../core/features/portfolio/ui'
export const Route = createFileRoute('/app/campaigns/')({ loaderDeps: ({ search }) => parseCampaignQuery(search), loader: ({ deps }) => loadDocumentData({ data: [campaignQueryUrl(deps)] }), component: editorLeaf(Page) })
function Page() {
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><CampaignGridPage /></DocumentDataContext>
}
