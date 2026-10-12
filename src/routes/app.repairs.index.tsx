import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { RepairsPage } from '../ui'
export const Route = createFileRoute('/app/repairs/')({ component: editorLeaf(Page) })
function Page() { return <RepairsPage /> }
