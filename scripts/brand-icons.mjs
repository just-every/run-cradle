// Writes the Cradle icon files from the one P3 geometry (src/core/app/ui/brand-geometry.ts):
//   src/core/app/favicon.svg and public/favicon.ico (16, 32, 48), both the bare mark on a transparent background, and
//   public/apple-touch-icon.png (180), the mark on the opaque dark tile (iOS renders transparency as black), and
//   public/brand/mark.svg, the mark for paper grounds, which public/rer-theme.css names as the installer's --rer-logo.
// Run with `pnpm brand:icons`. PNGs are rendered with the repository's Playwright Chromium.
import './typescript-loader.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { p3Svg, p3FaviconSvg } = await import('../src/core/app/ui/brand-geometry.ts')

const icoSizes = [16, 32, 48]
const appleTouchSize = 180

const render = async (browser, svg, size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  try {
    const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
    await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${sized}</body>`)
    return await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  } finally {
    await page.close()
  }
}

/** An ICO container holding one PNG image per size. */
const ico = (images) => {
  const head = Buffer.alloc(6 + 16 * images.length)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i
    head.writeUInt8(size, at)
    head.writeUInt8(size, at + 1)
    head.writeUInt16LE(1, at + 4)
    head.writeUInt16LE(32, at + 6)
    head.writeUInt32LE(png.length, at + 8)
    head.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([head, ...images.map(({ png }) => png)])
}

const browser = await chromium.launch()
try {
  const bare = p3FaviconSvg()
  const images = []
  for (const size of icoSizes) images.push({ size, png: await render(browser, bare, size) })
  await mkdir(path.join(root, 'public'), { recursive: true })
  await writeFile(path.join(root, 'src/core/app/favicon.svg'), bare + '\n')
  await writeFile(path.join(root, 'public/favicon.ico'), ico(images))
  // iOS rounds the touch icon itself, so it is the tile full-bleed (no transparent corners).
  await writeFile(path.join(root, 'public/apple-touch-icon.png'), await render(browser, p3Svg('tile', 0), appleTouchSize))
  await mkdir(path.join(root, 'public/brand'), { recursive: true })
  await writeFile(path.join(root, 'public/brand/mark.svg'), p3Svg('paper') + '\n')
} finally {
  await browser.close()
}
console.log('wrote src/core/app/favicon.svg, public/favicon.ico, public/apple-touch-icon.png, public/brand/mark.svg')
