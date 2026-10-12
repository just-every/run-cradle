/**
 * Buyer-owned configuration for this Cradle deployment.
 *
 * Example: change `workspaceName` to your organisation and
 * `landingMessage` to the one sentence operators should see before sign-in.
 */
import type { SeedConfig } from '../core/shared/config'

export const seedConfig: SeedConfig = {
  workspaceName: 'Cradle workspace',
  landingMessage: 'Your records, views and business applications in one private workspace.',
  productName: 'Cradle',
  showPoweredByCredit: true,
  enableRepairs: false,
}
