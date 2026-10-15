import assert from 'node:assert/strict'
import { installKeyboardInput } from './accessibility-input.mjs'
import { visibleFocusDecoration, visibleFocusDelta } from './accessibility-focus.mjs'

export const interactiveControlsSelector = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[tabindex]'
export const accessibilityEvidence = process.env.CRADLE_A11Y === '1'
export const accessibilityCaptureOnly = accessibilityEvidence && process.env.CRADLE_A11Y_CAPTURE_ONLY === '1'
const strictAudit = accessibilityEvidence && !accessibilityCaptureOnly

const activationReceipts = new WeakMap()
const interactionPages = new WeakSet()
const patchedInteractionPrototypes = new WeakSet()
let actionProbe = 0
let radioProbe = 0

export function keyboardActivationInventory(page) {
  return [...(activationReceipts.get(page) ?? [])]
}

export function recordKeyboardActivation(page, receipt) {
  if (!activationReceipts.has(page)) activationReceipts.set(page, [])
  activationReceipts.get(page).push(receipt)
  return receipt
}

export function installKeyboardInteractions(page) {
  installKeyboardInput(page)
  if (!strictAudit) return
  interactionPages.add(page)
  const prototype = Object.getPrototypeOf(page.locator('body'))
  if (patchedInteractionPrototypes.has(prototype)) return
  const original = {
    click: prototype.click,
    check: prototype.check,
    uncheck: prototype.uncheck,
  }
  Object.defineProperties(prototype, {
    click: { configurable: true, writable: true, value: async function(options) {
      const owner = this.page()
      if (!strictAudit || !interactionPages.has(owner)) return original.click.call(this, options)
      const kind = await this.evaluate(element => ({ tag: element.tagName.toLowerCase(), type: element.type || '', role: element.getAttribute('role') || '' }))
      if (kind.type === 'radio' || kind.role === 'radio') return activateRadioByKeyboard(owner, this)
      const key = kind.type === 'checkbox' || ['checkbox', 'switch'].includes(kind.role) || kind.tag === 'summary' ? 'Space' : 'Enter'
      return activateByKeyboard(owner, this, key)
    } },
    check: { configurable: true, writable: true, value: function(options) {
      const owner = this.page()
      return strictAudit && interactionPages.has(owner) ? accessibilitySetChecked(owner, this, true) : original.check.call(this, options)
    } },
    uncheck: { configurable: true, writable: true, value: function(options) {
      const owner = this.page()
      return strictAudit && interactionPages.has(owner) ? accessibilitySetChecked(owner, this, false) : original.uncheck.call(this, options)
    } },
  })
  patchedInteractionPrototypes.add(prototype)
}

