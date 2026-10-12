import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { ApprovalsPage } from '../ui'
export const Route = createFileRoute('/app/approvals/')({ component: editorLeaf(Page) })
function Page() { return <ApprovalsPage /> }
