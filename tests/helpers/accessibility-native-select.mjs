import assert from 'node:assert/strict'
import { focusByTab, removeMarker, readValueByMarker } from './accessibility-input-focus.mjs'

export async function nativeSelectKeyboardReceipt(page, target, request, marker) {
  // Wait for asynchronous choices before traversing the page: file parsing can
  // otherwise expand mapping fields above the control after it receives focus.
  const select = await target.elementHandle()
  assert.ok(select, 'Keyboard selection requires an attached native select.')
  try {
    await page.waitForFunction(({ element, request }) => element instanceof HTMLSelectElement && element.isConnected && [...element.options].some((option, index) =>
      request.value !== undefined ? option.value === String(request.value)
        : request.label !== undefined ? option.label === String(request.label)
          : request.index !== undefined && index === Number(request.index)), { element: select, request })
  } finally {
    await select.dispose()
  }
  const state = await focusByTab(page, target, marker)
  try {
    const desired = await target.evaluate((element, request) => {
      if (element.tagName !== 'SELECT') throw new Error('Keyboard selection requires a native select control.')
      if (element.multiple) throw new Error('Keyboard navigation requires a single-select native control.')
      const options = [...element.options]
      const matches = option => {
        if (request.value !== undefined) return option.value === String(request.value)
        if (request.label !== undefined) return option.label === String(request.label)
        if (request.index !== undefined) return options.indexOf(option) === Number(request.index)
        return false
      }
      const requestedOptions = options.filter(matches)
      if (requestedOptions.length !== 1) throw new Error(`Requested select option must identify exactly one option; found ${requestedOptions.length} for ${JSON.stringify(request)}.`)
      const option = requestedOptions[0]
      if (option.disabled || option.parentElement?.disabled) throw new Error(`Requested select option is disabled: ${option.label}`)
      const keyboardOptions = options.filter(candidate => !candidate.disabled && !candidate.parentElement?.disabled && !candidate.hidden && !candidate.parentElement?.hidden)
      return {
        index: options.indexOf(option),
        value: option.value,
        label: option.label,
        initialIndex: element.selectedIndex,
        keyboardPosition: keyboardOptions.indexOf(option),
        keyboardOptions: keyboardOptions.map(candidate => ({ value: candidate.value, label: candidate.label })),
      }
    }, request)
    const beforeType = await target.evaluate((element, marker) => ({
      sameElement: window.__cradleA11yInputNodes?.get(marker) === element,
      active: element === document.activeElement,
      value: element.value,
      index: element.selectedIndex,
    }), marker)
    assert.equal(beforeType.sameElement, true, `Keyboard navigation must use the original DOM control: ${state.name}`)
    assert.equal(beforeType.active, true, `Keyboard navigation requires the actual select to own focus: ${state.name}`)
    const keySequence = []
    const stepStates = []
    let index = beforeType.index
    for (let step = 0; index !== desired.index && step < desired.keyboardOptions.length + 1; step++) {
      const key = desired.label[0]
      assert.match(key, /^[\x20-\x7e]$/, `Native keyboard cycling requires a printable keyboard character at the start of the option label: ${state.name}`)
      await page.keyboard.type(key)
      keySequence.push(key)
      const next = await target.evaluate((element, marker) => ({
        sameElement: window.__cradleA11yInputNodes?.get(marker) === element,
        active: element === document.activeElement,
        value: element.value,
        index: element.selectedIndex,
      }), marker)
      stepStates.push(next)
      assert.equal(next.sameElement, true, `Every native character step must preserve the original DOM control: ${state.name}`)
      assert.equal(next.active, true, `Every native character step must keep the select focused: ${state.name}`)
      assert.notEqual(next.index, index, `Native character cycling must advance through the enabled options: ${state.name}`)
      index = next.index
    }
    const afterType = await target.evaluate((element, marker) => ({
      sameElement: window.__cradleA11yInputNodes?.get(marker) === element,
      active: element === document.activeElement,
      value: element.value,
      index: element.selectedIndex,
    }), marker)
    await page.keyboard.press('Tab')
    const afterTab = await target.evaluate((element, marker) => ({
      sameElement: window.__cradleA11yInputNodes?.get(marker) === element,
      active: element === document.activeElement,
      value: element.value,
      index: element.selectedIndex,
    }), marker)
    await page.waitForTimeout(0)
    const observed = await readValueByMarker(page, marker)
    assert.equal(observed.sameElement, true, `Keyboard selection must remain on the same actual DOM control: ${state.name}`)
    assert.equal(observed.value, desired.value, `Keyboard selection must commit the requested option: ${state.name}`)
    const committed = await target.evaluate(element => ({ index: element.selectedIndex, value: element.value }))
    assert.equal(committed.index, desired.index, `Keyboard navigation must commit the requested option index: ${state.name}`)
    assert.equal(afterType.sameElement, true, `Character cycling must preserve the original DOM control: ${state.name}`)
    assert.equal(afterType.active, true, `Character cycling must keep focus on the native select until Tab commits: ${state.name}`)
    assert.equal(afterType.value, desired.value, `Character cycling must select the requested option before Tab: ${state.name}`)
    assert.equal(afterType.index, desired.index, `Character cycling must select the requested option index before Tab: ${state.name}`)
    assert.equal(afterTab.sameElement, true, `Tab commit must preserve the original DOM control: ${state.name}`)
    assert.equal(afterTab.active, false, `A real Tab must leave the completed native select: ${state.name}`)
    assert.equal(afterTab.value, desired.value, `Tab commit must retain the requested value: ${state.name}`)
    assert.equal(afterTab.index, desired.index, `Tab commit must retain the requested index: ${state.name}`)
    return {
      name: state.name,
      control: 'select',
      ...await page.evaluate(() => ({ path: location.pathname, hasQuery: location.search.length > 0, width: innerWidth })),
      method: 'Tab + native repeated initial-character option cycling + Tab commit',
      selectedLabel: desired.label,
      selectedIndex: desired.index,
      startingIndex: desired.initialIndex,
      keyboardPosition: desired.keyboardPosition,
      keyboardOptions: desired.keyboardOptions,
      keySequence: [...keySequence, 'Tab'],
      rawStates: { beforeType, stepStates, afterType, afterTab, committed },
      tabReached: true,
      traversalStart: state.traversalStart,
      tabsToField: state.tabsToTarget,
      focusVisible: state.focused.focusVisible,
      verified: true,
    }
  } finally {
    await removeMarker(page, marker)
  }
}

