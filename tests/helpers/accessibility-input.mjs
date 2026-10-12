import assert from 'node:assert/strict'
import { focusByTab, removeMarker, tabUntilControlLeft, readValueByMarker } from './accessibility-input-focus.mjs'

import { nativeSelectKeyboardReceipt } from './accessibility-native-select.mjs'

const strictAudit = process.env.CRADLE_A11Y === '1' && process.env.CRADLE_A11Y_CAPTURE_ONLY !== '1'
const optedInPages = new WeakSet()
const patchedPrototypes = new WeakSet()
const receipts = new WeakMap()
let markerSequence = 0

export function accessibilityInputInventory(page) {
  return [...(receipts.get(page) ?? [])]
}

function appendReceipt(page, receipt) {
  if (!receipts.has(page)) receipts.set(page, [])
  receipts.get(page).push(receipt)
  return receipt
}

async function inputDiagnostics(page) {
  return page.evaluate(() => ({
    routePath: location.pathname,
    routeHasQuery: location.search.length > 0,
    active: document.activeElement instanceof HTMLElement ? {
      tag: document.activeElement.tagName.toLowerCase(),
      id: document.activeElement.id,
      ariaLabel: document.activeElement.getAttribute('aria-label'),
      valueLength: 'value' in document.activeElement ? String(document.activeElement.value).length : undefined,
      marker: document.activeElement.getAttribute('data-cradle-a11y-input'),
    } : null,
    controls: [...document.querySelectorAll('textarea,input,select')].map(element => ({
      tag: element.tagName.toLowerCase(),
      type: element.type || undefined,
      id: element.id || undefined,
      valueLength: String(element.value).length,
      labels: element.labels ? [...element.labels].map(label => label.innerText.trim()) : [],
      marker: element.getAttribute('data-cradle-a11y-input'),
      disabled: element.disabled,
      visible: Boolean(element.getClientRects().length),
    })),
    bodyTextLength: document.body.innerText.length,
  }))
}


function modifier() { return process.platform === 'darwin' ? 'Meta' : 'Control' }

async function enterDateParts(page, target, value, type, marker) {
  const info = await target.evaluate((element, type) => ({ locale: navigator.language || 'en-US', value: element.value, type }), type)
  const text = String(value)
  let pieces
  let finalDatePart
  if (type === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
    assert.ok(match, `Keyboard date entry expects YYYY-MM-DD, received ${text}`)
    const [, year, month, day] = match
    const dateParts = await page.evaluate(locale => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(2020, 10, 22)).filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => part.type), info.locale)
    finalDatePart = dateParts.at(-1)
    pieces = dateParts.map(part => ({ part, value: part === 'year' ? year : part === 'month' ? month : day }))
  } else if (type === 'time') {
    const match = /^(\d{2}):(\d{2})$/.exec(text)
    assert.ok(match, `Keyboard time entry expects HH:mm, received ${text}`)
    const timeParts = await page.evaluate(locale => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(2020, 10, 22, 13, 7)).filter(part => ['hour', 'minute', 'dayPeriod'].includes(part.type)).map(part => part.type), info.locale)
    const hour12 = timeParts.includes('dayPeriod')
    const hourValue = hour12 ? String(((Number(match[1]) + 11) % 12) + 1).padStart(2, '0') : match[1]
    pieces = timeParts.map(part => ({ part, value: part === 'hour' ? hourValue : part === 'minute' ? match[2] : Number(match[1]) >= 12 ? 'p' : 'a' }))
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text)
    assert.ok(match, `Keyboard datetime-local entry expects YYYY-MM-DDThh:mm, received ${text}`)
    const [, year, month, day, hour, minute] = match
    const dateParts = await page.evaluate(locale => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(2020, 10, 22)).filter(part => ['year', 'month', 'day'].includes(part.type)).map(part => part.type), info.locale)
    const timeParts = await page.evaluate(locale => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(2020, 10, 22, 13, 7)).filter(part => ['hour', 'minute', 'dayPeriod'].includes(part.type)).map(part => part.type), info.locale)
    const hour12 = timeParts.includes('dayPeriod')
    const hourValue = hour12 ? String(((Number(hour) + 11) % 12) + 1).padStart(2, '0') : hour
    finalDatePart = dateParts.at(-1)
    pieces = [
      ...dateParts.map(part => ({ part, value: part === 'year' ? year : part === 'month' ? month : day })),
      ...timeParts.map(part => ({ part, value: part === 'hour' ? hourValue : part === 'minute' ? minute : Number(hour) >= 12 ? 'p' : 'a' })),
    ]
  }

  const expected = text
  for (let index = 0; index < pieces.length; index++) {
    await page.keyboard.type(pieces[index].value)
    if (type === 'datetime-local' && pieces[index].part === finalDatePart) await page.keyboard.press('ArrowRight')
  }
  const observed = await readValueByMarker(page, marker)
  assert.equal(observed.sameElement, true, `Keyboard ${type} entry must remain on the same actual DOM control after input`)
  assert.equal(observed.value, expected, `Keyboard segmented ${type} entry must produce the requested value (locale ${info.locale}; segments ${pieces.map(piece => piece.part).join(', ')})`)
  return { locale: info.locale, segments: pieces.map(piece => piece.part), ...(type === 'datetime-local' ? { boundaryKeyAfterDate: 'ArrowRight' } : {}) }
}

