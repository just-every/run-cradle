import { waitForResourcePanels } from './accessibility-readiness.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { axeReport, accessibilityTags, measureAccessibilityLayout } from './accessibility-axe.mjs'
import { auditDisclosureDetails } from './accessibility-disclosures.mjs'
import { verifyNavigationDrawerWithKeyboard as verifyDrawer } from './accessibility-dialog.mjs'
import {
  accessibilityCaptureOnly,
  accessibilityEvidence,
  accessibilityAction,
  accessibilitySetChecked,
  installKeyboardInteractions,
  keyboardActivationInventory,
  keyboardOrder,
  interactiveControlsSelector,
} from './accessibility-keyboard.mjs'
import { accessibilityInputInventory } from './accessibility-input.mjs'
import { captureRevertedStyleBaseline } from './accessibility-baseline.mjs'
import { stringifySafeEvidence } from './accessibility-redaction.mjs'

export { accessibilityTags, accessibilityAction, accessibilitySetChecked, interactiveControlsSelector }
export const accessibilityWidths = accessibilityEvidence ? [1440, 768, 390] : [1440, 390]
export { accessibilityEvidence, accessibilityCaptureOnly }

export function accessibilityContextOptions(options = {}) {
  if (!accessibilityEvidence) return options
  return { ...options, locale: 'en-AU', timezoneId: 'Australia/Brisbane' }
}

const clean = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 96)

export async function auditAccessibility(page, { screen, width, output, screenshot = true, keyboard = true, keyboardAudit = keyboardOrder } = {}) {
  installKeyboardInteractions(page)
  await waitForResourcePanels(page)
  const baselineCssComparison = await captureRevertedStyleBaseline(page, { screen, width, output })
  const axe = await axeReport(page)
  const layout = await measureAccessibilityLayout(page)
  const keyboardResult = keyboard ? await keyboardAudit(page) : { notRun: true }
  const disclosures = await auditDisclosureDetails(page, { screen, width, output, audit: keyboard })
  keyboardResult.disclosures = disclosures
  const currentRoute = await page.evaluate(() => ({ path: location.pathname, hasQuery: location.search.length > 0 }))
  const browserEnvironment = await page.evaluate(() => ({
    language: navigator.language,
    languages: [...navigator.languages],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
  }))
  const activations = keyboardActivationInventory(page)
  const routeActivations = activations.filter(item => item.path === currentRoute.path && item.hasQuery === currentRoute.hasQuery && item.width === width)
  const actionKey = item => [item.tag || '', item.role || '', item.name || '', item.linkPath || '', item.linkHasQuery ?? ''].join('|')
  const usedActivations = new Set()
  const inputEntries = accessibilityInputInventory(page).filter(item => item.path === currentRoute.path && item.hasQuery === currentRoute.hasQuery && item.width === width)
  const usedInputEntries = new Set()
  const actionInventory = keyboardResult.keyboardOrder ?? []
  const actionReachability = actionInventory.map(item => {
    const key = actionKey(item)
    const activationIndex = routeActivations.findIndex((candidate, index) => !usedActivations.has(index) && actionKey(candidate) === key)
    if (activationIndex >= 0) usedActivations.add(activationIndex)
    const dataEntry = item.tag === 'textarea' || (item.tag === 'input' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'image'].includes(item.type)) || item.tag === 'select'
    const inputControl = item.tag === 'textarea'
      ? 'textarea'
      : item.tag === 'select'
        ? 'select'
        : item.type === 'file'
          ? 'file input'
          : item.type || 'text'
    const inputEntryIndex = dataEntry
      ? inputEntries.findIndex((candidate, index) => !usedInputEntries.has(index) && candidate.name === item.name && candidate.control === inputControl)
      : -1
    if (inputEntryIndex >= 0) usedInputEntries.add(inputEntryIndex)
    return {
      action: { tag: item.tag, role: item.role, name: item.name, ...(item.linkPath ? { linkPath: item.linkPath, linkHasQuery: item.linkHasQuery } : {}) },
      reachedByTab: item.reached,
      keyboardActivated: activationIndex >= 0,
      ...(dataEntry ? { keyboardEntry: inputEntryIndex >= 0 ? inputEntries[inputEntryIndex] : null } : {}),
    }
  })
  const report = {
    screen,
    width,
    viewportWidth: await page.evaluate(() => innerWidth),
    baselineCssComparison,
    browserEnvironment,
    axe,
    layout,
    keyboard: {
      ...keyboardResult,
      actionCoverage: {
        currentRoutePath: currentRoute.path,
        currentRouteHasQuery: currentRoute.hasQuery,
        tabStopInventory: actionInventory,
        keyboardActivated: routeActivations,
        actions: actionReachability,
        unexercisedActions: actionReachability.filter(item => !item.keyboardActivated && !('keyboardEntry' in item)).map(item => item.action),
        unexercisedInputFields: actionReachability.filter(item => 'keyboardEntry' in item && !item.keyboardEntry).map(item => item.action),
        routeActivationCoverageNote: 'Activation is matched by control tag, role, accessible name, and safe destination pathname/query-presence; duplicate action instances remain individually listed when not exercised.',
        keyboardInputEntries: inputEntries,
      },
      activations,
    },
  }
  if (output) {
    await mkdir(output, { recursive: true })
    const name = `a11y-${clean(screen)}-${width}`
    await writeFile(path.join(output, `${name}.json`), stringifySafeEvidence(report))
    if (screenshot) await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
  }

  if (!accessibilityCaptureOnly) {
    const severe = [...axe.wcag22aa, ...axe.targetSize].filter(item => ['serious', 'critical'].includes(item.impact))
    assert.deepEqual(severe.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes })), [], `${screen} ${width}: axe WCAG and target-size serious/critical findings`)
    assert.deepEqual([...axe.wcag22aa, ...axe.targetSize], [], `${screen} ${width}: all axe WCAG and target-size violations must be fixed`)
    assert.equal(layout.pageOverflow, false, `${screen} ${width}: document must not overflow the viewport`)
    assert.deepEqual(layout.unnamedControls, [], `${screen} ${width}: every visible action control needs an accessible name`)
    assert.deepEqual(layout.targetsBelow24, [], `${screen} ${width}: every active pointer target must provide a measured 24x24px hit region; WCAG exception diagnostics do not satisfy this campaign's stricter target floor`)
  }
  if (keyboard && !accessibilityCaptureOnly) {
    assert.equal(keyboardResult.skipped, undefined, `${screen} ${width}: keyboard audit may not be skipped`)
    assert.deepEqual(keyboardResult.missing, [], `${screen} ${width}: Tab must reach every visible, enabled action control`)
    assert.deepEqual(keyboardResult.focusWithoutVisibleStyle, [], `${screen} ${width}: every focused action needs a visible focus change`)
    assert.deepEqual(keyboardResult.focusOutsideViewport, [], `${screen} ${width}: every focused action must be visible in the viewport`)
  }
  return report
}

export async function verifyNavigationDrawerWithKeyboard(page, options = {}) {
  return verifyDrawer(page, { ...options, captureOnly: accessibilityCaptureOnly, audit: auditAccessibility })
}
