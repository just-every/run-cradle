import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { RecordFormPage } from '../ui'
import { loadVersionedDocumentData } from '../core/app/versioned-loaders'
import { DocumentDataContext } from '../core/app/document-data'
export const Route = createFileRoute('/app/forms/$formId')({loader:({params})=>loadVersionedDocumentData({data:[`/api/v1/forms/${params.formId}`]}),component: editorLeaf(Page)})
function Page(){const {formId}=Route.useParams();return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><RecordFormPage formId={formId} /></DocumentDataContext>}
