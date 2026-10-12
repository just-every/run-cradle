import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { OperationStudioPage } from '../ui'
export const Route = createFileRoute('/app/operations/studio/$candidateId')({ component: editorLeaf(Page) })
function Page() { const { candidateId } = Route.useParams(); return <OperationStudioPage candidateId={candidateId} /> }
