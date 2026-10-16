import { parse, parseFragment } from 'parse5'

// Review parsed nodes, never turn stripped markup back into HTML.
function* elements(node) {
  if (node.tagName) yield node
  for (const child of node.childNodes ?? []) yield* elements(child)
  if (node.content) yield* elements(node.content)
}

function textContent(node, includeInputValues = false) {
  if (['script', 'style', 'template'].includes(node.tagName)) return ''
  if (node.nodeName === '#text') return node.value
  if (includeInputValues && node.tagName === 'input') {
    const type = node.attrs.find(attr => attr.name === 'type')?.value.toLowerCase()
    if (['hidden', 'password', 'checkbox', 'radio', 'file', 'image'].includes(type)) return ''
    return node.attrs.find(attr => attr.name === 'value')?.value ?? ''
  }
  return (node.childNodes ?? []).map(child => textContent(child, includeInputValues)).join('')
}

export function htmlText(html) {
  return textContent(parseFragment(html))
}

export function bodyText(html) {
  const body = [...elements(parse(html))].find(node => node.tagName === 'body')
  // SSR freshness includes editable names rendered in form controls.
  return textContent(body, true)
}

export function htmlLinks(html) {
  return [...elements(parseFragment(html))]
    .filter(node => node.tagName === 'a' && node.attrs.some(attr => attr.name === 'href'))
    .map(node => ({ href: node.attrs.find(attr => attr.name === 'href').value, label: textContent(node).trim() }))
}

export function hasHtmlElement(html, tagName) {
  return [...elements(parseFragment(html))].some(node => node.tagName === tagName)
}
