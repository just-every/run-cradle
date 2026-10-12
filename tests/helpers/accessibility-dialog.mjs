import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { stringifySafeEvidence } from './accessibility-redaction.mjs'
import path from 'node:path'
import { activateByKeyboard, interactiveControlsSelector, recordKeyboardActivation } from './accessibility-keyboard.mjs'
import { visibleFocusDelta } from './accessibility-focus.mjs'

function boxStyle(element) {
  const style = getComputedStyle(element)
  return {
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    outlineColor: style.outlineColor,
    outlineOffset: style.outlineOffset,
    boxShadow: style.boxShadow,
    borderWidth: style.borderWidth,
    borderColor: style.borderColor,
    backgroundColor: style.backgroundColor,
  }
}

function hasVisibleFocusStyle(style) {
  const painted = value => {
    if (!value || value === 'none' || value === 'transparent') return false
    const colors = [...value.matchAll(/rgba?\(([^)]+)\)/g)].map(match => match[1])
    return !colors.length || colors.some(match => {
      const channels = match.split(/[\s,/]+/).filter(Boolean)
      return Number.parseFloat(channels.at(-1)) > 0
    })
  }
  return (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 && painted(style.outlineColor))
    || (style.boxShadow !== 'none' && painted(style.boxShadow))
}

async function focusedAction(dialog, expectedKey) {
  return dialog.evaluate((element, expectedKey) => {
    const active = document.activeElement
    const style = getComputedStyle(active)
    const rect = active.getBoundingClientRect()
    return {
      key: active.getAttribute('data-cradle-a11y-dialog-action'),
      name: active.getAttribute('aria-label') || (active.labels ? [...active.labels].map(label => label.innerText).join(' ') : '') || active.innerText || '',
      tag: active.tagName.toLowerCase(),
      focusVisible: active.matches(':focus-visible'),
      style: {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        boxShadow: style.boxShadow,
        borderWidth: style.borderWidth,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
      },
      inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
      expectedKey,
    }
  }, expectedKey)
}

async function expandDialogDisclosures(page, drawer) {
  const marker = `a11y-dialog-details-${Math.random().toString(36).slice(2)}`
  const inventory = await drawer.locator('details').evaluateAll((details, marker) => details.map((element, index) => {
    const key = `${marker}-${index}`
    element.setAttribute('data-cradle-a11y-dialog-details', key)
    return { key, name: element.querySelector(':scope > summary')?.textContent.trim().replace(/\s+/g, ' ') || '<unnamed>', initiallyOpen: element.open }
  }), marker)
  const opened = []
  const toggledInitiallyOpen = new Set()
  try {
    for (let index = 0; index < inventory.length; index++) {
      const candidate = await drawer.evaluate(({ marker, toggledInitiallyOpen }) => {
        const visibleSummary = (summary, owner) => {
          const style = getComputedStyle(summary)
          const rect = summary.getBoundingClientRect()
          const closedOuter = owner.parentElement?.closest('details:not([open])')
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0 && !closedOuter
        }
        const entries = [...document.querySelectorAll(`dialog.operator-drawer details[data-cradle-a11y-dialog-details^="${marker}-"]`)]
        const openToExercise = entries.find(element => element.open && !toggledInitiallyOpen.includes(element.getAttribute('data-cradle-a11y-dialog-details')) && visibleSummary(element.querySelector(':scope > summary'), element))
        if (openToExercise) return { key: openToExercise.getAttribute('data-cradle-a11y-dialog-details'), initiallyOpen: true }
        const closedToOpen = entries.find(element => !element.open && visibleSummary(element.querySelector(':scope > summary'), element))
        return closedToOpen ? { key: closedToOpen.getAttribute('data-cradle-a11y-dialog-details'), initiallyOpen: false } : null
      }, { marker, toggledInitiallyOpen: [...toggledInitiallyOpen] })
      if (!candidate) break
      const key = candidate.key
      const summary = drawer.locator(`[data-cradle-a11y-dialog-details="${key}"] > summary`)
      const item = inventory.find(entry => entry.key === key)
      const activation = await activateByKeyboard(page, summary, 'Space')
      const disclosure = drawer.locator(`[data-cradle-a11y-dialog-details="${key}"]`)
      if (candidate.initiallyOpen) {
        assert.equal(await disclosure.evaluate(element => element.open), false, `Space must close initially open dialog disclosure: ${item?.name || '<unnamed>'}`)
        const reopen = await activateByKeyboard(page, summary, 'Space')
        assert.equal(await disclosure.evaluate(element => element.open), true, `Space must restore initially open dialog disclosure: ${item?.name || '<unnamed>'}`)
        toggledInitiallyOpen.add(key)
        opened.push({ name: item?.name || '<unnamed>', initiallyOpen: true, closedBy: activation.key, reopenedBy: reopen.key, activationObserved: activation.activationObserved && reopen.activationObserved, focus: reopen.focus })
      } else {
        assert.equal(await disclosure.evaluate(element => element.open), true, `Space must open dialog disclosure: ${item?.name || '<unnamed>'}`)
        opened.push({ name: item?.name || '<unnamed>', initiallyOpen: false, key: activation.key, activationObserved: activation.activationObserved, focus: activation.focus })
      }
    }
    return { applicable: inventory.length > 0, inventory, openedByKeyboard: opened }
  } finally {
    await drawer.locator('[data-cradle-a11y-dialog-details]').evaluateAll(elements => elements.forEach(element => element.removeAttribute('data-cradle-a11y-dialog-details')))
  }
}

