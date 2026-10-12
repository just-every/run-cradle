import {editorLeaf} from '../core/features/editor/leaf'
import { loadVersionedDocumentData } from '../core/app/versioned-loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SourcePage } from '../ui'
export const Route = createFileRoute('/app/evidence/$sourceId')({ validateSearch: z.object({repairId:z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional(),version:z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional()}), loaderDeps:({search})=>({version:search.version}), loader: ({params,deps}) => loadVersionedDocumentData({data:[`/api/v1/sources/${params.sourceId}${deps.version ? `?version=${deps.version}` : ''}`]}), component: editorLeaf(Page) })
function Page() { const { sourceId } = Route.useParams(); const {version,repairId}=Route.useSearch(); return <DocumentDataContext key={`${sourceId}:${version??'current'}`} value={Route.useLoaderData()}><SourcePage sourceId={sourceId} version={version} repairId={repairId} /></DocumentDataContext> }
