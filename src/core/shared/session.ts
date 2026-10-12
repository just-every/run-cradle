export type CurrentSession = {
  editorOwner?: boolean
  editorConfigured?: boolean
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
