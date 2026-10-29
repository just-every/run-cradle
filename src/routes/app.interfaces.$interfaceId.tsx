import {createFileRoute} from '@tanstack/react-router'
import {editorLeaf} from '../core/features/editor/leaf'
import {InterfacePage} from '../ui/records/interfaces/pages'
import {loadVersionedDocumentData} from '../core/app/versioned-loaders'
import {DocumentDataContext} from '../core/app/document-data'
export const Route=createFileRoute('/app/interfaces/$interfaceId')({loader:({params})=>loadVersionedDocumentData({data:[`/api/v1/interfaces/${params.interfaceId}`]}),component:editorLeaf(Page)})
function Page(){const {interfaceId}=Route.useParams();return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><InterfacePage interfaceId={interfaceId}/></DocumentDataContext>}
