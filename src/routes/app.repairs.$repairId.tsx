import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { RepairsPage } from '../ui'
export const Route = createFileRoute('/app/repairs/$repairId')({ component: editorLeaf(Page) })
function Page() { const { repairId } = Route.useParams(); return <RepairsPage repairId={repairId} /> }
