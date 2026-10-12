import assert from 'node:assert/strict'
import { interactiveControlsSelector } from './accessibility-keyboard.mjs'
import { visibleFocusDecoration } from './accessibility-focus.mjs'

// An actual native modal makes the rest of the document inert. Inventory its
// actions independently and use only real Tab keys to reach and wrap them.
export async function modalKeyboardOrder(page) {
  const modal = page.locator('dialog:modal')
  assert.equal(await modal.count(), 1, 'The modal keyboard audit requires one actual native modal.')
  const actions = await modal.evaluate((dialog, selector) => [...dialog.querySelectorAll(selector)].filter(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect()
    return element.tabIndex >= 0 && !element.matches(':disabled,[aria-disabled="true"]')
      && !element.closest('[hidden],[inert],[aria-hidden="true"]')
      && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0
  }).map((element, index) => {
    const key = `modal-action-${index}`
    element.setAttribute('data-cradle-a11y-modal-action', key)
    return { key, tag: element.tagName.toLowerCase(), role: element.getAttribute('role') || '', type: element.type || '',
      name: element.getAttribute('aria-label') || element.innerText.trim(),
      ...(element instanceof HTMLAnchorElement ? { linkPath: new URL(element.href).pathname, linkHasQuery: new URL(element.href).search.length > 0 } : {}) }
  }), interactiveControlsSelector)
  assert.ok(actions.length, 'The open modal needs reachable action controls.')
  const reached = new Set(), focusChecks = [], focusSequence = [], boundaryReturns = []
  const readFocus = () => modal.evaluate(dialog => {
    const element = document.activeElement, style = getComputedStyle(element), rect = element.getBoundingClientRect()
    return { key: element.getAttribute('data-cradle-a11y-modal-action'), inside: dialog.contains(element),
      tag: element.tagName.toLowerCase(), focusVisible: element.matches(':focus-visible'),
      inViewport: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth,
      style: { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, boxShadow: style.boxShadow } }
  })
  const observe = async () => {
    const focused = await readFocus()
    focusSequence.push(focused)
    assert.equal(focused.inside, true, 'Native modal Tab focus must remain inside; background actions must be inert.')
    const action = actions.find(action => action.key === focused.key)
    assert.ok(action, 'Each actual modal Tab stop must be an inventoried action.')
    const visibleFocusIndicator = focused.focusVisible && visibleFocusDecoration(focused.style)
    if (!reached.has(action.key)) focusChecks.push({ ...action, ...focused, visibleFocusIndicator })
    reached.add(action.key)
    return { ...focused, visibleFocusIndicator }
  }
  try {
    const initialFocusInside = await modal.evaluate(dialog => dialog.contains(document.activeElement))
    assert.equal(initialFocusInside, true, 'Opening the native inspector must take focus inside.')
    for (let index = 0; index < actions.length * 3 + 8 && reached.size < actions.length; index++) {
      await page.keyboard.press('Tab')
      await observe()
    }
    assert.deepEqual(actions.filter(action => !reached.has(action.key)), [], 'Tab must reach every actual modal action.')
    const first = actions[0], last = actions.at(-1)
    for (let index = 0; index <= actions.length && (await readFocus()).key !== first.key; index++) await page.keyboard.press('Tab')
    assert.equal((await readFocus()).key, first.key, 'Actual Tab traversal must reach the first modal action.')
    for (const [key, expected] of [['Shift+Tab', last], ['Tab', first]]) {
      await page.keyboard.press(key)
      const focused = await observe()
      assert.equal(focused.key, expected.key, `${key} must wrap directly to the expected actual modal action.`)
      assert.equal(focused.visibleFocusIndicator && focused.inViewport, true, `${key} boundary focus must be visible.`)
      boundaryReturns.push({ key, expectedKey: expected.key, focused })
    }
    return { tabbableCount: actions.length, reachedCount: reached.size, missing: actions.filter(action => !reached.has(action.key)),
      keyboardOrder: actions.map(action => ({ ...action, reached: reached.has(action.key) })),
      traversalMethod: 'Independent native-modal action inventory; actual Tab and Shift+Tab only, preserving initial focus',
      focusVisibleChecks: focusChecks, focusSequence,
      focusWithoutVisibleStyle: focusChecks.filter(action => !action.visibleFocusIndicator),
      focusOutsideViewport: focusChecks.filter(action => !action.inViewport),
      modal: { initialFocusInside, backgroundFocusBlockedForTabSequence: focusSequence.every(focus => focus.inside), boundaryReturns } }
  } finally {
    await modal.locator('[data-cradle-a11y-modal-action]').evaluateAll(elements => elements.forEach(element => element.removeAttribute('data-cradle-a11y-modal-action'))).catch(() => {})
  }
}
