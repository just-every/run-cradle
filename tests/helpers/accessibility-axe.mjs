import AxeBuilder from '@axe-core/playwright'
import { sanitizeEvidenceValue } from './accessibility-redaction.mjs'

export const accessibilityTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

function summarize(violations) {
  return violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary })),
  }))
}

function colorContrastReview(page, violations) {
  const candidates = violations.filter(violation => violation.id === 'color-contrast').flatMap(violation => violation.nodes.map(node => ({
    target: node.target,
    failureSummary: node.failureSummary,
  })))
  if (!candidates.length) return Promise.resolve([])
  return page.evaluate(candidates => {
    const channels = value => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) {
        if (!CSS.supports('color', value)) return null
        // Let the same browser convert supported CSS colors (including oklch)
        // into sRGB samples instead of guessing a conversion or ignoring them.
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d', { colorSpace: 'srgb' })
        if (!context) return null
        context.fillStyle = value
        context.fillRect(0, 0, 1, 1)
        const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
        return [red, green, blue, alpha / 255]
      }
      const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat)
      return parts.length >= 3 ? [parts[0], parts[1], parts[2], parts.length >= 4 ? parts[3] : 1] : null
    }
    const composite = (foreground, background) => {
      const alpha = foreground[3]
      return [0, 1, 2].map(index => foreground[index] * alpha + background[index] * (1 - alpha)).concat(1)
    }
    const luminance = color => color.slice(0, 3).map(channel => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const contrast = (left, right) => {
      const values = [luminance(left), luminance(right)].sort((a, b) => b - a)
      return Math.round(((values[0] + 0.05) / (values[1] + 0.05)) * 100) / 100
    }
    return candidates.flatMap(candidate => candidate.target.map(selector => {
      const element = document.querySelector(selector)
      if (!element) return { target: selector, found: false, failureSummary: candidate.failureSummary }
      const style = getComputedStyle(element)
      const foreground = channels(style.color)
      const layers = []
      const backgrounds = []
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const computed = channels(getComputedStyle(ancestor).backgroundColor)
        if (computed && computed[3] > 0) {
          backgrounds.push({ element: `${ancestor.tagName.toLowerCase()}${ancestor.id ? `#${ancestor.id}` : ''}${typeof ancestor.className === 'string' && ancestor.className ? `.${ancestor.className.trim().replace(/\s+/g, '.')}` : ''}`, color: getComputedStyle(ancestor).backgroundColor })
          layers.push(computed)
        }
      }
      let background = [255, 255, 255, 1]
      for (let index = layers.length - 1; index >= 0; index--) background = composite(layers[index], background)
      const renderedForeground = foreground ? composite(foreground, background) : null
      const rect = element.getBoundingClientRect()
      const fontSize = Number.parseFloat(style.fontSize)
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400
      const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)
      return {
        target: selector,
        found: true,
        foreground: style.color,
        background: `rgb(${background.slice(0, 3).map(channel => Math.round(channel)).join(', ')})`,
        backgroundLayers: backgrounds,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        threshold: largeText ? 3 : 4.5,
        contrastRatio: renderedForeground ? contrast(renderedForeground, background) : null,
        backgroundImage: style.backgroundImage,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        failureSummary: candidate.failureSummary,
      }
    }))
  }, candidates)
}

export async function axeReport(page) {
  const wcag = await new AxeBuilder({ page }).withTags(accessibilityTags).analyze()
  const targetSize = await new AxeBuilder({ page }).withRules(['target-size']).analyze()
  return sanitizeEvidenceValue({
    tags: accessibilityTags,
    wcag22aa: summarize(wcag.violations),
    targetSize: summarize(targetSize.violations),
    needsReview: [...summarize(wcag.incomplete), ...summarize(targetSize.incomplete)],
    contrastReview: await colorContrastReview(page, wcag.incomplete),
  })
}

