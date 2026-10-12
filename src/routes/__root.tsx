import {useEditorLeafReady} from '../editor/react'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import type { SeedConfig } from '../core/shared/config'
import { Link } from '@tanstack/react-router'
import { PublicLayout } from '../core/app/ui/public-layout'
import { DocumentError } from '../core/app/ui/document-failure'
import type { ReactNode } from 'react'
import favicon from '../core/app/favicon.svg?url'
import stylesheet from '../core/app/styles.css?url'

export const Route = createRootRouteWithContext<{ config: SeedConfig }>()({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Cradle' }], links: [{ rel: 'preload', href: '/fonts/lexend.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' }, { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' }, { rel: 'icon', type: 'image/svg+xml', href: favicon }, { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' }, { rel: 'stylesheet', href: stylesheet }] }),
  shellComponent: DocumentShell,
  component: Outlet,
  errorComponent: DocumentError,
  notFoundComponent: NotFoundPage,
})

function DocumentShell({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body><div id="root">{children}</div><Scripts /></body></html>
}

function NotFoundPage() {
  useEditorLeafReady(typeof location==='undefined'?'not-found':location.pathname)
  const { config } = Route.useRouteContext()
  return <PublicLayout config={config}><main className="cr-identity"><p className="cr-eyebrow">404</p><h1>Page not found</h1><p>No page exists at this address. Check the link or return to your workspace.</p><Link className="cr-button" to="/app">Open workspace</Link><p><Link className="cr-link" to="/">Return to {config.workspaceName}</Link></p></main></PublicLayout>
}
