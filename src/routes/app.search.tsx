import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '../ui'
export const Route = createFileRoute('/app/search')({ component: editorLeaf(Page) })
function Page() { return <SearchPage /> }
