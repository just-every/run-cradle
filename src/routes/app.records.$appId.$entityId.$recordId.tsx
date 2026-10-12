import {editorLeaf} from '../core/features/editor/leaf'
import { loadVersionedDocumentData } from '../core/app/versioned-loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { RecordDetailPage } from '../ui'
export const Route = createFileRoute('/app/records/$appId/$entityId/$recordId')({ loader: ({params}) => loadVersionedDocumentData({data:[`/api/v1/apps/${params.appId}/entities/${params.entityId}/records/${params.recordId}`]}), component: editorLeaf(Page) })
function Page() { const { appId,entityId,recordId } = Route.useParams(); return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><RecordDetailPage appId={appId} entityId={entityId} recordId={recordId} /></DocumentDataContext> }
