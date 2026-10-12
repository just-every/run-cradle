import type { Pt } from '../art/geometry'
import type { CardKind } from './bodies'

export type CardSpec = {
  /** The card's element and its home lane (lanes.ts). */
  id: string
  kind: CardKind
  side: 'l' | 'r'
  /** Its size, in-plane turn and centre in the approved image, where it floats at home. */
  w: number
  h: number
  rot: number
  at: Pt
}

export type Scene = 'wide' | 'phone'

/** The breakpoint at which the hero shows the phone scene (hero-art.css). */
export const PHONE_QUERY = '(max-width: 599px)'

type Seed = [id: string, kind: CardKind, at: Pt, w: number, h: number, rot: number]

const side = (which: 'l' | 'r', seeds: readonly Seed[]): CardSpec[] =>
  seeds.map(([id, kind, at, w, h, rot]) => ({ id, kind, side: which, at, w, h, rot }))

/** The twelve cards of the approved image, where it places them, top to bottom on each side. Each floats at its place on its own lane; when its turn comes it is drawn along that lane into the Projects screen, and the same card returns along it from the page edge. */
export const cards: readonly CardSpec[] = [
  ...side('l', [
    ['sheet', 'sheet', [159, 285], 138, 108, 8],
    ['list', 'list', [311, 378], 122, 100, 9],
    ['contact', 'contact', [118, 479], 164, 84, 4],
    ['link-l', 'link', [330, 545], 48, 48, 0],
    ['csv', 'csv', [161, 640], 134, 92, -2],
    ['notes', 'notes', [249, 758], 140, 100, -6],
  ]),
  ...side('r', [
    ['calendar', 'calendar', [1327, 307], 102, 90, -6],
    ['checks', 'checks', [1403, 408], 150, 108, -4],
    ['link-r', 'link', [1191, 508], 44, 44, 0],
    ['bolt', 'bolt', [1345, 588], 180, 72, 2],
    ['doc', 'doc', [1237, 678], 127, 76, 5],
    ['brief', 'brief', [1327, 803], 142, 100, 10],
  ]),
]

/** The order the cards are painted in, far to near by their depth at home, so a nearer card overlaps a farther one the right way round. The sheet is the one exception: it is painted before the list, because its swoop dives into the screen just above the list, already farther away than it. */
export const paintOrder: readonly string[] = ['link-l', 'link-r', 'doc', 'notes', 'sheet', 'list', 'bolt', 'csv', 'brief', 'contact', 'checks', 'calendar']
if (paintOrder.length !== cards.length || cards.some((card) => !paintOrder.includes(card.id))) throw new Error('Hero paint order must list every card once')

export const cardById = (id: string): CardSpec => {
  const card = cards.find((c) => c.id === id)
  if (!card) throw new Error(`Hero names an unknown card: ${id}`)
  return card
}
