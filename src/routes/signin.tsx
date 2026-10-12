import {editorLeaf} from '../core/features/editor/leaf'
import { loadPublicDocument } from '../core/app/loaders'
import { createFileRoute, type SearchSchemaInput } from '@tanstack/react-router'
import { SignInPage } from '../core/app/screens/sign-in-page'
import { normalizeSignInSearch } from '../core/app/screens/sign-in-search'
export const Route = createFileRoute('/signin')({ validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => normalizeSignInSearch(search), loader: () => loadPublicDocument(), staleTime: 0, component: editorLeaf(Page) })
function Page() {
  return <SignInPage publicDocument={Route.useLoaderData()} search={Route.useSearch()} />
}
