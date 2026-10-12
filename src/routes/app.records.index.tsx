import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { RecordsPage } from '../ui'
export const Route = createFileRoute('/app/records/')({ validateSearch: (search: Record<string, unknown>) => ({ import: search.import === 'base' ? 'base' : undefined, job: typeof search.job === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(search.job) ? search.job : undefined, receipt: search.receipt === '1' || search.receipt === 1 ? '1' as const : undefined }), component: editorLeaf(Page) })
function Page() { const search = Route.useSearch(); return <RecordsPage importBase={search.import === 'base'} importJobId={search.job} receipt={search.receipt === '1'} /> }
