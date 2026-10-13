import { useEffect, useRef, useState } from "react"
import { cycleModalFocus } from "../../../../ui/modal-focus"
import { campaignHref, formatDate, formatMoney } from "./portfolio-format"
import { CampaignHealth, PersonAvatar, StatusPill } from "./portfolio-presentation"
import type { CampaignSummary } from "./portfolio-types"

export const CampaignInspector = ({
  campaign,
  currency,
  onClose,
}: {
  campaign: CampaignSummary;
  currency: string;
  onClose: () => void;
}) => {
  const [mobile, setMobile] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)")
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    const modal = dialog.current
    if (!mobile || !modal) return
    const trigger = document.activeElement
    modal.showModal()
    const onKeyDown = (event: KeyboardEvent) => cycleModalFocus(event, modal)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      modal.close()
      if (trigger instanceof HTMLElement && trigger.isConnected && trigger.getClientRects().length) trigger.focus()
      else document.querySelector<HTMLButtonElement>(".portfolio-inspector button")?.focus()
    }
  }, [mobile])
  const content = <>
    <header>
      <div>
        <p>Selected campaign</p>
        <h2>{campaign.name}</h2>
        <span>{campaign.code}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close campaign inspector"
      >
        ×
      </button>
    </header>
    <div className="portfolio-inspector-status">
      <StatusPill>{campaign.status}</StatusPill>
      {campaign.riskRating === "None" ? <span>None</span> : <StatusPill>{campaign.riskRating} risk</StatusPill>}
    </div>
    <dl>
      <div>
        <dt>Owner</dt>
        <dd>
          <PersonAvatar person={campaign.owner} />
        </dd>
      </div>
      <div>
        <dt>Phase</dt>
        <dd>{campaign.phase}</dd>
      </div>
      <div>
        <dt>Launch date</dt>
        <dd>{formatDate(campaign.launchDate)}</dd>
      </div>
      <div>
        <dt>Budget</dt>
        <dd>{formatMoney(campaign.budgetMinor, currency)}</dd>
      </div>
      <div>
        <dt>Deliverables</dt>
        <dd>
          {campaign.deliverableComplete} of {campaign.deliverableTotal} complete
        </dd>
      </div>
      <div>
        <dt>Decisions</dt>
        <dd>{campaign.unresolvedDecisionCount} unresolved</dd>
      </div>
    </dl>
    <CampaignHealth campaign={campaign} />
    <a
      className="cr-button"
      href={campaignHref(campaign.id)}
    >
      Open campaign
    </a>
  </>
  return mobile
    ? <dialog ref={dialog} className="portfolio-inspector" aria-label={`${campaign.name} inspector`} onCancel={event => { event.preventDefault(); onClose() }}>{content}</dialog>
    : <aside className="portfolio-inspector" aria-label={`${campaign.name} inspector`}>{content}</aside>
};

