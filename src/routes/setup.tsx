import { createFileRoute } from '@tanstack/react-router'
import { loadSetupDocument } from '../core/app/loaders'
import { PublicLayout } from '../core/app/ui/public-layout'
import { useSeedConfig } from '../core/app/router'
import {editorLeaf} from '../core/features/editor/leaf'

export const Route=createFileRoute('/setup')({loader:()=>loadSetupDocument(),component:editorLeaf(Setup)})
function Setup(){
  const {csrf,workspace}=Route.useLoaderData(),config=useSeedConfig()
  return <PublicLayout config={config}><section className="cr-identity">
    <p className="cr-eyebrow">Cradle</p><h1>Set up your workspace</h1>
    <p>Confirm the details for your records. You can change them later in settings.</p>
    <form method="post" action="/setup" className="cr-stack">
      <input type="hidden" name="csrf" value={csrf}/>
      <div className="cr-field"><label htmlFor="setup-name">Workspace name</label><input id="setup-name" name="name" defaultValue={workspace.name} required maxLength={200}/></div>
      <div className="cr-field"><label htmlFor="setup-timezone">Timezone</label><input id="setup-timezone" name="timezone" defaultValue={workspace.timezone} required/></div>
      <div className="cr-field"><label htmlFor="setup-currency">Currency</label><input id="setup-currency" name="currency" defaultValue={workspace.currency} required pattern="[A-Z]{3}"/></div>
      <button className="cr-button">Open my workspace</button>
    </form>
  </section></PublicLayout>
}
