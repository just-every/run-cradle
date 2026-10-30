// The run site `rer build --site` writes for run-cradle.com: the approved homepage with its Run Cradle action, /run,
// the docs, /contract from CONTRACT.md and the not-found page, plus the public files they use. It reads no installation data, only the
// configuration in src/ext/config.ts, edition identity and Run data.
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { seedConfig } from '../ext/config'
import { identity } from '../identity'
import { Landing } from '../core/app/screens/landing/Landing'
import { SiteVariantProvider } from '../core/app/site/variant'
import { DocsLayout } from '../core/features/docs/DocsPage'
import { docsHead } from '../core/features/docs/head'
import type { DocsPageData } from '../core/features/docs/types'
import { run } from './run'
import '../core/app/styles.css'

const description = 'A self-hosted records builder for one business: typed records, relationships, forms and saved views in a private workspace you run and change yourself. An open source alternative to Airtable and Smartsheet.'

export async function sitePages({ styles, contract }: SiteContext): Promise<SiteBuild> {
  const document = (title: string, summary: string, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{title}</title><meta name="description" content={summary} />
      <link rel="preload" href="/fonts/lexend.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
      {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}</head>
      <body><div id="root"><SiteVariantProvider value="site">{body}</SiteVariantProvider></div></body></html>)
  const docs = await import('virtual:cradle-docs')
  if (docs.problem) throw new Error(docs.problem)
  const page = async (slug: string) => {
    const data: DocsPageData = (await docs.pages[slug]!()).default
    const head = docsHead(data).meta!
    return document(head[0]!.title!, head[1]!.content!, <DocsLayout config={seedConfig} page={data} sections={docs.sections} repository={docs.repository} version={docs.version} />)
  }
  const slugs = Object.keys(docs.pages).filter(slug => slug)
  return {
    pages: [
      { path: '/', html: document(`${seedConfig.productName}, a self-hosted records builder`, description, <Landing productName={seedConfig.productName} landingMessage={seedConfig.landingMessage} showCredit={seedConfig.showPoweredByCredit} />) },
      { path: '/run', html: runPageHtml(identity, run, contract) },
      ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, run, contract) }] : []),
      { path: '/docs', html: await page('') },
      ...await Promise.all(slugs.map(async slug => ({ path: `/docs/${slug}`, html: await page(slug) }))),
      { path: '/404', html: siteNotFoundHtml(identity, run, contract) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'favicon.ico', 'apple-touch-icon.png'],
  }
}
