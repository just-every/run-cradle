import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { CasePage } from '../ui'
export const Route = createFileRoute('/app/cases/$caseId')({ component: editorLeaf(Page) })
function Page() { const { caseId } = Route.useParams(); return <CasePage caseId={caseId} /> }
