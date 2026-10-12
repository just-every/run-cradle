import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { MandatePage } from '../ui'
export const Route = createFileRoute('/app/operations/mandates/$mandateId')({ component: editorLeaf(Page) })
function Page() { const { mandateId } = Route.useParams(); return <MandatePage mandateId={mandateId} /> }
