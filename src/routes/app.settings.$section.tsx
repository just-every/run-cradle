import {editorLeaf} from '../core/features/editor/leaf'
import { loadDocumentData } from '../core/app/loaders'
import { DocumentDataContext } from '../core/app/document-data'
import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '../core/features/settings/ui/settings-page'
import { OperatorFeaturePage } from '../core/app/screens/operator-feature-page'
export const Route = createFileRoute('/app/settings/$section')({ loader: () => loadDocumentData({ data: [`/api/settings`] }), component: editorLeaf(Page) })
function Page() {
  return <DocumentDataContext key={Route.useMatch().pathname} value={Route.useLoaderData()}><OperatorFeaturePage currentPath={Route.useMatch().pathname} title="Settings" description="Changes apply to work dispatched after they are saved. Already-dispatched work stays unchanged."><SettingsPage /></OperatorFeaturePage></DocumentDataContext>
}