function visibleStyle(element) {
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

export async function keyboardOrder(page) {
  const state = await page.evaluate(selector => {
    const styleSnapshot = element => {
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
    const openDialog = document.querySelector('dialog[open],[role="dialog"],[aria-modal="true"]')
    if (openDialog) return { skipped: 'An open modal requires its own keyboard containment, Escape, and return-focus journey.' }
    const visible = element => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const visibleThroughDetails = (() => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement && !parent.open && !(element.tagName === 'SUMMARY' && element.parentElement === parent)) return false
        }
        return true
      })()
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0 && !element.closest('[hidden],[inert],[aria-hidden="true"]') && visibleThroughDetails
    }
    const accessibleName = element => {
      const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '').join(' ')
      const associated = element.labels ? [...element.labels].map(label => label.innerText).join(' ') : ''
      const descendants = [...element.querySelectorAll('img[alt],svg[aria-label],svg title,[aria-label]')].map(item => item.getAttribute('alt') || item.getAttribute('aria-label') || item.textContent || '').join(' ')
      return (element.getAttribute('aria-label') || labelledBy || associated || element.innerText || element.value || descendants || element.getAttribute('title') || '').trim().replace(/\s+/g, ' ')
    }
    const original = document.activeElement
    const originalProbe = original instanceof HTMLElement ? 'a11y-original' : null
    const startingFocus = original instanceof HTMLElement ? {
      tag: original.tagName.toLowerCase(),
      name: original.getAttribute('aria-label') || original.innerText || original.id || '',
    } : null
    if (originalProbe) original.setAttribute('data-cradle-a11y-original', originalProbe)
    const priorTabIndex = document.body.getAttribute('tabindex')
    const priorScroll = { x: window.scrollX, y: window.scrollY }
    document.activeElement?.blur()
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
    // Native matching includes disabled-fieldset descendants and preserves the first-legend exception.
    const controls = [...new Set(document.querySelectorAll(selector))].filter(element => visible(element) && element.tabIndex >= 0 && !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true')
    const radioRepresentatives = new Map()
    for (const element of controls) {
      if (element.tagName !== 'INPUT' || element.type !== 'radio' || !element.name) continue
      const owner = element.form || document
      const groups = radioRepresentatives.get(owner) || new Map()
      if (!groups.has(element.name)) {
        const radios = controls.filter(radio => radio.tagName === 'INPUT' && radio.type === 'radio' && radio.name === element.name && (radio.form || document) === owner)
        groups.set(element.name, radios.find(radio => radio.checked) || radios[0])
      }
      radioRepresentatives.set(owner, groups)
    }
    const representatives = controls.filter(element => {
      if (element.tagName !== 'INPUT' || element.type !== 'radio' || !element.name) return true
      const owner = element.form || document
      return radioRepresentatives.get(owner)?.get(element.name) === element
    })
    let probe = 0
    // A radio group contributes one expected Tab stop, but the browser can
    // focus a different member on a later traversal of an unchecked group.
    // Every eligible control needs its own unfocused style baseline.
    const inventory = controls.map(element => {
      const key = `a11y-${probe++}`
      element.setAttribute('data-cradle-a11y-probe', key)
      const rect = element.getBoundingClientRect()
      const style = styleSnapshot(element)
      return {
        key,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || '',
        name: accessibleName(element),
        id: element.id || undefined,
        linkPath: element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement ? new URL(element.href).pathname : undefined,
        linkHasQuery: element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement ? new URL(element.href).search.length > 0 : undefined,
        type: element.type || undefined,
        x: rect.x,
        y: rect.y,
        baselineStyle: style,
      }
    })
    const representativeKeys = new Set(representatives.map(element => element.getAttribute('data-cradle-a11y-probe')))
    const expected = inventory.filter(item => representativeKeys.has(item.key))
    const baselineByKey = Object.fromEntries(inventory.map(item => [item.key, item.baselineStyle]))
    const tabStopByKey = Object.fromEntries(controls.map(element => {
      const key = element.getAttribute('data-cradle-a11y-probe')
      const representative = element.tagName === 'INPUT' && element.type === 'radio' && element.name
        ? radioRepresentatives.get(element.form || document)?.get(element.name)
        : element
      return [key, representative.getAttribute('data-cradle-a11y-probe')]
    }))
    const startingFocusKey = original instanceof HTMLElement ? original.getAttribute('data-cradle-a11y-probe') : null
    return { expected, baselineByKey, tabStopByKey, originalProbe, priorScroll, priorTabIndex, startingFocus, startingFocusKey }
  }, interactiveControlsSelector)

  if (state.skipped) return {
    ...state,
    actionInventory: await page.locator(interactiveControlsSelector).evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || undefined,
      name: element.getAttribute('aria-label') || element.innerText || element.getAttribute('title') || '',
    }))),
  }

  const { baselineByKey, tabStopByKey } = state
  const focusStyles = []
  const visitedKeys = new Set()
  const visitedControlKeys = new Set()
  try {
    for (let index = 0; index < state.expected.length * 4 + 12; index++) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(({ baselines, tabStops }) => {
        const styleSnapshot = element => {
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
        const element = document.activeElement
        if (!(element instanceof HTMLElement) || element === document.body) return null
        const style = styleSnapshot(element)
        const rect = element.getBoundingClientRect()
        const key = element.getAttribute('data-cradle-a11y-probe')
        return {
          key,
          tabStopKey: key ? tabStops[key] : null,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role') || '',
          name: (() => {
            const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '').join(' ')
            const associated = element.labels ? [...element.labels].map(label => label.innerText).join(' ') : ''
            const descendants = [...element.querySelectorAll('img[alt],svg[aria-label],svg title,[aria-label]')].map(item => item.getAttribute('alt') || item.getAttribute('aria-label') || item.textContent || '').join(' ')
            return (element.getAttribute('aria-label') || labelledBy || associated || element.innerText || element.value || descendants || element.getAttribute('title') || '').trim().replace(/\s+/g, ' ')
          })(),
          id: element.id || undefined,
          linkPath: element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement ? new URL(element.href).pathname : undefined,
          linkHasQuery: element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement ? new URL(element.href).search.length > 0 : undefined,
          type: element.type || undefined,
          focusVisible: element.matches(':focus-visible'),
          style,
          baselineStyle: key ? baselines[key] : null,
          inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
        }
      }, { baselines: baselineByKey, tabStops: tabStopByKey })
      if (!focused) break
      if (focused.key && visitedControlKeys.has(focused.key)) {
        focusStyles.push({ ...focused, duplicateFocusStop: true, visibleFocusIndicator: focused.focusVisible && visibleFocusDelta(focused.style, focused.baselineStyle) })
        if (visitedKeys.size === state.expected.length) break
        continue
      }
      if (focused.key) visitedControlKeys.add(focused.key)
      if (focused.tabStopKey) visitedKeys.add(focused.tabStopKey)
      const item = {
        ...focused,
        visibleFocusIndicator: focused.focusVisible && (
          visibleFocusDelta(focused.style, focused.baselineStyle)
          || (focused.key === state.startingFocusKey && visibleFocusDecoration(focused.style))
        ),
      }
      focusStyles.push(item)
      if (visitedKeys.size === state.expected.length) break
    }
  } finally {
    await page.evaluate(({ originalProbe, priorTabIndex, priorScroll }) => {
      const original = originalProbe ? document.querySelector(`[data-cradle-a11y-original="${CSS.escape(originalProbe)}"]`) : null
      document.querySelectorAll('[data-cradle-a11y-probe]').forEach(element => element.removeAttribute('data-cradle-a11y-probe'))
      document.querySelectorAll('[data-cradle-a11y-original]').forEach(element => element.removeAttribute('data-cradle-a11y-original'))
      if (priorTabIndex === null) document.body.removeAttribute('tabindex')
      else document.body.setAttribute('tabindex', priorTabIndex)
      original?.focus({ preventScroll: true })
      window.scrollTo(priorScroll.x, priorScroll.y)
    }, { originalProbe: state.originalProbe, priorTabIndex: state.priorTabIndex, priorScroll: state.priorScroll }).catch(() => {})
  }

  return {
    tabbableCount: state.expected.length,
    reachedCount: visitedKeys.size,
    missing: state.expected.filter(item => !visitedKeys.has(item.key)),
    keyboardOrder: state.expected.map(item => ({ ...item, reached: visitedKeys.has(item.key) })),
    traversalStart: state.startingFocus,
    traversalMethod: 'Independent action-inventory pass seeded once at document.body, then actual Tab key traversal; strict actions and fields continue from current focus',
    focusVisibleChecks: focusStyles,
    focusSequence: focusStyles.map(({ key, tabStopKey, tag, role, name, id, linkPath, linkHasQuery, type, inViewport, visibleFocusIndicator, duplicateFocusStop }) => ({ key, tabStopKey, tag, role, name, id, linkPath, linkHasQuery, type, inViewport, visibleFocusIndicator, ...(duplicateFocusStop ? { duplicateFocusStop: true } : {}) })),
    focusWithoutVisibleStyle: focusStyles.filter(item => !item.duplicateFocusStop && !item.visibleFocusIndicator),
    focusOutsideViewport: focusStyles.filter(item => !item.duplicateFocusStop && !item.inViewport),
    wrappedOrStopped: visitedKeys.size < state.expected.length,
  }
}

