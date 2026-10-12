import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { RecordsPage } from '../ui'
export const Route = createFileRoute('/app/records/$appId/')({ component: editorLeaf(Page) })
function Page() { const { appId } = Route.useParams(); return <RecordsPage appId={appId} /> }