export async function verifyNavigationDrawerWithKeyboard(page, { output, screen = 'navigation-drawer', audit, captureOnly = false } = {}) {
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true })
  assert.ok(await trigger.isVisible().catch(() => false), 'The mobile navigation drawer must be available at the tested drawer viewport.')
  const drawer = page.locator('dialog.operator-drawer')
  if (captureOnly) {
    await trigger.click()
    await drawer.waitFor({ state: 'visible' })
    const disclosures = await expandDialogDisclosures(page, drawer)
    assert.ok(audit, 'The dialog must have its own automated axe and target-size report.')
    const dialogAudit = await audit(page, { screen, width: page.viewportSize()?.width ?? 0, output, keyboard: false })
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden' })
    return {
      applicable: true,
      baselineOnly: true,
      reason: 'This opt-in pass records before-fix dialog pixels and axe/geometry without keyboard enforcement.',
      disclosures,
      axeFindingCount: dialogAudit.axe.wcag22aa.length,
      targetSizeFindingCount: dialogAudit.axe.targetSize.length,
      targetGeometryBelow24: dialogAudit.layout.targetsBelow24,
    }
  }
  const opening = await activateByKeyboard(page, trigger, 'Enter')
  await drawer.waitFor({ state: 'visible' })
  const initialFocus = await drawer.evaluate(element => {
    const active = document.activeElement
    return {
      inside: element.contains(active),
      key: active?.getAttribute('data-cradle-a11y-dialog-action') || null,
      tag: active?.tagName.toLowerCase() || null,
      name: active?.getAttribute('aria-label') || active?.innerText || active?.id || '',
      focusVisible: active instanceof HTMLElement && active.matches(':focus-visible'),
    }
  })
  assert.ok(initialFocus.inside, 'Opening navigation must place focus inside the dialog.')
  const disclosures = await expandDialogDisclosures(page, drawer)
  assert.ok(audit, 'The dialog must have its own automated axe and target-size report.')
  const dialogAudit = await audit(page, { screen, width: page.viewportSize()?.width ?? 0, output, keyboard: false })
  const severe = [...dialogAudit.axe.wcag22aa, ...dialogAudit.axe.targetSize].filter(item => ['serious', 'critical'].includes(item.impact))
  assert.deepEqual(severe.map(item => item.id), [], `${screen}: WCAG 2.2 AA and target-size serious/critical findings`)
  assert.deepEqual(dialogAudit.layout.targetsBelow24, [], `${screen}: every active dialog pointer target must measure at least 24x24px`)

  const actions = await drawer.locator(interactiveControlsSelector).evaluateAll(elements => {
    const visible = element => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const closedDetails = element.closest('details:not([open])')
      const visibleSummary = closedDetails && element.tagName === 'SUMMARY' && element.parentElement === closedDetails
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0 && !element.closest('[hidden],[inert],[aria-hidden="true"]') && (!closedDetails || visibleSummary)
    }
    const radioGroups = new Map()
    for (const element of elements) {
      if (element.tagName !== 'INPUT' || element.type !== 'radio' || !element.name) continue
      const owner = element.form || document
      const names = radioGroups.get(owner) || new Map()
      if (!names.has(element.name)) {
        const radios = elements.filter(radio => radio.tagName === 'INPUT' && radio.type === 'radio' && radio.name === element.name && (radio.form || document) === owner)
        names.set(element.name, radios.find(radio => radio.checked) || radios[0])
      }
      radioGroups.set(owner, names)
    }
    return elements.filter(element => visible(element) && element.tabIndex >= 0 && !element.disabled && element.getAttribute('aria-disabled') !== 'true').filter(element => {
      if (element.tagName !== 'INPUT' || element.type !== 'radio' || !element.name) return true
      const owner = element.form || document
      return radioGroups.get(owner)?.get(element.name) === element
    }).map((element, index) => {
      const key = `dialog-action-${index}`
      element.setAttribute('data-cradle-a11y-dialog-action', key)
      const labelledBy = element.getAttribute('aria-labelledby')
      return {
        key,
        name: element.getAttribute('aria-label') || (labelledBy && document.getElementById(labelledBy)?.innerText) || (element.labels ? [...element.labels].map(label => label.innerText).join(' ') : '') || element.innerText || element.getAttribute('title') || '',
        tag: element.tagName.toLowerCase(),
      }
    })
  })
  assert.ok(actions.length > 0, 'Navigation dialog must expose keyboard actions.')
  const activeKey = () => drawer.evaluate(element => element.contains(document.activeElement) ? document.activeElement.getAttribute('data-cradle-a11y-dialog-action') : null)
  const initialKey = await activeKey()
  await page.evaluate(() => {
    window.__cradleA11yDialogKeys = []
    document.addEventListener('keydown', event => {
      const modal = document.querySelector('dialog.operator-drawer[open]')
      if (event.key !== 'Tab' || !modal) return
      const active = document.activeElement
      const entry = {
        key: event.key,
        shiftKey: event.shiftKey,
        activeBefore: active instanceof HTMLElement ? {
          tag: active.tagName.toLowerCase(),
          name: active.tagName === 'BODY' ? '<body>' : active.getAttribute('aria-label') || active.innerText || active.id || '',
          marker: active.getAttribute('data-cradle-a11y-dialog-action'),
        } : null,
      }
      window.__cradleA11yDialogKeys.push(entry)
      queueMicrotask(() => {
        const next = document.activeElement
        entry.withinOpenModalAfterDispatch = Boolean(modal.isConnected && modal.open && modal.contains(next))
        entry.activeAfter = next instanceof HTMLElement ? {
          tag: next.tagName.toLowerCase(),
          name: next.tagName === 'BODY' ? '<body>' : next.getAttribute('aria-label') || next.innerText || next.id || '',
          marker: next.getAttribute('data-cradle-a11y-dialog-action'),
        } : null
      })
    }, true)
  })

  const actualFocusSequence = []
  const focusSnapshot = () => drawer.evaluate((element, selector) => {
    const active = document.activeElement
    return {
      insideDialog: element.contains(active),
      backgroundActionFocused: !element.contains(active)
        && active instanceof HTMLElement
        && active.matches(selector)
        && !active.matches(':disabled,[aria-disabled="true"]')
        && !active.closest('[hidden],[inert],[aria-hidden="true"]'),
      dialogOpen: element.open,
      modal: element.matches(':modal'),
      active: active instanceof HTMLElement ? {
        marker: active.getAttribute('data-cradle-a11y-dialog-action'),
        tag: active.tagName.toLowerCase(),
        name: active.tagName === 'BODY' ? '<body>' : active.getAttribute('aria-label') || active.innerText || active.id || '',
        linkPath: active instanceof HTMLAnchorElement ? new URL(active.href).pathname : undefined,
        linkHasQuery: active instanceof HTMLAnchorElement ? new URL(active.href).search.length > 0 : undefined,
        role: active.getAttribute('role') || '',
        focusVisible: active.matches(':focus-visible'),
        style: (() => {
          const style = getComputedStyle(active)
          return {
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            outlineColor: style.outlineColor,
            boxShadow: style.boxShadow,
          }
        })(),
      } : null,
    }
  }, interactiveControlsSelector)
  const pressDialogTab = async key => {
    await page.keyboard.press(key)
    await page.waitForTimeout(0)
    const snapshot = await focusSnapshot()
    assert.equal(snapshot.backgroundActionFocused, false, `${key} must not reach a background keyboard action while the modal is open: ${JSON.stringify(snapshot)}`)
    actualFocusSequence.push({ key, ...snapshot })
    return snapshot
  }
  await page.evaluate(selector => {
    window.__cradleA11yBackgroundActivations = []
    document.addEventListener('click', event => {
      const action = event.target instanceof Element ? event.target.closest(selector) : null
      const modal = document.querySelector('dialog.operator-drawer[open]')
      if (!action || modal?.contains(action)) return
      window.__cradleA11yBackgroundActivations.push({
        tag: action.tagName.toLowerCase(),
        name: action.getAttribute('aria-label') || action.innerText || action.getAttribute('title') || '',
      })
    }, true)
  }, interactiveControlsSelector)
  const moveToAction = async key => {
    const visited = new Set()
    for (let index = 0; index < actions.length * 3 + 8; index++) {
      if (await activeKey() === key) return
      const snapshot = await pressDialogTab('Tab')
      if (snapshot.active?.marker) visited.add(snapshot.active.marker)
      assert.ok(visited.size <= actions.length, `Tab traversal repeated before reaching ${key}: ${JSON.stringify(actualFocusSequence)}`)
    }
    assert.equal(await activeKey(), key, `Keyboard Tab must be able to reach dialog action ${key}: ${JSON.stringify(actualFocusSequence)}`)
  }
  const focusChecks = []
  const reachedActions = new Set()
  const checkFocusedAction = async action => {
    const item = await focusedAction(drawer, action.key)
    const visibleFocusIndicator = item.focusVisible && item.inViewport && hasVisibleFocusStyle(item.style)
    assert.ok(visibleFocusIndicator, `Dialog action ${action.name || action.tag} must show a visible focus indicator.`)
    reachedActions.add(action.key)
    focusChecks.push({ ...item, visibleFocusIndicator })
  }
  if (initialKey) {
    const first = actions.find(action => action.key === initialKey)
    if (first) await checkFocusedAction(first)
  }
  for (let index = 0; index < actions.length * 3 + 8 && reachedActions.size < actions.length; index++) {
    const current = await activeKey()
    const action = actions.find(entry => entry.key === current)
    if (action && !reachedActions.has(action.key)) await checkFocusedAction(action)
    const nextExpected = actions.find(entry => !reachedActions.has(entry.key))
    const baseline = nextExpected
      ? await drawer.locator(`[data-cradle-a11y-dialog-action="${nextExpected.key}"]`).evaluate(boxStyle)
      : null
    const snapshot = await pressDialogTab('Tab')
    if (snapshot.active?.marker) {
      const next = actions.find(entry => entry.key === snapshot.active.marker)
      if (next && !reachedActions.has(next.key)) {
        const item = await focusedAction(drawer, next.key)
        const visibleFocusIndicator = item.focusVisible && item.inViewport && (
          hasVisibleFocusStyle(item.style)
          || visibleFocusDelta(item.style, baseline)
        )
        assert.ok(visibleFocusIndicator, `Dialog action ${next.name || next.tag} must show a visible focus indicator.`)
        reachedActions.add(next.key)
        focusChecks.push({ ...item, visibleFocusIndicator })
      }
    }
  }
  assert.deepEqual(actions.filter(action => !reachedActions.has(action.key)).map(action => action.name || action.tag), [], `Actual Tab traversal must reach every dialog action: ${JSON.stringify(actualFocusSequence)}`)

  const boundaryTrace = {
    screen,
    width: page.viewportSize()?.width ?? 0,
    initialFocus,
    actionInventory: actions.map(({ key, ...action }) => action),
    focusBoundaryType: 'Actual Tab and Shift+Tab boundary samples below distinguish a visible in-dialog cycle from a native user-agent body focus pause.',
    humanVisibleFocusReviewRequired: true,
  }
  const saveBoundaryTrace = async () => {
    boundaryTrace.rawKeydownEventsWhileModalOpen = await page.evaluate(() => window.__cradleA11yDialogKeys)
    boundaryTrace.backgroundActivations = await page.evaluate(() => [...(window.__cradleA11yBackgroundActivations || [])])
    boundaryTrace.actualFocusSequence = actualFocusSequence
    if (!output) return
    await mkdir(output, { recursive: true })
    const safeName = screen.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    await writeFile(path.join(output, `a11y-${safeName}-${page.viewportSize()?.width ?? 0}-keyboard-boundary.json`), stringifySafeEvidence(boundaryTrace))
  }
  const recordBodyPause = async (direction, boundary) => {
    if (boundary.active?.tag !== 'body') return { applicable: false, direction, boundary }
    const keys = []
    for (const key of ['Enter', 'Space']) {
      await page.keyboard.press(key)
      await page.waitForTimeout(0)
      keys.push({ key, focus: await focusSnapshot() })
    }
    const evidence = {
      applicable: true,
      direction,
      boundary,
      focusMode: 'native user-agent body focus pause inside an open modal',
      focusVisible: false,
      keyboardKeysWithoutPreventingEvents: keys,
      backgroundActivationCount: await page.evaluate(() => window.__cradleA11yBackgroundActivations?.length ?? 0),
    }
    boundaryTrace.bodyPauseChecks ??= []
    boundaryTrace.bodyPauseChecks.push(evidence)
    await saveBoundaryTrace()
    return evidence
  }
  const verifyReturnedAction = async (label, snapshot, action) => {
    const focused = await focusedAction(drawer, action.key)
    const visibleFocusIndicator = focused.focusVisible && focused.inViewport && hasVisibleFocusStyle(focused.style)
    const evidence = { label, expected: action, snapshot, focused, visibleFocusIndicator }
    boundaryTrace.returns ??= []
    boundaryTrace.returns.push(evidence)
    await saveBoundaryTrace()
    assert.equal(snapshot.active?.marker, action.key, `${label} must return to the expected dialog action: ${JSON.stringify(snapshot.active)}`)
    assert.equal(focused.key, action.key, `${label} must measure visible focus on that same expected dialog action.`)
    assert.ok(visibleFocusIndicator, `${label} must restore visible focus on ${action.name || action.tag}.`)
    return evidence
  }
  await moveToAction(actions.at(-1).key)
  const forwardBoundary = await pressDialogTab('Tab')
  boundaryTrace.forwardBoundary = forwardBoundary
  await saveBoundaryTrace()
  if (forwardBoundary.active?.tag !== 'body') await verifyReturnedAction('Tab past the last dialog action', forwardBoundary, actions[0])
  const forwardCycle = await pressDialogTab('Tab')
  boundaryTrace.forwardCycle = forwardCycle
  await saveBoundaryTrace()
  if (forwardBoundary.active?.tag === 'body') await verifyReturnedAction('Tab from forward body pause', forwardCycle, actions[0])
  await moveToAction(actions.at(-1).key)
  const forwardRecoveryBoundary = await pressDialogTab('Tab')
  boundaryTrace.forwardRecoveryBoundary = forwardRecoveryBoundary
  await saveBoundaryTrace()
  const forwardRecovery = await pressDialogTab('Shift+Tab')
  boundaryTrace.forwardRecovery = forwardRecovery
  await saveBoundaryTrace()
  if (forwardRecoveryBoundary.active?.tag === 'body') await verifyReturnedAction('Shift+Tab after forward body pause', forwardRecovery, actions.at(-1))
  await moveToAction(actions.at(-1).key)
  const forwardActivationBoundary = await pressDialogTab('Tab')
  boundaryTrace.forwardActivationBoundary = forwardActivationBoundary
  await saveBoundaryTrace()
  const forwardPause = await recordBodyPause('Tab past last in-dialog action; Enter and Space tested without event prevention', forwardActivationBoundary)
  const forwardActivationRecovery = await pressDialogTab('Shift+Tab')
  boundaryTrace.forwardActivationRecovery = forwardActivationRecovery
  await saveBoundaryTrace()
  if (forwardActivationBoundary.active?.tag === 'body') await verifyReturnedAction('Shift+Tab after forward activation probe', forwardActivationRecovery, actions.at(-1))

  await moveToAction(actions[0].key)
  const reverseBoundary = await pressDialogTab('Shift+Tab')
  boundaryTrace.reverseBoundary = reverseBoundary
  await saveBoundaryTrace()
  if (reverseBoundary.active?.tag !== 'body') await verifyReturnedAction('Shift+Tab before the first dialog action', reverseBoundary, actions.at(-1))
  const reverseCycle = await pressDialogTab('Shift+Tab')
  boundaryTrace.reverseCycle = reverseCycle
  await saveBoundaryTrace()
  if (reverseBoundary.active?.tag === 'body') await verifyReturnedAction('Shift+Tab from reverse body pause', reverseCycle, actions.at(-1))
  await moveToAction(actions[0].key)
  const reverseRecoveryBoundary = await pressDialogTab('Shift+Tab')
  boundaryTrace.reverseRecoveryBoundary = reverseRecoveryBoundary
  await saveBoundaryTrace()
  const reverseRecovery = await pressDialogTab('Tab')
  boundaryTrace.reverseRecovery = reverseRecovery
  await saveBoundaryTrace()
  if (reverseRecoveryBoundary.active?.tag === 'body') await verifyReturnedAction('Tab after reverse body pause', reverseRecovery, actions[0])
  await moveToAction(actions[0].key)
  const reverseActivationBoundary = await pressDialogTab('Shift+Tab')
  boundaryTrace.reverseActivationBoundary = reverseActivationBoundary
  await saveBoundaryTrace()
  const reversePause = await recordBodyPause('Shift+Tab before first in-dialog action; Enter and Space tested without event prevention', reverseActivationBoundary)
  const reverseActivationRecovery = await pressDialogTab('Tab')
  boundaryTrace.reverseActivationRecovery = reverseActivationRecovery
  await saveBoundaryTrace()
  if (reverseActivationBoundary.active?.tag === 'body') await verifyReturnedAction('Tab after reverse activation probe', reverseActivationRecovery, actions[0])
  boundaryTrace.backgroundActivationCount = await page.evaluate(() => window.__cradleA11yBackgroundActivations?.length ?? 0)
  boundaryTrace.rawKeydownEventsWhileModalOpen = await page.evaluate(() => window.__cradleA11yDialogKeys)
  await saveBoundaryTrace()
  assert.ok(forwardBoundary.insideDialog || forwardBoundary.active?.tag === 'body', `Tab at the native modal boundary must stay inside the dialog or rest on document body: ${JSON.stringify({ active: forwardBoundary.active, dialogOpen: forwardBoundary.dialogOpen, modal: forwardBoundary.modal, backgroundActionFocused: forwardBoundary.backgroundActionFocused })}`)
  assert.ok(reverseBoundary.insideDialog || reverseBoundary.active?.tag === 'body', `Shift+Tab at the native modal boundary must stay inside the dialog or rest on document body: ${JSON.stringify({ active: reverseBoundary.active, dialogOpen: reverseBoundary.dialogOpen, modal: reverseBoundary.modal, backgroundActionFocused: reverseBoundary.backgroundActionFocused })}`)
  assert.equal(forwardPause.backgroundActivationCount ?? 0, 0, 'Enter and Space at the forward body pause must not activate a background action.')
  assert.equal(reversePause.backgroundActivationCount ?? 0, 0, 'Enter and Space at the reverse body pause must not activate a background action.')
  assert.equal(boundaryTrace.backgroundActivationCount, 0, 'No background action may activate while focus is paused at the open modal boundary.')
  assert.equal(forwardBoundary.active?.tag === 'body' ? forwardCycle.active?.marker === actions[0].key : true, true, 'Another forward Tab at a forward body pause must reach the first action.')
  assert.equal(forwardRecoveryBoundary.active?.tag === 'body' ? forwardRecovery.active?.marker === actions.at(-1).key : true, true, 'Shift+Tab from a forward body pause must recover to the last action.')
  assert.equal(reverseBoundary.active?.tag === 'body' ? reverseCycle.active?.marker === actions.at(-1).key : true, true, 'Another reverse Shift+Tab at a reverse body pause must reach the last action.')
  assert.equal(reverseRecoveryBoundary.active?.tag === 'body' ? reverseRecovery.active?.marker === actions[0].key : true, true, 'Tab from a reverse body pause must recover to the first action.')
  const actualFocusAfterReverseBoundary = reverseBoundary.active
  const actualFocusAfterForwardBoundary = forwardBoundary.active
  assert.ok(actualFocusSequence.length > 0 && actualFocusSequence.every(item => !item.backgroundActionFocused), 'No actual Tab sample may reach a background keyboard action while the modal is open.')
  const rawKeySequence = boundaryTrace.rawKeydownEventsWhileModalOpen
  const nativeBodyFocusPauseObserved = actualFocusSequence.some(item => item.active?.tag === 'body')
  boundaryTrace.humanVisibleFocusReviewRequired = nativeBodyFocusPauseObserved
  boundaryTrace.passed = true
  await saveBoundaryTrace()
  await page.keyboard.press('Escape')
  await drawer.waitFor({ state: 'hidden' })
  const returnedAfterEscape = await trigger.evaluate(element => element === document.activeElement)
  assert.ok(returnedAfterEscape, 'Escape must close navigation and return focus to its trigger.')

  const closeButton = page.getByRole('button', { name: 'Close navigation', exact: true })
  const secondOpening = await activateByKeyboard(page, trigger, 'Enter')
  await drawer.waitFor({ state: 'visible' })
  const closed = await activateByKeyboard(page, closeButton, 'Enter')
  await drawer.waitFor({ state: 'hidden' })
  const returnedAfterButton = await trigger.evaluate(element => element === document.activeElement)
  assert.ok(returnedAfterButton, 'Activating Close navigation by keyboard must return focus to its trigger.')
  await page.locator('[data-cradle-a11y-dialog-action]').evaluateAll(elements => elements.forEach(element => element.removeAttribute('data-cradle-a11y-dialog-action')))

  assert.ok(rawKeySequence.length > 0, 'The open modal must emit raw Tab and Shift+Tab key events.')
  const keyBoundaryEvidence = {
    initialFocus,
    reverseBoundary,
    forwardBoundary,
    activeAfterReverseBoundary: actualFocusAfterReverseBoundary,
    activeAfterForwardBoundary: actualFocusAfterForwardBoundary,
    rawKeydownEventsWhileModalOpen: rawKeySequence,
    actualFocusSequence,
    allDialogActionsReachedByTab: reachedActions.size === actions.length,
    backgroundFocusBlockedForTabSequence: actualFocusSequence.every(item => !item.backgroundActionFocused),
    bodyPauseChecks: boundaryTrace.bodyPauseChecks || [],
    boundaryReturns: boundaryTrace.returns || [],
    backgroundActivationCount: boundaryTrace.backgroundActivationCount,
    humanVisibleFocusReviewRequired: nativeBodyFocusPauseObserved,
  }
  if (output) {
    const safeName = screen.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    await writeFile(path.join(output, `a11y-${safeName}-${page.viewportSize()?.width ?? 0}-keyboard.json`), stringifySafeEvidence({ screen, width: page.viewportSize()?.width ?? 0, actions: actions.map(({ key, ...action }) => action), keyBoundaryEvidence, focusChecks, escapeClosed: true, focusReturnedAfterEscape: returnedAfterEscape, closeButtonActivation: { activationObserved: closed.activationObserved, returnedFocus: returnedAfterButton }, reopenedByKeyboard: secondOpening.activationObserved, passed: true }))
  }

  const result = {
    applicable: true,
    passed: true,
    trigger: { reachedByTab: Boolean(opening.focus.visibleFocusIndicator), activationObserved: opening.activationObserved },
    initialFocusInside: initialFocus.inside,
    initialFocusName: initialFocus.name,
    actionInventory: actions.map(({ key, ...action }) => action),
    disclosures,
    focusChecks,
    focusOrderComplete: focusChecks.length === actions.length,
    modalContainsShiftTabBoundary: reverseBoundary.insideDialog,
    modalContainsTabBoundary: forwardBoundary.insideDialog,
    nativeBodyFocusPauseForward: forwardBoundary.active?.tag === 'body',
    nativeBodyFocusPauseReverse: reverseBoundary.active?.tag === 'body',
    humanVisibleFocusReviewRequired: nativeBodyFocusPauseObserved,
    backgroundFocusBlockedForTabSequence: keyBoundaryEvidence.backgroundFocusBlockedForTabSequence,
    keyBoundaryEvidence,
    escapeClosed: true,
    focusReturnedAfterEscape: returnedAfterEscape,
    closeButtonActivation: { activationObserved: closed.activationObserved, returnedFocus: returnedAfterButton },
    reopenedByKeyboard: secondOpening.activationObserved,
    axeFindingCount: dialogAudit.axe.wcag22aa.length,
    targetSizeFindingCount: dialogAudit.axe.targetSize.length,
    targetGeometryBelow24: dialogAudit.layout.targetsBelow24,
  }
  recordKeyboardActivation(page, {
    name: 'Open navigation dialog sequence',
    key: 'Enter; Tab; Shift+Tab; Escape; Enter; close with Enter',
    tag: 'button',
    path: new URL(page.url()).pathname,
    hasQuery: new URL(page.url()).search.length > 0,
    width: page.viewportSize()?.width ?? 0,
    activationObserved: opening.activationObserved && secondOpening.activationObserved && closed.activationObserved,
    dialog: screen,
    focusReturned: returnedAfterEscape && returnedAfterButton,
  })
  return result
}
