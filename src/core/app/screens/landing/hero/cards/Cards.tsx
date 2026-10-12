import type { CSSProperties } from 'react'
import { ORIGIN_Y_PCT } from '../art/camera'
import { bodies, chipBody } from './bodies'
import { cardById, paintOrder, type CardSpec } from './layout'
import { poseAt } from './pose'
import { PERSPECTIVE_CQW } from './projection'
import { Shadow } from './Shadow'
import { stillVars } from './still'
import { visitOf, wideVisit } from './visits'

/** Cards float apart and each lane keeps its own band of the scene, so a fixed paint order (layout.ts) suffices. */
const drawOrder = paintOrder.map(cardById)

function Face({ card }: { card: CardSpec }) {
  const { kind, w, h } = card
  const chip = kind === 'link'
  return <svg viewBox={`0 0 ${w} ${h}`} focusable="false">
    <Shadow w={w} h={h} round={chip} />
    {chip ? chipBody(w) : <>
      <rect width={w} height={h} rx="11" fill="#fdfdfb" stroke="rgba(18,55,46,.08)" />
      {bodies[kind]()}
    </>}
  </svg>
}

/** How a card takes part in the phone scene: shown in its still, joining once motion runs, or not at all. */
const phoneRole = (card: CardSpec) => {
  const visit = visitOf('phone', card.id)
  return visit ? (poseAt(visit, 0).opacity > 0 ? 'still' : 'later') : undefined
}

/** One floating card. The element carries its 3D pose (the motion layer animates it); the SVG draws the card at its nearest size, so it is only ever scaled down and stays crisp; the veil pales it with depth. The server markup is the card where the composed still has it, in the wide scene and, for the cards the phone scene uses, in the phone scene too (hero-art.css picks one). */
function Card({ card }: { card: CardSpec }) {
  const phone = visitOf('phone', card.id)
  const style = { ...stillVars(wideVisit(card.id), ''), ...(phone ? stillVars(phone, 'p') : {}) } as CSSProperties
  const radius = card.kind === 'link' ? '50%' : `${((11 / card.w) * 100).toFixed(3)}% / ${((11 / card.h) * 100).toFixed(3)}%`
  return <div className="lp-fc" data-card={card.id} data-phone={phoneRole(card)} style={style}>
    <Face card={card} />
    <i className="lp-fc-veil" style={{ borderRadius: radius }} />
  </div>
}

/** The cards around the ribbons, in one 3D scene: the container is the camera (its perspective and vanishing point, the centre of the Projects screen), each card is placed in depth on its lane. While `live`, the phone scene's cards that only join once it moves are displayed too, still invisible until their turn. */
export function Cards({ live }: { live: boolean }) {
  return <div className="lp-cards" data-live={live ? '' : undefined} style={{ perspective: `${PERSPECTIVE_CQW}cqw`, perspectiveOrigin: `50% ${ORIGIN_Y_PCT.toFixed(3)}%` }}>
    {drawOrder.map((card) => <Card key={card.id} card={card} />)}
  </div>
}
