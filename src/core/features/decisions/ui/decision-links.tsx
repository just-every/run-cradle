import type { Decision } from './decision-client'

type Links = Pick<Decision, 'supersedes' | 'supersededBy'>

export function DecisionLinks({ supersedes, supersededBy }: Links) {
 if (supersedes === null && supersededBy.length === 0) return null
 return <section aria-label="Related decisions" className="mt-5 min-w-0 space-y-3 rounded-md border border-border p-4 text-sm">
  {supersedes !== null ? <p>Supersedes <a className="cr-link inline-block max-w-full break-words py-1 font-bold text-primary underline" href={`/app/decisions/${encodeURIComponent(supersedes.id)}`}>{supersedes.title}</a></p> : null}
  {supersededBy.length > 0 ? <div><p className="font-bold">Superseded by</p><ul className="mt-2 space-y-2">
   {supersededBy.map(decision => <li key={decision.id}><a className="cr-link inline-block max-w-full break-words py-1 text-primary underline" href={`/app/decisions/${encodeURIComponent(decision.id)}`}>{decision.title}</a></li>)}
  </ul></div> : null}
 </section>
}
