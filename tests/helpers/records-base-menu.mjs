import {closeTablePanel} from './records-table-tools.mjs'
/** Exercise the same Base menu for pointer, keyboard and phone journeys. */
export async function baseMenu(page, action = target => target.click()) {
  await page.waitForFunction(() => /^\/app\/records\/[^/?]+/.test(location.pathname) || !!document.querySelector('.cr-schema-builder'))
  for (const panel of ['Table tools','Sort and group','Filter','Visible columns','Summary','Keyboard shortcuts']) await closeTablePanel(page,panel,action)
  const trigger = page.getByRole('button', { name: /^Base ▾/ })
  await action(trigger)
  const menu = page.getByRole('dialog', { name: 'Base', exact: true })
  await menu.waitFor()
  return menu
}
export async function baseAction(page, name, action = target => target.click()) {
  const menu = await baseMenu(page, action)
  await action(menu.getByRole('button', { name, exact: typeof name === 'string' }).or(menu.getByRole('link', { name, exact: typeof name === 'string' })))
}
export async function chooseBase(page, name, action = target => target.click()) {
  const menu = await baseMenu(page, action)
  await action(menu.getByRole('link', { name, exact: true }))
}
