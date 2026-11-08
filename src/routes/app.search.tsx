import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '../ui'
export const Route = createFileRoute('/app/search')({ validateSearch: (search: Record<string, unknown>) => ({ q: typeof search.q === 'string' && search.q.trim() ? search.q.trim() : undefined, archived: search.archived === true || search.archived === 'true' ? true as const : undefined }), component: editorLeaf(Page) })
function Page() { const { q, archived } = Route.useSearch(); return <SearchPage query={q ?? ''} archived={archived === true} /> }
