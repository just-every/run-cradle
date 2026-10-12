import { waitForResourcePanels } from './accessibility-readiness.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { axeReport, measureAccessibilityLayout } from './accessibility-axe.mjs'
import { captureRevertedStyleBaseline } from './accessibility-baseline.mjs'
import { accessibilityCaptureOnly, activateByKeyboard, keyboardOrder } from './accessibility-keyboard.mjs'
import { stringifySafeEvidence } from './accessibility-redaction.mjs'

let disclosureProbe = 0
const maximumDisclosureVisits = 256
const clean = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72)

async function settleDisclosure(page) {
  // Native toggle dispatch and React's lazy-panel effect run after the click.
  // Measure the next real Tab target after those reads and layout have settled.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.waitForLoadState('networkidle')
  await waitForResourcePanels(page)
}

export async function auditDisclosureDetails(page, { screen, width, output, audit = true } = {}) {
  const openModal = await page.evaluate(() => Boolean(document.querySelector('dialog[open],[role="dialog"][aria-modal="true"],[aria-modal="true"]')))
  if (openModal) return { applicable: false, reason: 'Open modal disclosures are audited inside their dialog journey.' }

  const marker = `a11y-details-${disclosureProbe++}`
  const originalTabIndex = await page.locator('body').getAttribute('tabindex')
  const inventory = []
  async function discoverDisclosures() {
    const discovered = await page.evaluate(({ marker, inventory }) => {
      const details = [...document.querySelectorAll('details')].filter(element => element.querySelector(':scope > summary'))
      const siblings = new Map()
      const discovered = []
      for (const element of details) {
        const parent = element.parentElement?.closest('details') || null
        const siblingIndex = siblings.get(parent) || 0
        siblings.set(parent, siblingIndex + 1)
        if (element.getAttribute('data-cradle-a11y-details')?.startsWith(`${marker}-`)) continue
        const name = (element.querySelector(':scope > summary')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160)
        const parentMarker = parent?.getAttribute('data-cradle-a11y-details') || null
        // A native parent close may unmount a lazy child. Its disclosure-tree
        // position and name retain the original state when the child remounts.
        const retained = inventory.find(entry => entry.parentMarker === parentMarker && entry.siblingIndex === siblingIndex && entry.name === name)
        const key = retained?.marker || `${marker}-${inventory.length + discovered.length}`
        element.setAttribute('data-cradle-a11y-details', key)
        if (!retained) discovered.push({ marker: key, name, initiallyOpen: element.open, parentMarker, siblingIndex })
      }
      return discovered
    }, { marker, inventory })
    inventory.push(...discovered)
  }
  const opened = []
  const activations = []
  const processed = new Set()
  let stateAudit
  const expandedStates = []

  async function auditExpandedState(suffix = '') {
    const baselineCssComparison = await captureRevertedStyleBaseline(page, { screen: `${screen}-details${suffix}`, width, output })
    const axe = await axeReport(page)
    const layout = await measureAccessibilityLayout(page)
    const keyboard = await keyboardOrder(page)
    const result = { screen, width, baselineCssComparison, axe, layout, keyboard }
    if (output) {
      await mkdir(output, { recursive: true })
      const name = `a11y-${clean(screen)}-details${suffix}-${width}`
      await writeFile(path.join(output, `${name}.json`), stringifySafeEvidence(result))
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
    }
    if (!accessibilityCaptureOnly) {
      const severe = [...axe.wcag22aa, ...axe.targetSize].filter(item => ['serious', 'critical'].includes(item.impact))
      assert.deepEqual(severe.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes })), [], `${screen} ${width}: expanded disclosures have no serious/critical axe findings`)
      assert.deepEqual([...axe.wcag22aa, ...axe.targetSize], [], `${screen} ${width}: expanded disclosures have no untriaged axe findings`)
      assert.equal(layout.pageOverflow, false, `${screen} ${width}: expanded disclosures do not overflow the viewport`)
      assert.deepEqual(layout.unnamedControls, [], `${screen} ${width}: expanded disclosure controls have accessible names`)
      assert.deepEqual(layout.targetsBelow24, [], `${screen} ${width}: every active expanded-disclosure pointer target must measure at least 24x24px`)
      assert.equal(keyboard.skipped, undefined, `${screen} ${width}: expanded disclosures must run through keyboard audit`)
      assert.deepEqual(keyboard.missing, [], `${screen} ${width}: expanded disclosure actions must all be reachable by Tab`)
      assert.deepEqual(keyboard.focusWithoutVisibleStyle, [], `${screen} ${width}: expanded disclosure actions must show visible focus`)
      assert.deepEqual(keyboard.focusOutsideViewport, [], `${screen} ${width}: expanded disclosure actions must remain in the viewport`)
    }
    return result
  }

  try {
    // Opening a lazy panel can mount nested disclosures. Rediscover after each
    // settled activation, but fail loudly rather than traverse an endless page.
    for (let index = 0; index <= maximumDisclosureVisits; index++) {
      await discoverDisclosures()
      const candidateKey = await page.evaluate(({ marker, processed }) => {
        const visibleSummary = (summary, owner) => {
          const style = getComputedStyle(summary)
          const rect = summary.getBoundingClientRect()
          const closedOuterDisclosure = owner.parentElement?.closest('details:not([open])')
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0 && !summary.closest('[hidden],[inert],[aria-hidden="true"]') && !closedOuterDisclosure
        }
        const entries = [...document.querySelectorAll(`details[data-cradle-a11y-details^="${marker}-"]`)]
        const candidate = entries.find(element => !processed.includes(element.getAttribute('data-cradle-a11y-details')) && visibleSummary(element.querySelector(':scope > summary'), element))
        return candidate?.getAttribute('data-cradle-a11y-details') || null
      }, { marker, processed: [...processed] })
      if (!candidateKey) break
      assert.ok(index < maximumDisclosureVisits, `${screen} ${width}: disclosure traversal exceeded ${maximumDisclosureVisits} distinct visible panels`)

      const item = inventory.find(entry => entry.marker === candidateKey)
      const candidate = { key: candidateKey, initiallyOpen: item.initiallyOpen }
      const summary = page.locator(`[data-cradle-a11y-details="${candidate.key}"] > summary`)
      const disclosure = page.locator(`[data-cradle-a11y-details="${candidate.key}"]`)
      if (candidate.initiallyOpen && !await disclosure.evaluate(element => element.open)) {
        const restored = await activateByKeyboard(page, summary, 'Space')
        await settleDisclosure(page)
        assert.equal(await disclosure.evaluate(element => element.open), true, `Space must restore remounted disclosure: ${item.name}`)
        activations.push({ marker: candidate.key, name: item.name, restoredBy: restored.key, activationObserved: restored.activationObserved, focus: restored.focus })
      }
      const activation = await activateByKeyboard(page, summary, 'Space')
      await settleDisclosure(page)
      const expanded = await disclosure.evaluate(element => element.open)
      if (candidate.initiallyOpen) {
        assert.equal(expanded, false, `Space must close initially open disclosure: ${item?.name || '<unnamed>'}`)
        const reopen = await activateByKeyboard(page, summary, 'Space')
        await settleDisclosure(page)
        assert.equal(await disclosure.evaluate(element => element.open), true, `Space must restore initially open disclosure: ${item?.name || '<unnamed>'}`)
        activations.push({ marker: candidate.key, name: item?.name || '<unnamed>', initiallyOpen: true, closedBy: activation.key, reopenedBy: reopen.key, activationObserved: activation.activationObserved && reopen.activationObserved, focus: reopen.focus })
      } else {
        assert.equal(expanded, true, `Space must open disclosure: ${item?.name || '<unnamed>'}`)
        opened.push(candidate.key)
        activations.push({ marker: candidate.key, name: item?.name || '<unnamed>', initiallyOpen: false, openedBy: activation.key, activationObserved: activation.activationObserved, focus: activation.focus })
      }
      processed.add(candidate.key)
      if (audit) expandedStates.push({ marker: candidate.key, name: item.name, audit: await auditExpandedState(`-state-${processed.size}`) })
    }

    if (audit && processed.size) stateAudit = await auditExpandedState()
  } finally {
    for (const key of opened.reverse()) {
      const details = page.locator(`[data-cradle-a11y-details="${key}"]`)
      const isOpen = await details.evaluate(element => element.open).catch(() => false)
      if (!isOpen) continue
      const item = inventory.find(entry => entry.marker === key)
      const activation = await activateByKeyboard(page, details.locator(':scope > summary'), 'Space')
      await settleDisclosure(page)
      const collapsed = await details.evaluate(element => !element.open)
      assert.equal(collapsed, true, `Space must close disclosure: ${item?.name || '<unnamed>'}`)
      activations.push({ marker: key, name: item?.name || '<unnamed>', closedBy: activation.key, activationObserved: activation.activationObserved, focus: activation.focus })
    }
    for (const item of inventory.filter(entry => entry.initiallyOpen)) {
      await discoverDisclosures()
      const details = page.locator(`[data-cradle-a11y-details="${item.marker}"]`)
      if (await details.evaluate(element => element.open)) continue
      const activation = await activateByKeyboard(page, details.locator(':scope > summary'), 'Space')
      await settleDisclosure(page)
      assert.equal(await details.evaluate(element => element.open), true, `Space must retain original open disclosure: ${item.name}`)
      activations.push({ marker: item.marker, name: item.name, restoredBy: activation.key, activationObserved: activation.activationObserved, focus: activation.focus })
    }
    await page.evaluate(({ marker, originalTabIndex }) => {
      document.querySelectorAll(`[data-cradle-a11y-details^="${CSS.escape(marker)}-"]`).forEach(element => element.removeAttribute('data-cradle-a11y-details'))
      if (originalTabIndex === null) document.body.removeAttribute('tabindex')
      else document.body.setAttribute('tabindex', originalTabIndex)
    }, { marker, originalTabIndex }).catch(() => {})
  }

  return {
    applicable: true,
    inventory,
    openedByKeyboard: activations.filter(item => item.openedBy || item.reopenedBy),
    closedByKeyboard: activations.filter(item => item.closedBy || item.toggledClosedBy),
    restoredByKeyboard: activations.filter(item => item.restoredBy),
    expandedStates,
    audit: stateAudit,
  }
}
