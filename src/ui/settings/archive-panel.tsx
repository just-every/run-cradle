import { useEffect } from 'react'
import { useCommand, useResource } from '../shared/api'
import { CommandFeedback, ResourceState } from '../shared/presentation'
type ArchiveProgress = { id: string; kind: 'export'; state: 'queued' | 'running' | 'complete' | 'failed'; stage: string; percent: number | null; errors: string[]; checksumsVerified: boolean; equivalent: boolean | null; semanticHash: string | null }
export function ArchivePanel() {
  const command = useCommand<{ id: string; state: 'queued' }>('installation-export')
  const jobId = command.result.state === 'committed' ? command.result.value.id : 'runId' in command.result ? command.result.runId : undefined
  return <section className="cr-card cr-archive"><h2>Export your installation</h2><p>Create a portable archive of the data and source you are permitted to export. Connections and delegated authority need explicit review when restoring elsewhere.</p><button className="cr-button cr-button--quiet" disabled={!['idle', 'failed'].includes(command.result.state)} onClick={() => void command.submit('/api/v1/commands/export.start', { scope: 'installation', format: 'archive' }, [])}>Prepare archive</button>{command.result.state !== 'committed' && <CommandFeedback {...command} />}{jobId && <ArchiveStatus id={jobId} />}</section>
}
function ArchiveStatus({ id }: { id: string }) {
  const archive = useResource<ArchiveProgress>(`/api/v1/archive-jobs/${id}`)
  const state = archive.resource.state === 'ready' ? archive.resource.data.state : null
  useEffect(() => { if (state !== 'queued' && state !== 'running') return; const timer = setTimeout(archive.refresh, 2500); return () => clearTimeout(timer) }, [archive.resource])
  return <ResourceState resource={archive.resource} operation="archive progress" retry={archive.refresh}>{job => <div className="cr-notice"><p>{job.state === 'complete' ? 'Archive prepared.' : job.state === 'failed' ? 'The archive could not be completed.' : 'Preparing your archive…'}{job.percent !== null && ` ${job.percent}%`}</p>{job.errors.map((error, index) => <p key={index} className="cr-error">{error}</p>)}{job.state === 'complete' && job.checksumsVerified ? <a className="cr-button" href={`/api/v1/archive-jobs/${job.id}/content`}>Download verified archive</a> : job.state === 'complete' ? <p>Verification is incomplete. The archive is not ready to download.</p> : null}<details><summary>Archive integrity</summary><p>Stage: {job.stage}. Checksums: {job.checksumsVerified ? 'verified' : 'not verified'}.</p>{job.semanticHash && <p>Semantic hash {job.semanticHash}</p>}</details></div>}</ResourceState>
}
