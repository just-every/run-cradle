import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { OperationStudioPage } from '../ui'
export const Route = createFileRoute('/app/operations/studio')({ component: editorLeaf(Page) })
function Page() { return <OperationStudioPage /> }
