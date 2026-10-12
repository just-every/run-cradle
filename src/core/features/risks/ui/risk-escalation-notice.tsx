export function RiskEscalationNotice({ decision }: { decision: { id: string; title: string } | null }) {
 return <p role="status" className="rounded border border-border bg-card p-4">Risk escalated. {decision ? <a className="cr-link underline" href={`/app/decisions/${encodeURIComponent(decision.id)}`}>Open decision: {decision.title}</a> : 'No decision was created under the current policy.'}</p>
}
