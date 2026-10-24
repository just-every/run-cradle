// Synthetic production configuration for local Worker checks only. No provider
// connection is installed and these tests never request or dispatch mail.
import {randomBytes} from 'node:crypto'
export const productionBindings={INSTALLATION_KEY:randomBytes(32).toString('hex'),APP_ORIGIN:'https://cradle.authority.test',MAIL_FROM:'noreply@example.test',MAIL_PROVIDER_API_KEY:'synthetic-unused-provider-key',INSTALLATION_RELEASE_ID:'00000000000000000000000782',CONNECTION_ENCRYPTION_KEY_VERSION:'test-v1',CONNECTION_ENCRYPTION_KEY:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='}