export async function activateByKeyboard(page, target, key = 'Enter') {
  const marker = `a11y-action-${actionProbe++}`
  const metadata = await target.evaluate((element, { selector, marker }) => {
    const action = element.matches(selector) ? element : element.closest('label')?.control || element.closest(selector) || element
    action.setAttribute('data-cradle-a11y-action', marker)
    const labelledBy = action.getAttribute('aria-labelledby')
    const associated = action.labels ? [...action.labels].map(label => label.innerText).join(' ') : ''
    return {
      name: (action.getAttribute('aria-label') || (labelledBy && document.getElementById(labelledBy)?.innerText) || associated || action.innerText || action.value || action.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      tag: action.tagName.toLowerCase(),
      inputType: action instanceof HTMLInputElement ? action.type : undefined,
      role: action.getAttribute('role') || '',
      path: location.pathname,
      hasQuery: location.search.length > 0,
      linkPath: action instanceof HTMLAnchorElement || action instanceof HTMLAreaElement ? new URL(action.href).pathname : undefined,
      linkHasQuery: action instanceof HTMLAnchorElement || action instanceof HTMLAreaElement ? new URL(action.href).search.length > 0 : undefined,
      width: innerWidth,
      // A real main-frame navigation is also activation evidence when document
      // scripts are disabled. Match the focused link or POST form, never an
      // arbitrary response or background fetch. Keep credential URLs private.
      navigation: action instanceof HTMLAnchorElement || action instanceof HTMLAreaElement
        ? { url: action.href.split('#')[0], method: 'GET' }
        : (action instanceof HTMLButtonElement || action instanceof HTMLInputElement) && action.type === 'submit' && action.form?.method.toUpperCase() === 'POST'
          ? { url: new URL(action.getAttribute('formaction') || action.form.action, location.href).href, method: 'POST' }
          : null,
    }
  }, { selector: interactiveControlsSelector, marker })
  const actionTarget = page.locator(`[data-cradle-a11y-action="${marker}"]`)
  const traversalStart = await page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return null
    const style = getComputedStyle(active)
    return {
      tag: active.tagName.toLowerCase(),
      name: active.getAttribute('aria-label') || active.innerText || active.id || '',
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
    }
  })
  const actionAlreadyFocused = await actionTarget.evaluate(element => element === document.activeElement)
  try {
    if (metadata.inputType === 'radio' || metadata.role === 'radio') return await activateRadioByKeyboard(page, actionTarget)
    if (metadata.inputType === 'checkbox' && key === 'Enter') key = 'Space'
    const baseline = await actionTarget.evaluate(visibleStyle)
    let reached = false
    let tabsToAction = 0
    for (let index = 0; index <= (await page.locator(interactiveControlsSelector).count()) * 4 + 12; index++) {
      await page.keyboard.press('Tab')
      tabsToAction++
      if (await actionTarget.evaluate(element => element === document.activeElement)) { reached = true; break }
    }
    if (!reached) throw new Error(`Keyboard Tab did not reach action: ${metadata.name || '<unnamed>'}`)
    const focusState = await actionTarget.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      const style = {
        outlineStyle: computed.outlineStyle,
        outlineWidth: computed.outlineWidth,
        outlineColor: computed.outlineColor,
        outlineOffset: computed.outlineOffset,
        boxShadow: computed.boxShadow,
        borderWidth: computed.borderWidth,
        borderColor: computed.borderColor,
        backgroundColor: computed.backgroundColor,
      }
      return { focusVisible: element.matches(':focus-visible'), style, inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth }
    })
    const alreadyVisible = actionAlreadyFocused && focusState.focusVisible && visibleFocusDecoration(focusState.style)
    const focus = { ...focusState, visibleFocusIndicator: focusState.focusVisible && (visibleFocusDelta(focusState.style, baseline) || alreadyVisible), alreadyFocusedAtTraversalStart: actionAlreadyFocused }
    if (!focus.visibleFocusIndicator || !focus.inViewport) throw new Error(`Action has no visible keyboard focus style or is outside the viewport: ${metadata.name || '<unnamed>'}`)
    await page.evaluate(marker => {
      document.addEventListener('click', event => {
        const target = event.composedPath().find(node => node instanceof Element && node.getAttribute('data-cradle-a11y-action') === marker)
        if (target) console.debug(`CRADLE_A11Y_ACTION:${marker}`)
      }, { capture: true, once: true })
    }, marker)
    const activation = new Promise(resolve => {
      const finish = channel => {
        clearTimeout(timeout)
        page.off('console', click)
        page.off('request', navigation)
        resolve(channel)
      }
      const click = message => { if (message.text() === `CRADLE_A11Y_ACTION:${marker}`) finish('click') }
      const navigation = request => {
        if (metadata.navigation && request.isNavigationRequest() && request.frame() === page.mainFrame() && request.method() === metadata.navigation.method && request.url() === metadata.navigation.url) finish('native-navigation')
      }
      const timeout = setTimeout(() => finish(null), 3000)
      page.on('console', click)
      page.on('request', navigation)
    })
    await page.keyboard.press(key)
    const activationChannel = await activation
    const activationObserved = Boolean(activationChannel)
    if (!activationObserved) throw new Error(`Keyboard ${key} did not activate the focused control: ${metadata.name || '<unnamed>'}`)
    return recordKeyboardActivation(page, { name: metadata.name || '<unnamed>', key, tag: metadata.tag, role: metadata.role, path: metadata.path, hasQuery: metadata.hasQuery, ...(metadata.linkPath ? { linkPath: metadata.linkPath, linkHasQuery: metadata.linkHasQuery } : {}), width: metadata.width, activationObserved, activationChannel, focus, traversalStart, tabsToAction })
  } finally {
    await page.evaluate(marker => {
      document.querySelectorAll(`[data-cradle-a11y-action="${CSS.escape(marker)}"]`).forEach(element => element.removeAttribute('data-cradle-a11y-action'))
    }, marker).catch(() => {})
  }
}

