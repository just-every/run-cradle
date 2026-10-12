export type SeedConfig = {
  workspaceName: string
  landingMessage: string
  productName: string
  showPoweredByCredit: boolean
  /** Show the optional repair application in navigation; this grants no access. */
  enableRepairs?: boolean
}