export async function measureAccessibilityLayout(page) {
  return page.evaluate(selector => {
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
    const name = element => {
      const labelledBy = element.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '').join(' ')
      const label = element.getAttribute('aria-label')
      const associated = element.labels ? [...element.labels].map(item => item.innerText).join(' ') : ''
      const imageText = [...element.querySelectorAll('img[alt],svg[aria-label],svg title,[aria-label]')].map(item => item.getAttribute('alt') || item.getAttribute('aria-label') || item.textContent || '').join(' ')
      return (label || labelledBy || associated || element.innerText || element.value || imageText || element.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 160)
    }
    // The DOM stays fixed during this measurement. Cache paths and sibling
    // positions so a large timeline does not enumerate its rows per target.
    const paths = new WeakMap(), positions = new WeakMap(), indexedParents = new WeakSet()
    const selectorPath = element => {
      if (!element || element === document.documentElement) return ''
      if (paths.has(element)) return paths.get(element)
      const parent = element.parentElement
      if (parent && !indexedParents.has(parent)) {
        const groups = new Map()
        for (const child of parent.children) {
          const group = groups.get(child.tagName) ?? []
          group.push(child); groups.set(child.tagName, group)
        }
        for (const group of groups.values()) group.forEach((child, index) => positions.set(child, group.length > 1 ? index + 1 : 0))
        indexedParents.add(parent)
      }
      let part = element.tagName.toLowerCase()
      if (element.id) part += `#${element.id}`
      if (typeof element.className === 'string' && element.className.trim()) part += `.${element.className.trim().replace(/\s+/g, '.')}`
      const position = positions.get(element)
      if (position) part += `:nth-of-type(${position})`
      const prefix = selectorPath(parent), result = prefix ? `${prefix} > ${part}` : part
      paths.set(element, result)
      return result
    }
    const actions = [...new Set(document.querySelectorAll(selector))]
      .filter(element => visible(element) && (element.tabIndex >= 0 || element.matches(':disabled')))
      .map(element => {
        const style = getComputedStyle(element)
        const labels = element.labels ? [...element.labels] : []
        const wrappingLabel = element.closest('label')
        const labelNodes = [...labels, ...(wrappingLabel && !labels.includes(wrappingLabel) ? [wrappingLabel] : [])]
      const logicalBounds = target => {
        const targetRect = target.getBoundingClientRect()
        return {
          x: targetRect.x + window.scrollX,
          y: targetRect.y + window.scrollY,
          right: targetRect.right + window.scrollX,
          bottom: targetRect.bottom + window.scrollY,
        }
      }
      const referenceAreas = [
        { source: 'control', element, bounds: logicalBounds(element) },
        ...labelNodes.map(label => ({ source: 'label', element: label, bounds: logicalBounds(label) })),
      ]
      const inlineContainer = element.closest('p,li,dd,dt,td,th,blockquote,figcaption,address')
      const inlineContextStyle = inlineContainer ? getComputedStyle(inlineContainer) : null
      const inlineText = inlineContainer?.innerText?.replace(element.innerText, '').trim() || ''
      const inlineTextException = element.tagName === 'A' && style.display === 'inline' && Boolean(inlineText)
        return {
          element,
          tag: element.tagName.toLowerCase(),
          selectorPath: selectorPath(element),
          role: element.getAttribute('role') || undefined,
          id: element.id || undefined,
          name: name(element),
          linkPath: element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement ? new URL(element.href).pathname : undefined,
          linkHasQuery: element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement ? new URL(element.href).search.length > 0 : undefined,
          inputType: element.type || undefined,
          tabIndex: element.tabIndex,
          disabled: Boolean(element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'),
          focusable: element.tabIndex >= 0 && !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true',
          inactive: Boolean(element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true'),
          inlineTextException,
        inlineExceptionEvidence: inlineTextException ? {
          ancestor: inlineContainer.tagName.toLowerCase(),
          hasNonTargetText: true,
          nonTargetTextLength: inlineText.length,
          targetLineHeight: style.lineHeight,
          contextLineHeight: inlineContextStyle.lineHeight,
        } : null,
          labelNodes,
        referenceAreas,
          targetAreas: [],
        }
      })

    const previousWindowScroll = { x: window.scrollX, y: window.scrollY }
    const previousNestedScroll = [...document.querySelectorAll('body *')]
      .filter(element => element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)
      .map(element => ({ element, left: element.scrollLeft, top: element.scrollTop }))
    // A tabindex on a scroll region makes it keyboard reachable, not a
    // competing pointer action over its descendants or associated labels.
    const pointerActionSelector = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"]'
    const activeModal = document.querySelector('dialog[open],[role="dialog"][aria-modal="true"],[aria-modal="true"]')
    try {
      for (const action of actions) {
        action.element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
        const hitAreas = action.referenceAreas
        action.targetAreas = hitAreas.map(area => {
          const style = getComputedStyle(area.element)
          const rect = area.element.getBoundingClientRect()
          const width = Math.round(rect.width * 100) / 100
          const height = Math.round(rect.height * 100) / 100
          const candidate = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && style.pointerEvents !== 'none' && width >= 24 && height >= 24
          let checkedPoints = 0
          let failedCount = 0
          const failedPoints = []
          const rectInViewport = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
          const hasPointerAction = action.element.matches(pointerActionSelector)
          const pointerCandidate = hasPointerAction && rectInViewport && style.pointerEvents !== 'none'
          let hitAreaSquare24 = candidate
          let modalInterceptedPoints = 0
          if (!action.inactive && pointerCandidate) {
            const left = rect.left + (rect.width - 24) / 2
            const top = rect.top + (rect.height - 24) / 2
            for (let row = 0; row < 24; row++) for (let column = 0; column < 24; column++) {
              const x = left + column + 0.5
              const y = top + row + 0.5
              const hit = document.elementFromPoint(x, y)
              if (activeModal && activeModal.contains(hit)) modalInterceptedPoints++
              const actionAncestor = hit?.closest(pointerActionSelector)
              const sameAction = hit && (!actionAncestor || actionAncestor === action.element) && (hit === action.element || action.element.contains(hit) || hit === area.element || area.element.contains(hit))
              checkedPoints++
              if (!sameAction) {
                failedCount++
                hitAreaSquare24 = false
                if (failedPoints.length < 12) failedPoints.push({
                  x: Math.round(x * 100) / 100,
                  y: Math.round(y * 100) / 100,
                  hit: hit?.tagName.toLowerCase() || null,
                  hitId: hit?.id || undefined,
                  hitClass: typeof hit?.className === 'string' ? hit.className.slice(0, 120) : undefined,
                  hitPath: hit ? selectorPath(hit) : null,
                  nearestAction: actionAncestor ? `${actionAncestor.tagName.toLowerCase()}${actionAncestor.id ? `#${actionAncestor.id}` : ''}${typeof actionAncestor.className === 'string' && actionAncestor.className ? `.${actionAncestor.className.trim().replace(/\s+/g, '.')}` : ''}` : null,
                  nearestActionPath: actionAncestor ? selectorPath(actionAncestor) : null,
                })
              }
            }
          }
          const modalOcclusionEvidence = activeModal && !activeModal.contains(action.element) && checkedPoints > 0 && modalInterceptedPoints === checkedPoints
            ? {
              dialog: activeModal.getAttribute('aria-label') || activeModal.getAttribute('aria-labelledby') || activeModal.querySelector('h1,h2,h3')?.innerText || activeModal.tagName.toLowerCase(),
              interceptedSamples: modalInterceptedPoints,
              totalSamples: checkedPoints,
              sampleHit: failedPoints[0] ? { tag: failedPoints[0].hit, id: failedPoints[0].hitId, className: failedPoints[0].hitClass } : null,
            }
            : null
          const modalOccludes = Boolean(modalOcclusionEvidence)
          const pointerTarget = pointerCandidate && !modalOccludes
          return {
            source: area.source,
            width,
            height,
            bounds: area.bounds,
            sampleCount: checkedPoints,
            hitAreaSquare24,
            pointerTarget,
            pointerException: pointerTarget ? null : !hasPointerAction ? 'Focusable container without a native or ARIA pointer action; keyboard reachability and visible focus are measured separately.' : modalOcclusionEvidence ? 'Every sampled point in this 24x24 target square was intercepted by the open modal dialog.' : 'The target remains outside the viewport after scrollIntoView or has pointer-events:none; it is not currently a pointer target. Keyboard focus visibility is recorded separately.',
            modalOcclusionEvidence,
            failedCount,
            failedPoints,
            reason: candidate ? (hitAreaSquare24 ? null : '24x24 pixel-center hit tests intercepted outside the associated action') : 'No 24x24 CSS-pixel area exists in this single hit region',
          }
        }).sort((left, right) => Number(right.pointerTarget) - Number(left.pointerTarget) || Number(right.hitAreaSquare24) - Number(left.hitAreaSquare24) || right.width * right.height - left.width * left.height)
        const chosen = action.targetAreas[0]
        action.targetBounds = chosen?.bounds || action.referenceAreas[0].bounds
        action.targetMeets24px = Boolean(chosen?.pointerTarget && chosen.hitAreaSquare24)
        action.effectiveTargetWidth = chosen?.width ?? 0
        action.effectiveTargetHeight = chosen?.height ?? 0
        action.effectiveTargetSource = chosen?.source || 'control'
      }
    } finally {
      for (const scroll of previousNestedScroll) { scroll.element.scrollLeft = scroll.left; scroll.element.scrollTop = scroll.top }
      window.scrollTo(previousWindowScroll.x, previousWindowScroll.y)
    }

    const controls = actions.map(({ element, labelNodes, referenceAreas, ...action }, index) => ({ ...action, sourceElement: element, sourceIndex: index }))
    const publicControls = controls.map(({ sourceElement, sourceIndex, ...action }) => action)
    const inactiveControlsBelow24 = controls.filter(action => action.inactive && !action.targetMeets24px).map(({ sourceElement, sourceIndex, targetAreas, ...action }) => ({
      ...action,
      boundary: 'Inactive native/aria-disabled control; it is not an active pointer action. Geometry is diagnostic and no WCAG exception is asserted.',
      targetAreas,
    }))
    const nonPointerTargets = publicControls.filter(action => action.targetAreas.length > 0 && action.targetAreas.every(area => !area.pointerTarget)).map(action => ({
      tag: action.tag,
      name: action.name,
      role: action.role,
      id: action.id,
      reasons: action.targetAreas.map(area => ({ reason: area.pointerException, modalOcclusionEvidence: area.modalOcclusionEvidence })),
      keyboardFocus: 'Measured separately by the actual Tab traversal and focus-visibility checks.',
    }))
    const scrollContainers = [...document.querySelectorAll('body *')].filter(element => {
      const style = getComputedStyle(element)
      return visible(element) && element.scrollWidth > element.clientWidth + 1 && ['auto', 'scroll'].includes(style.overflowX)
    }).map(element => ({
      tag: element.tagName.toLowerCase(),
      className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
      label: element.getAttribute('aria-label') || element.getAttribute('role') || '',
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    const activePointerControls = controls.filter(action => !action.inactive && action.targetAreas.some(area => area.pointerTarget))
    const targetsBelow24 = activePointerControls.filter(action => !action.targetMeets24px).map(action => {
      const neighbors = actions.filter(other => other.element !== action.sourceElement && !other.inactive && other.targetAreas.some(area => area.pointerTarget)).map(other => {
        const centerX = (action.targetBounds.x + action.targetBounds.right) / 2
        const centerY = (action.targetBounds.y + action.targetBounds.bottom) / 2
        const otherCenterX = (other.targetBounds.x + other.targetBounds.right) / 2
        const otherCenterY = (other.targetBounds.y + other.targetBounds.bottom) / 2
        const closestX = Math.max(other.targetBounds.x, Math.min(centerX, other.targetBounds.right))
        const closestY = Math.max(other.targetBounds.y, Math.min(centerY, other.targetBounds.bottom))
        const distanceToBox = Math.hypot(centerX - closestX, centerY - closestY)
        const centerDistance = Math.hypot(centerX - otherCenterX, centerY - otherCenterY)
        const intersectsSpacingCircle = distanceToBox <= 12 + 1e-6 || (!other.targetMeets24px && centerDistance <= 24 + 1e-6)
        return { distanceToBox, centerDistance, intersectsSpacingCircle, tag: other.tag, role: other.role, name: other.name, targetBounds: other.targetBounds }
      }).sort((left, right) => left.distanceToBox - right.distanceToBox)
      const exceptions = []
      if (action.inlineTextException) exceptions.push({ criterion: '2.5.8 inline text', evidence: action.inlineExceptionEvidence })
      if (neighbors.every(other => !other.intersectsSpacingCircle)) exceptions.push({ criterion: '2.5.8 spacing', evidence: 'The 24 CSS-pixel diameter circle around this target does not intersect another active target; two undersized targets are checked as circles around both centers.' })
      const { sourceElement, sourceIndex, ...reportedAction } = action
      return {
        ...reportedAction,
        inlineException: action.inlineTextException,
        spacingException: neighbors.every(other => !other.intersectsSpacingCircle),
        exceptionReasons: exceptions,
        nearestTargetDistance: neighbors[0]?.distanceToBox ?? null,
        nearbyTargetsWithin12px: neighbors.filter(other => other.intersectsSpacingCircle),
        candidateCount: action.targetAreas.length,
        targetAreas: action.targetAreas,
      }
    })
    return {
      ...(document.documentElement.scrollWidth>innerWidth?{pageOverflowElements:[...document.querySelectorAll('body *')].filter(visible).filter(element=>element.getBoundingClientRect().right>innerWidth).map(element=>({tag:element.tagName,className:typeof element.className==='string'?element.className:'',right:element.getBoundingClientRect().right,width:element.getBoundingClientRect().width,text:element.innerText?.slice(0,160)})).slice(0,80)}:{}),
      viewportWidth: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      controls: publicControls,
      unnamedControls: publicControls.filter(control => !control.name),
      targetsBelow24,
      inactiveControlsBelow24,
      nonPointerTargets,
      scrollContainers,
      openDialogs: [...document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]')].map(dialog => ({
        label: dialog.getAttribute('aria-label') || dialog.getAttribute('aria-labelledby') || dialog.querySelector('h1,h2,h3')?.innerText || '',
        activeElementInside: dialog.contains(document.activeElement),
      })),
    }
  }, 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="menuitem"],[tabindex]')
}
