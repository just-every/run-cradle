import {editorLeaf} from '../core/features/editor/leaf'
import { loadPublicDocument } from '../core/app/loaders'
import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '../core/app/screens/landing-page'

const description = 'A self-hosted records builder for one business: typed records, relationships, forms and saved views in a private workspace you run and change yourself. 100% free, open source alternative to Airtable and Smartsheet.'

export const Route = createFileRoute('/')({
  loader: () => loadPublicDocument(),
  staleTime: 0,
  head: ({ match }) => ({ meta: [{ title: `${match.context.config.productName}, a self-hosted records builder` }, { name: 'description', content: description }] }),
  component: editorLeaf(Page),
})
function Page() {
  return <LandingPage publicDocument={Route.useLoaderData()} />
}
