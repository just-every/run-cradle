import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StrategyPage } from '../ui'
export const Route = createFileRoute('/app/portfolio/$problemId')({ validateSearch: z.object({ appId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/).optional() }), component: editorLeaf(Page) })
function Page() { const { problemId } = Route.useParams(); const { appId } = Route.useSearch(); return <StrategyPage appId={appId} problemId={problemId} /> }
