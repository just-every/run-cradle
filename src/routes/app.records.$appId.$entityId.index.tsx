import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { RecordsPage } from '../ui'
export const Route = createFileRoute('/app/records/$appId/$entityId/')({ validateSearch: (search: Record<string, unknown>) => ({ view: search.view === 'board' || search.view === 'gallery' || search.view === 'forms' ? search.view : undefined }), component: editorLeaf(Page) })
function Page() { const { appId,entityId } = Route.useParams(); return <RecordsPage appId={appId} entityId={entityId} /> }
