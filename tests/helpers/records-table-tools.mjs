export async function tableTools(page, action = control => control.click()) {
 for(const name of ['Sort and group','Visible columns','Summary','Keyboard shortcuts']) await closeTablePanel(page,name,action)
 const menu = page.getByRole('dialog', { name: 'Table tools', exact: true })
 if (!await menu.isVisible()) await action(page.getByRole('button', { name: 'Table tools', exact: true }))
 await menu.waitFor()
 return menu
}
export async function tableAction(page, name, action = control => control.click()) {
 const menu = await tableTools(page, action)
 await action(menu.getByRole('button', { name, exact: true }))
}
export async function closeTablePanel(page, name, action = control => control.click()) {
 const panel = page.getByRole('dialog', { name, exact: true })
 if (await panel.isVisible()) await action(panel.getByRole('button', { name: 'Close', exact: true }))
}
export async function viewLink(page, name, action = control => control.click()) {
 await page.locator('.cr-view-bar').waitFor()
 const bar = page.getByRole('navigation', { name: 'Record views', exact: true })
 if (await bar.isVisible()) return bar.getByRole('link', { name, exact: true })
 const sheet = page.getByRole('dialog', { name: 'Views', exact: true })
 if (!await sheet.isVisible()) await action(page.locator('.cr-view-bar__opener'))
 return sheet.getByRole('link', { name, exact: true })
}
export async function displayAction(page, name, action = control => control.click()) {
 for(const panel of ['Sort and group','Visible columns','Summary','Keyboard shortcuts','Table tools']) await closeTablePanel(page,panel,action)
 if (name === 'Form') return tableAction(page, 'Forms', action)
 await action(await viewLink(page, name, action))
}
export async function sortAndGroup(page, action = control => control.click()) {
 const panel=page.getByRole('dialog',{name:'Sort and group',exact:true})
 if(!await panel.isVisible()) await action(page.getByRole('button',{name:'Sort and group',exact:true}))
 return panel
}
export async function tableCommand(page, name, journey, command='record.patch') {
 const menu=await tableTools(page,journey.action)
 return journey.command(menu.getByRole('button',{name,exact:true}),command)
}
