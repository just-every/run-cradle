import assert from 'node:assert/strict'
import { visibleFocusDelta } from './accessibility-focus.mjs'

export async function tabUntilControlLeft(page, target) {
  const segmented = await target.evaluate(element => element instanceof HTMLInputElement && ['date', 'time', 'datetime-local'].includes(element.type))
  const maximum = segmented ? 12 : 1
  for (let tabs = 1; tabs <= maximum; tabs++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(element => element !== document.activeElement)) return tabs
  }
  return null
}

export async function focusByTab(page, target, marker) {
  const traversalStart = await page.evaluate(() => {
    const active = document.activeElement
    return active instanceof HTMLElement ? { tag: active.tagName.toLowerCase(), name: active.getAttribute('aria-label') || active.innerText || active.id || '' } : null
  })
  const state = await target.evaluate((element, marker) => {
    element.setAttribute('data-cradle-a11y-input', marker)
    window.__cradleA11yInputNodes ??= new Map()
    window.__cradleA11yInputNodes.set(marker, element)
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const accessibleName = () => {
      const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ')
      const associated = element.labels ? [...element.labels].map(label => label.innerText).join(' ') : ''
      return (element.getAttribute('aria-label') || labelledBy || associated || element.getAttribute('title') || element.name || element.type || element.tagName).trim().replace(/\s+/g, ' ').slice(0, 160)
    }
    const focusStyle = item => {
      const computed = getComputedStyle(item)
      const finitePx = value => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : 0 }
      return { outlineStyle: computed.outlineStyle, outlineWidth: finitePx(computed.outlineWidth), outlineColor: computed.outlineColor, outlineOffset: finitePx(computed.outlineOffset), boxShadow: computed.boxShadow, borderWidth: finitePx(computed.borderWidth), borderColor: computed.borderColor, backgroundColor: computed.backgroundColor }
    }
    return {
      tag: element.tagName.toLowerCase(),
      type: element.type || undefined,
      name: accessibleName(),
      value: element.value,
      disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
      wasFocused: element === document.activeElement,
      inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
      baselineStyle: focusStyle(element),
      baselineLabelStyle: element.closest('label') ? focusStyle(element.closest('label')) : null,
      visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
    }
  }, marker)
  try {
    assert.ok(['input', 'textarea', 'select'].includes(state.tag), `Keyboard entry requires a native input control, found <${state.tag}>: ${state.name}`)
    assert.equal(state.disabled, false, `Cannot enter a disabled field: ${state.name}`)
    assert.equal(state.visible, true, `Cannot keyboard-enter a non-visible field: ${state.name}`)
    if (state.wasFocused) {
      state.tabsToLeaveInitialFocus = await tabUntilControlLeft(page, target)
      assert.ok(state.tabsToLeaveInitialFocus, `An already-focused field must be left by real Tabs before measuring its unfocused baseline: ${state.name}`)
      const baseline = await target.evaluate(element => {
        const styleOf = item => {
          const computed = getComputedStyle(item)
          const finitePx = value => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : 0 }
          return { outlineStyle: computed.outlineStyle, outlineWidth: finitePx(computed.outlineWidth), outlineColor: computed.outlineColor, outlineOffset: finitePx(computed.outlineOffset), boxShadow: computed.boxShadow, borderWidth: finitePx(computed.borderWidth), borderColor: computed.borderColor, backgroundColor: computed.backgroundColor }
        }
        const label = element.closest('label')
        return { element: styleOf(element), label: label ? styleOf(label) : null }
      })
      state.baselineStyle = baseline.element
      state.baselineLabelStyle = baseline.label
    }
    let reached = false
    let tabsToTarget = 0
    const maximum = (await page.locator('a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[tabindex]').count()) * 4 + 12
    for (let index = 0; index <= maximum; index++) {
      await page.keyboard.press('Tab')
      tabsToTarget++
      if (await page.locator(`[data-cradle-a11y-input="${marker}"]`).evaluate(element => element === document.activeElement).catch(() => false)) { reached = true; break }
    }
    assert.ok(reached, `Tab did not reach field: ${state.name}`)
    let shiftTabsToFirstSegment = 0
    if (['date', 'time', 'datetime-local'].includes(state.type)) {
      let leftControl = false
      for (let index = 0; index < 12; index++) {
        await page.keyboard.press('Shift+Tab')
        shiftTabsToFirstSegment++
        const stillOnControl = await page.locator(`[data-cradle-a11y-input="${marker}"]`).evaluate(element => element === document.activeElement).catch(() => false)
        if (!stillOnControl) { leftControl = true; break }
      }
      assert.equal(leftControl, true, `Shift+Tab must leave the native ${state.type} control after crossing its internal segments: ${state.name}`)
      // A preceding native date/time field has its own Tab stops; Chromium can
      // also pause on body at the document boundary. Traverse those real stops.
      reached = false
      for (let index = 0; index <= maximum; index++) {
        await page.keyboard.press('Tab')
        tabsToTarget++
        reached = await page.locator(`[data-cradle-a11y-input="${marker}"]`).evaluate(element => element === document.activeElement).catch(() => false)
        if (reached) break
      }
      assert.equal(reached, true, `Tab must return to the first native ${state.type} segment: ${state.name}`)
    }
    const focused = await page.locator(`[data-cradle-a11y-input="${marker}"]`).evaluate(element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const focusStyle = item => {
        const computed = getComputedStyle(item)
        const finitePx = value => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : 0 }
        return { outlineStyle: computed.outlineStyle, outlineWidth: finitePx(computed.outlineWidth), outlineColor: computed.outlineColor, outlineOffset: finitePx(computed.outlineOffset), boxShadow: computed.boxShadow, borderWidth: finitePx(computed.borderWidth), borderColor: computed.borderColor, backgroundColor: computed.backgroundColor }
      }
      const label = element.closest('label')
      return {
        focusVisible: element.matches(':focus-visible'),
        inViewport: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
        style: focusStyle(element),
        labelStyle: label ? focusStyle(label) : null,
        labelFocusWithin: Boolean(label?.matches(':focus-within')),
      }
    })
    assert.equal(focused.focusVisible, true, `Keyboard focus must be visible to the browser for field: ${state.name}`)
    assert.equal(focused.inViewport, true, `Keyboard focus must scroll field into view: ${state.name}`)
    const visibleFocusIndicator = focused.focusVisible && (
      visibleFocusDelta(focused.style, state.baselineStyle)
      || Boolean(focused.labelFocusWithin && focused.labelStyle && state.baselineLabelStyle && visibleFocusDelta(focused.labelStyle, state.baselineLabelStyle))
    )
    assert.equal(visibleFocusIndicator, true, `Keyboard focus must produce a visible style change on the field or its focused label: ${state.name}`)
    return { ...state, startingFocusWasTarget: state.wasFocused, focused: { ...focused, visibleFocusIndicator }, traversalStart, tabsToTarget, shiftTabsToFirstSegment }
  } catch (error) {
    await removeMarker(page, marker)
    throw error
  }
}

export async function removeMarker(page, marker) {
  await page.evaluate(marker => {
    window.__cradleA11yInputNodes?.delete(marker)
    document.querySelectorAll(`[data-cradle-a11y-input="${CSS.escape(marker)}"]`).forEach(element => element.removeAttribute('data-cradle-a11y-input'))
  }, marker).catch(() => {})
}


export async function readValueByMarker(page, marker) {
  return page.evaluate(marker => {
    const current = document.querySelector(`[data-cradle-a11y-input="${CSS.escape(marker)}"]`)
    const original = window.__cradleA11yInputNodes?.get(marker)
    return {
      sameElement: Boolean(current && original === current),
      value: current && 'value' in current ? current.value : null,
    }
  }, marker)
}