export async function accessibilityKeyboardFill(page, target, value) {
  if (!strictAudit) return target.fill(value)
  const marker = `input-${markerSequence++}`
  const state = await focusByTab(page, target, marker)
  try {
    let dateEntry
    if (['date', 'time', 'datetime-local'].includes(state.type)) {
      dateEntry = await enterDateParts(page, target, value, state.type, marker)
    } else {
      await page.keyboard.press(`${modifier()}+A`)
      await page.keyboard.press('Backspace')
      const text = String(value)
      const lines = text.split('\n')
      for (let index = 0; index < lines.length; index++) {
        if (lines[index]) await page.keyboard.type(lines[index])
        if (index < lines.length - 1) {
          assert.equal(state.tag, 'textarea', `Newline keyboard entry requires a textarea: ${state.name}`)
          await page.keyboard.press('Enter')
        }
      }
      const observed = await readValueByMarker(page, marker)
      if (!observed.sameElement) throw new Error(`Keyboard input replaced the actual DOM control after typing: ${state.name}; requestedLength=${text.length}; page=${JSON.stringify(await inputDiagnostics(page))}`)
      if (observed.value !== text) throw new Error(`Keyboard typing did not enter the requested value: ${state.name}; requestedLength=${text.length}; actualLength=${observed.value.length}`)
    }
    return appendReceipt(page, {
      name: state.name,
      control: state.type || state.tag,
      ...await page.evaluate(() => ({ path: location.pathname, hasQuery: location.search.length > 0, width: innerWidth })),
      method: ['date', 'time', 'datetime-local'].includes(state.type) ? 'Tab + segmented keyboard entry' : 'Tab + select-all + keyboard typing',
      ...(dateEntry ? dateEntry : {}),
      tabReached: true,
      traversalStart: state.traversalStart,
      tabsToField: state.tabsToTarget,
      shiftTabsToFirstSegment: state.shiftTabsToFirstSegment,
      focusVisible: state.focused.focusVisible,
      verified: true,
    })
  } finally {
    await removeMarker(page, marker)
  }
}

function normalizeSelectValue(options) {
  assert.ok(!Array.isArray(options), 'Keyboard select helper accepts one option at a time')
  return typeof options === 'object' && options !== null ? options : { value: options }
}

export async function accessibilityKeyboardSelect(page, target, options) {
  if (!strictAudit) return target.selectOption(options)
  return appendReceipt(page, await nativeSelectKeyboardReceipt(page, target, normalizeSelectValue(options), `input-${markerSequence++}`))
}

export async function accessibilityKeyboardSetFiles(page, target, files) {
  if (!strictAudit) return target.setInputFiles(files)
  const marker = `input-${markerSequence++}`
  const state = await focusByTab(page, target, marker)
  try {
    assert.equal(state.type, 'file', `Keyboard file selection requires a file input: ${state.name}`)
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 5000 })
    await page.keyboard.press('Space')
    const chooser = await chooserPromise
    await chooser.setFiles(files)
    return appendReceipt(page, {
      name: state.name,
      control: 'file input',
      ...await page.evaluate(() => ({ path: location.pathname, hasQuery: location.search.length > 0, width: innerWidth })),
      method: 'Tab + Space to open file picker; test fixture supplied at OS boundary',
      osDialogReviewed: false,
      tabReached: true,
      traversalStart: state.traversalStart,
      tabsToField: state.tabsToTarget,
      focusVisible: state.focused.focusVisible,
      verified: true,
    })
  } finally {
    await removeMarker(page, marker)
  }
}

export async function accessibilityTabAway(page, target) {
  if (!strictAudit) return target.blur()
  const metadata = await target.evaluate(element => ({
    name: element.getAttribute('aria-label') || [...(element.labels || [])].map(label => label.innerText).join(' ') || element.name || element.type || element.tagName.toLowerCase(),
    focused: element === document.activeElement,
    path: location.pathname,
    hasQuery: location.search.length > 0,
  }))
  assert.equal(metadata.focused, true, `Keyboard Tab-out requires the current field to own focus: ${metadata.name}`)
  const tabsToLeave = await tabUntilControlLeft(page, target)
  assert.ok(tabsToLeave, `Real Tabs must leave the completed field, including its native segments: ${metadata.name}`)
  return appendReceipt(page, { name: metadata.name, control: 'field', method: 'Tab to the next actual control', tabsToLeave, tabAway: true, path: metadata.path, hasQuery: metadata.hasQuery })
}

export function installKeyboardInput(page) {
  if (!strictAudit) return
  const prototype = Object.getPrototypeOf(page.locator('body'))
  optedInPages.add(page)
  if (patchedPrototypes.has(prototype)) return
  const original = {
    fill: prototype.fill,
    selectOption: prototype.selectOption,
    setInputFiles: prototype.setInputFiles,
  }
  Object.defineProperties(prototype, {
    fill: { configurable: true, writable: true, value: function(value, options) { const owner = this.page(); return strictAudit && optedInPages.has(owner) ? accessibilityKeyboardFill(owner, this, value) : original.fill.call(this, value, options) } },
    selectOption: { configurable: true, writable: true, value: function(options, selectOptions) { const owner = this.page(); return strictAudit && optedInPages.has(owner) ? accessibilityKeyboardSelect(owner, this, options) : original.selectOption.call(this, options, selectOptions) } },
    setInputFiles: { configurable: true, writable: true, value: function(files, options) { const owner = this.page(); return strictAudit && optedInPages.has(owner) ? accessibilityKeyboardSetFiles(owner, this, files) : original.setInputFiles.call(this, files, options) } },
  })
  patchedPrototypes.add(prototype)
}
