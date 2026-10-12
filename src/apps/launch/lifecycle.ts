/** Current retained campaign lifecycle policy; shared by validation and presentation. */
export const campaignLifecycle = { phases: ['Planning', 'Build', 'Production', 'Review', 'Launch prep'], statuses: ['On track', 'Watch', 'At risk', 'Blocked'], launchPreparationPhase: 'Launch prep' } as const
