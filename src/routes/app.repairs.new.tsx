import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { IntakePage } from '../ui'
export const Route = createFileRoute('/app/repairs/new')({ component: editorLeaf(Page) })
function Page() { return <IntakePage /> }
