function paintVisible(value) {
  if (!value || value === 'none' || value === 'transparent') return false
  const colors = [...value.matchAll(/rgba?\(([^)]+)\)/g)].map(match => match[1])
  if (!colors.length) return true
  return colors.some(color => {
    const values = color.split(/[\s,/]+/).filter(Boolean)
    const alpha = values.length >= 4 ? Number.parseFloat(values.at(-1)) : 1
    return alpha > 0
  })
}

export function visibleFocusDelta(style, baseline) {
  if (!baseline) return false
  const finitePx = value => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : 0 }
  const outlineChanged = style.outlineStyle !== baseline.outlineStyle || finitePx(style.outlineWidth) !== finitePx(baseline.outlineWidth) || style.outlineColor !== baseline.outlineColor || finitePx(style.outlineOffset) !== finitePx(baseline.outlineOffset)
  const shadowChanged = style.boxShadow !== baseline.boxShadow
  const borderChanged = finitePx(style.borderWidth) !== finitePx(baseline.borderWidth) || style.borderColor !== baseline.borderColor
  const backgroundChanged = style.backgroundColor !== baseline.backgroundColor
  const visibleOutline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 && paintVisible(style.outlineColor) && outlineChanged
  const visibleShadow = style.boxShadow !== 'none' && paintVisible(style.boxShadow) && shadowChanged
  const visibleBorder = Number.parseFloat(style.borderWidth) > 0 && paintVisible(style.borderColor) && borderChanged
  const visibleBackground = paintVisible(style.backgroundColor) && backgroundChanged
  return Boolean(visibleOutline || visibleShadow || visibleBorder || visibleBackground)
}

export function visibleFocusDecoration(style) {
  const visibleOutline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 && paintVisible(style.outlineColor)
  const visibleShadow = style.boxShadow !== 'none' && paintVisible(style.boxShadow)
  return Boolean(visibleOutline || visibleShadow)
}
