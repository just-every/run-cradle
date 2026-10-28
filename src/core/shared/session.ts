export type CurrentSession = {
  guest?: { appId: string }
  editorOwner?: boolean
  editorConfigured?: boolean
  proposalReviewer?: boolean
  launchInUse?: boolean
  operator: {
    email: string
    id: string
    initials: string
    name: string
  }
  workspace: {
    currency: string
    id: string
    name: string
    timezone: string
  }
  unreadNotifications: number
}

/** A document can retain authenticated identity while its navigation data fails. */
export type DocumentSessionState =
  | (CurrentSession & { launchAvailability: 'available' })
  | (Omit<CurrentSession, 'launchInUse'> & { launchInUse?: never; launchAvailability: 'unavailable' })