export async function accessibilityAction(page, target, key = 'Enter') {
  installKeyboardInteractions(page)
  if (accessibilityEvidence && !accessibilityCaptureOnly) return activateByKeyboard(page, target, key)
  return target.click()
}

export async function accessibilitySetChecked(page, target, checked = true) {
  installKeyboardInteractions(page)
  if (!accessibilityEvidence || accessibilityCaptureOnly) return checked ? target.check() : target.uncheck()
  const type = await target.evaluate(element => ({ tag: element.tagName.toLowerCase(), type: element.type, checked: element.checked }))
  if (type.type === 'radio') {
    assert.equal(checked, true, 'Radio controls can only be selected with keyboard activation.')
    return activateRadioByKeyboard(page, target)
  }
  if (Boolean(type.checked) !== checked) await activateByKeyboard(page, target, 'Space')
  const actual = await target.evaluate(element => element.checked)
  assert.equal(actual, checked, `Keyboard Space must set ${type.type} to ${checked}`)
  return { name: await target.getAttribute('aria-label') || type.type, key: 'Space', tag: type.tag, checked: actual }
}

async function activateRadioByKeyboard(page, target) {
  const marker = `a11y-radio-${radioProbe++}`
  const traversalStart = await page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return null
    const style = getComputedStyle(active)
    return {
      tag: active.tagName.toLowerCase(),
      name: active.getAttribute('aria-label') || active.innerText || active.id || '',
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
    }
  })
  const metadata = await target.evaluate((element, marker) => {
    const radios = [...(element.form || document).querySelectorAll('input[type="radio"]')].filter(radio => radio.name === element.name && radio.form === element.form)
    const targetIndex = radios.indexOf(element)
    radios.forEach((radio, index) => radio.setAttribute('data-cradle-a11y-radio', `${marker}-${index}`))
    const labelledBy = element.getAttribute('aria-labelledby')
    const associated = element.labels ? [...element.labels].map(label => label.innerText).join(' ') : ''
    return { initiallyChecked: element.checked, name: (element.getAttribute('aria-label') || (labelledBy && document.getElementById(labelledBy)?.innerText) || associated || element.value || '').trim().replace(/\s+/g, ' '), targetIndex, count: radios.length, path: location.pathname, hasQuery: location.search.length > 0, width: innerWidth, role: element.getAttribute('role') || '' }
  }, marker)
  const radioAlreadyFocused = await target.evaluate(element => element === document.activeElement)
  await page.evaluate(marker => {
    window.__cradleA11yRadioProbes ??= new Map()
    const events = []
    const listener = event => {
      const radio = event.composedPath().find(node => node instanceof HTMLInputElement && node.getAttribute('data-cradle-a11y-radio')?.startsWith(`${marker}-`))
      if (radio) events.push({ type: event.type, key: event.key ?? null, trusted: event.isTrusted, index: Number(radio.getAttribute('data-cradle-a11y-radio').split('-').at(-1)), checked: radio.checked, active: radio === document.activeElement })
    }
    const types = ['keydown', 'keyup', 'click', 'input', 'change']
    for (const type of types) document.addEventListener(type, listener, true)
    window.__cradleA11yRadioProbes.set(marker, { events, listener, types })
  }, marker)
  try {
    const baseline = await target.evaluate(visibleStyle)
    let reachedGroup = false
    let tabsToGroup = 0
    for (let index = 0; index <= (await page.locator(interactiveControlsSelector).count()) * 4 + 12; index++) {
      await page.keyboard.press('Tab')
      tabsToGroup++
      if (await page.evaluate(marker => document.activeElement?.matches(`[data-cradle-a11y-radio^="${marker}-"]`) || false, marker)) { reachedGroup = true; break }
    }
    assert.ok(reachedGroup, `Keyboard Tab did not reach radio group: ${metadata.name || '<unnamed>'}`)
    let activeIndex = await page.evaluate(() => {
      const active = document.activeElement?.getAttribute('data-cradle-a11y-radio') || ''
      return Number(active.slice(active.lastIndexOf('-') + 1))
    })
    for (let attempt = 0; activeIndex !== metadata.targetIndex && attempt < metadata.count; attempt++) {
      await page.keyboard.press('ArrowRight')
      activeIndex = await page.evaluate(() => {
        const active = document.activeElement?.getAttribute('data-cradle-a11y-radio') || ''
        return Number(active.slice(active.lastIndexOf('-') + 1))
      })
    }
    assert.equal(activeIndex, metadata.targetIndex, `ArrowRight must reach radio: ${metadata.name || '<unnamed>'}`)
    const focusState = await target.evaluate(element => {
      const computed = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        focusVisible: element.matches(':focus-visible'),
        style: {
          outlineStyle: computed.outlineStyle,
          outlineWidth: computed.outlineWidth,
          outlineColor: computed.outlineColor,
          outlineOffset: computed.outlineOffset,
          boxShadow: computed.boxShadow,
          borderWidth: computed.borderWidth,
          borderColor: computed.borderColor,
          backgroundColor: computed.backgroundColor,
        },
        inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
      }
    })
    const alreadyVisible = radioAlreadyFocused && focusState.focusVisible && visibleFocusDecoration(focusState.style)
    const focus = { ...focusState, visibleFocusIndicator: focusState.focusVisible && (visibleFocusDelta(focusState.style, baseline) || alreadyVisible), alreadyFocusedAtTraversalStart: radioAlreadyFocused }
    assert.ok(focus.visibleFocusIndicator && focus.inViewport, `Radio requires visible keyboard focus: ${metadata.name || '<unnamed>'}`)
    const checkedBeforeSpace = await target.evaluate(element => element.checked)
    await page.keyboard.press('Space')
    const nativeEvents = await page.evaluate(marker => window.__cradleA11yRadioProbes.get(marker).events, marker)
    const selectedEvents = nativeEvents.filter(event => event.index === metadata.targetIndex && event.trusted)
    assert.ok(selectedEvents.some(event => event.type === 'keydown' && event.key === ' ' && event.active), `Space keydown must reach the focused radio: ${metadata.name || '<unnamed>'}`)
    assert.ok(selectedEvents.some(event => event.type === 'keyup' && event.key === ' ' && event.active), `Space keyup must reach the focused radio: ${metadata.name || '<unnamed>'}`)
    const activationObserved = selectedEvents.some(event => event.type === 'input' && event.checked) && selectedEvents.some(event => event.type === 'change' && event.checked)
    if (!metadata.initiallyChecked) assert.ok(activationObserved, `Native ArrowRight or Space must select the previously unchecked radio: ${metadata.name || '<unnamed>'}`)
    const checked = await target.evaluate(element => element.checked)
    assert.equal(checked, true, `Keyboard ArrowRight and Space must leave the radio selected: ${metadata.name || '<unnamed>'}`)
    const receipt = { name: metadata.name || '<unnamed>', key: 'Tab to radio group; ArrowRight + Space', tag: 'input', role: metadata.role, path: metadata.path, hasQuery: metadata.hasQuery, width: metadata.width, activationObserved, initiallyChecked: metadata.initiallyChecked, checkedBeforeSpace, checked, nativeEvents, focus, traversalStart, tabsToGroup, selectionNote: 'Native arrows select a radio and emit trusted input/change; Space on an already selected radio retains it without a redundant click.' }
    return activationObserved ? recordKeyboardActivation(page, receipt) : receipt
  } finally {
    await page.evaluate(marker => {
      const probe = window.__cradleA11yRadioProbes?.get(marker)
      if (probe) { for (const type of probe.types) document.removeEventListener(type, probe.listener, true); window.__cradleA11yRadioProbes.delete(marker) }
      document.querySelectorAll(`[data-cradle-a11y-radio^="${CSS.escape(marker)}-"]`).forEach(element => element.removeAttribute('data-cradle-a11y-radio'))
    }, marker).catch(() => {})
  }
}
