import {editorLeaf} from '../core/features/editor/leaf'
import { createFileRoute } from '@tanstack/react-router'
import { IntakeDetailPage } from '../ui'
export const Route = createFileRoute('/app/repairs/intakes/$intakeId')({ component: editorLeaf(Page) })
function Page() { const { intakeId } = Route.useParams(); return <IntakeDetailPage intakeId={intakeId} /> }
