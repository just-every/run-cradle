import assert from 'node:assert/strict'
import { LAUNCH_APP_ID } from './launch-authority-runtime.mjs'
import { accessibilityTabAway } from './accessibility-input.mjs'
import { installKeyboardInteractions } from './accessibility-keyboard.mjs'

export async function verifySettingsMemberErasure({ runtime, page, width, action, capture }) {
  installKeyboardInteractions(page)
  const memberName = `A11y member ${width}`
  const member = await runtime.addPerson({ name: memberName })
  const email = `${member.id.toLowerCase()}@example.test`

  await page.goto(`${runtime.origin}/app/settings`)
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
  const quietStart = page.getByLabel('Quiet hours start', { exact: true })
  const quietEnd = page.getByLabel('Quiet hours end', { exact: true })
  const originalQuietHours = { start: await quietStart.inputValue(), end: await quietEnd.inputValue() }
  await quietStart.fill(originalQuietHours.start)
  await accessibilityTabAway(page, quietStart)
  await quietEnd.fill(originalQuietHours.end)
  await accessibilityTabAway(page, quietEnd)
  assert.deepEqual({ start: await quietStart.inputValue(), end: await quietEnd.inputValue() }, originalQuietHours, 'Actual keyboard entry preserves workspace quiet hours without submitting settings.')
  await capture('settings-quiet-hours-keyboard')
  const people = page.locator('summary').filter({ hasText: 'People and authority' })
  await action(people)
  const application = page.getByLabel('Application', { exact: true })
  await application.waitFor()
  await application.selectOption(LAUNCH_APP_ID)

  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: email, exact: true }) })
  await row.getByRole('button', { name: 'Remove access', exact: true }).waitFor()
  assert.equal(await row.getByRole('cell').nth(0).innerText(), memberName)
  await capture('settings-member-active')

  await action(row.getByRole('button', { name: 'Remove access', exact: true }))
  const removalForm = row.locator('form')
  await removalForm.getByLabel('Reason', { exact: true }).fill('A11y review removal fixture')
  await capture('settings-member-removal-confirm')
  await action(removalForm.getByRole('button', { name: 'Remove access', exact: true }))
  await row.getByRole('button', { name: 'Erase identity', exact: true }).waitFor({ timeout: 30000 })
  const removedState = (await row.getByRole('cell').nth(2).innerText()).trim().toLowerCase()
  assert.equal(removedState, 'removed')
  await capture('settings-member-removed')

  await action(row.getByRole('button', { name: 'Erase identity', exact: true }))
  const erasureForm = row.locator('form')
  await erasureForm.getByLabel('Reason', { exact: true }).fill('A11y review erasure fixture')
  await capture('settings-member-erasure-confirm')
  await action(erasureForm.getByRole('button', { name: 'Erase identity', exact: true }))
  const anonymousName = `Anonymous ${member.id.slice(-8)}`
  const erasedRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: anonymousName, exact: true }) })
  const completion = erasedRow.getByText('Identity erasure and file deletion are complete.', { exact: true })
  await completion.waitFor({ timeout: 30000 })
  const erasedText = await erasedRow.innerText()
  assert.doesNotMatch(erasedText, new RegExp(memberName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(erasedText, new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await capture('settings-member-erased')

  return {
    width,
    route: '/app/settings',
    fixture: { memberName, email },
    states: ['active', 'removal confirmation', 'removed', 'erasure confirmation', 'erased and complete'],
    actions: ['Open People and authority', 'Select Application', 'Remove access', 'Type removal reason', 'Confirm removal', 'Erase identity', 'Type erasure reason', 'Confirm erasure'],
    completionText: await completion.innerText(),
  }
}
