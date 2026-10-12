import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { AutomationMonitorPage } from '../core/features/automations/ui/automation-monitor-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/automations')({ loader: () => loadDocumentData({ data: [`/api/automations`] }), component: editorLeaf(Page) })
function Page() {
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Automations"><AutomationMonitorPage /></OperatorFeaturePage></DocumentDataContext>
}
