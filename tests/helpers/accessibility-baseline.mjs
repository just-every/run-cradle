import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { saveScreenshotScroll, normalizeScreenshotScroll, screenshotComparisonState, restoreScreenshotScroll } from './accessibility-screenshot-state.mjs'
import { stringifySafeEvidence } from './accessibility-redaction.mjs'

const comparisons = [
  {
    name: 'timeline-milestone-hit-width',
    selector: '[aria-labelledby="timeline-title"] a.absolute',
    revert: '[aria-labelledby="timeline-title"] a.absolute { min-width: 0 !important; }',
  },
  {
    name: 'base-import-native-disclosures',
    selector: '.cr-base-import details > summary',
    revert: '.cr-base-import details:not(.cr-detail) > summary { min-height: initial !important; }',
  },
  {
    name: 'records-table-primary-links',
    selector: '.cr-records-page .cr-table td > a',
    revert: '.cr-records-page .cr-table td > a { display: inline !important; align-items: initial !important; min-height: 0 !important; }',
  },
  {
    name: 'records-base-export-summary',
    selector: '.cr-export-base > summary',
    revert: '.cr-export-base > summary { min-height: initial !important; }',
  },
  {
    name: 'records-boolean-checkbox',
    selector: '.cr-boolean input[type="checkbox"]',
    revert: '.cr-boolean input[type="checkbox"] { width: 22px !important; min-height: 22px !important; height: 22px !important; }',
  },
  {
    name: 'record-chip-wrapping',
    selector: '.cr-record-chip',
    revert: '.cr-record-chip { max-width: none !important; overflow-wrap: normal !important; }',
  },
  {
    name: 'shared-record-detail-links-and-text',
    selector: '.cr-detail a, .cr-detail p, .cr-link',
    revert: '.cr-detail a, .cr-link { display: inline !important; align-items: initial !important; max-width: none !important; min-height: 0 !important; overflow-wrap: normal !important; } .cr-detail p { overflow-wrap: normal !important; }',
  },
  {
    name: 'portfolio-header-actions',
    selector: '.portfolio-section-card > header > a, .portfolio-section-action > a',
    revert: '.portfolio-section-card > header > a, .portfolio-section-action > a { display: inline !important; align-items: initial !important; min-height: 0 !important; max-width: none !important; overflow-wrap: normal !important; }',
  },
  {
    name: 'portfolio-activity-disclosure-summary',
    selector: '.portfolio-activity-list details > summary',
    revert: '.portfolio-activity-list details > summary { min-height: initial !important; padding: initial !important; }',
  },
  {
    name: 'footer-credit-link',
    selector: 'a[href="https://runeditrun.com"]',
    revert: 'a[href="https://runeditrun.com"] { display: inline !important; align-items: initial !important; min-height: 0 !important; }',
  },
]

const safeName = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 96)

export async function captureRevertedStyleBaseline(page, { screen, width, output } = {}) {
  if (!output || ![1440, 390].includes(width)) return { captured: false, reason: 'No requested before/after screenshot width.' }

  const present = await page.evaluate(entries => entries.map(({ name, selector, revert }) => ({
    name,
    selector,
    revert,
    matchingNodes: document.querySelectorAll(selector).length,
  })).filter(entry => entry.matchingNodes > 0), comparisons)
  if (!present.length) return { captured: false, reason: 'No changed geometry selector is present on this screen.' }

  const savedScroll = await saveScreenshotScroll(page)
  const style = await page.addStyleTag({ content: present.map(entry => entry.revert).join('\n') })
  const file = `a11y-before-css-${safeName(screen)}-${width}.png`
  const restoredScreenshot = `a11y-after-css-${safeName(screen)}-${width}.png`
  const receipt = {
    screen,
    width,
    screenshot: file,
    restoredScreenshot,
    sourceHead: process.env.CRADLE_A11Y_SOURCE_HEAD || null,
    comparison: 'Final-source DOM and data with only the listed geometry declarations reverted. Matched scroll/focus state with a restored-CSS screenshot captured immediately after removal of these overrides, before the keyboard audit. This does not recreate an earlier application content state.',
    revertedStyles: present.map(({ name, selector, matchingNodes }) => ({ name, selector, matchingNodes })),
  }
  try {
    await normalizeScreenshotScroll(page, savedScroll)
    const before = await screenshotComparisonState(page, savedScroll)
    await page.screenshot({ path: path.join(output, file), fullPage: true })
    await style.evaluate(element => element.remove())
    await normalizeScreenshotScroll(page, savedScroll)
    const after = await screenshotComparisonState(page, savedScroll)
    assert.equal(before.sameFocusedNode && after.sameFocusedNode, true, 'Controlled CSS comparison must preserve the actual focused DOM node.')
    assert.equal(after.content === before.content, true, 'Controlled CSS comparison must retain document content.')
    const { content: afterContent, ...afterState } = after
    const { content: beforeContent, ...beforeState } = before
    assert.deepEqual(afterState, beforeState, 'Controlled CSS comparison must retain focus and scroll state.')
    await page.screenshot({ path: path.join(output, restoredScreenshot), fullPage: true })
    const { content, ...state } = before
    receipt.matchedState = state
    receipt.contentUnchanged = true
    receipt.keyboardAuditScreenshot = 'The separate a11y-<screen>-<width>.png records post-keyboard/scroll-audit state and is not the restored-CSS side of this controlled pair.'
  } finally {
    await style.evaluate(element => element.remove()).catch(() => {})
    await restoreScreenshotScroll(page, savedScroll)
  }
  await writeFile(path.join(output, `a11y-before-css-${safeName(screen)}-${width}.json`), stringifySafeEvidence(receipt))
  return { captured: true, screenshot: file, restoredScreenshot, revertedStyles: receipt.revertedStyles }
}
