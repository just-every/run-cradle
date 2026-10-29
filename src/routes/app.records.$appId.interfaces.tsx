import {createFileRoute} from '@tanstack/react-router'
import {editorLeaf} from '../core/features/editor/leaf'
import {InterfaceListPage} from '../ui/records/interfaces/pages'
export const Route=createFileRoute('/app/records/$appId/interfaces')({component:editorLeaf(Page)})
function Page(){const {appId}=Route.useParams();return <InterfaceListPage appId={appId}/>}
