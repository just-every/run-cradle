import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsPage } from '../ui'
export const Route = createFileRoute('/app/approvals/$decisionId')({ component: editorLeaf(Page) })
function Page() { const { decisionId } = Route.useParams(); return <ApprovalsPage decisionId={decisionId} /> }
