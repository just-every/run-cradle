import { activityEntries, automationRuns, automations, decisions, lenses, notificationReads, notifications, risks, sampleInstallations } from './operations'
import { campaignTags, campaigns, deliverables, milestoneDependencies, milestones } from './portfolio'
import { operators, sessions, workspace, workspaceSettings } from './foundation'

export { activityEntries, automationRuns, automations, campaignTags, campaigns, decisions, deliverables, lenses, milestoneDependencies, milestones, notificationReads, notifications, operators, risks, sampleInstallations, sessions, workspace, workspaceSettings }

export const schema = {
  activityEntries,
  automationRuns,
  automations,
  campaignTags,
  campaigns,
  decisions,
  deliverables,
  lenses,
  milestoneDependencies,
  milestones,
  notificationReads,
  notifications,
  operators,
  risks,
  sampleInstallations,
  sessions,
  workspace,
  workspaceSettings,
}
