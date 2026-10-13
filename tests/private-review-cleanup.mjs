import assert from 'node:assert/strict'
import { contract } from './contract.mjs'
import { htmlLinks } from './helpers/html-review.mjs'

contract('AUTH-BASE-001 HOME-002 SET-001 NOTIFY-002', 'production sign-in returns home and settings retain independent notification readiness', async () => {
  const { launchBaseAuthorityRuntime } = await import('./helpers/launch-base-authority-runtime.mjs')
  const h = await launchBaseAuthorityRuntime()
  try {
    await h.reconfigure({ NOTIFICATION_MAIL_CONNECTION_ID: undefined })
    const signin = await h.request('/signin')
    assert.equal(signin.status, 200)
    const html = await signin.text()
    const links = htmlLinks(html)
    assert.deepEqual(links.filter(link => link.href.startsWith('/')), [{ href: '/', label: 'Back to home' }])
    assert.doesNotMatch(html, /Open workspace|Return to Cradle|Continue with local development identity/)
    assert.equal(signin.headers.get('set-cookie'), null)
    const capabilities = await h.request('/auth/capabilities')
    assert.equal(capabilities.status, 200)
    assert.deepEqual(await capabilities.json(), { localDevelopmentSignIn: false, magicLink: { status: 'configured' } })

    const owner = await h.bootstrap()
    const signedIn = await h.request('/app', { headers: { cookie: owner.cookie } })
    assert.equal(signedIn.status, 200)
    const response = await h.request('/api/settings', { headers: { cookie: owner.cookie } })
    assert.equal(response.status, 200)
    const { settings } = await response.json()
    assert.deepEqual(settings.requiredSetup, [])
    const notificationMail = settings.capabilities.find(capability => capability.id === 'mail.sender.v1')
    assert.equal(notificationMail.state, 'unconfigured')
    assert.deepEqual(notificationMail.missing, ['mail.sender.v1 connection'])
    assert.equal(settings.email.configured, false)
    assert.equal(h.deliveries.length, 0, 'Configuration reads and owner bootstrap never send mail')
    assert.equal((await h.db.prepare('SELECT count(*) n FROM execution_runs').first()).n, 0)
  } finally {
    await h.close()
  }
})
