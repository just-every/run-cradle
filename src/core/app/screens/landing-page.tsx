import type { PublicDocument } from '../public-document.server'
import { useSeedConfig } from '../router'
import { Landing } from './landing/Landing'

export const LandingPage = ({ publicDocument }: { publicDocument: PublicDocument }) => {
  const config = useSeedConfig()
  return <Landing productName={config.productName} workspaceName={publicDocument.workspaceName ?? config.workspaceName} landingMessage={config.landingMessage} showCredit={config.showPoweredByCredit} />
}
