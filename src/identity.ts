// Cradle's edition identity: what the installed Lobby and the run site say about it.
// `deployment` is the configured workspace name; the Worker replaces it with the
// persisted one (workspace.name) for the Lobby, and the run site never reads it.
import { checkIdentity, type EditionIdentity } from './base/identity'
import { seedConfig } from './ext/config'

export const identity: EditionIdentity = checkIdentity({
  product: seedConfig.productName,
  deployment: seedConfig.workspaceName,
  purpose: '{deployment}’s records, views and business applications, in one private workspace.',
  tagline: seedConfig.landingMessage,
  signInPath: '/signin',
  runSite: 'https://run-cradle.com',
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  band: '/brand/band.svg',
})
