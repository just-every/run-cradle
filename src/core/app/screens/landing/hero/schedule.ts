/** The hero's one clock. Everything that moves with the story (cards, the light on their ribbons, the ripple where they enter, what appears in the Projects screen) is a pure function of seconds since the motion began, so the server's still is its frame zero and every layer stays in step.
 *
 * The story: the cards float at home; every EVERY seconds one, alternating sides, is drawn into the screen along its ribbon, and what it carries appears in the screen as it lands; then a fresh card drifts in from the page edge to the open place. The rhythm never breaks: the time from the last card of the order to the first is the same as between any two. So a card taken late in one period is still on its way back as the next begins, and the steady state never has every card at home at once. The still, which does, is the start of an opening period in which each card simply waits at home for its first turn, while the Projects screen starts sparse and fills as the first cards land (screen/opening.ts); from PERIOD on, everything repeats every PERIOD seconds, and the opening ends exactly where that repetition stands, because by then the same absorptions have happened. */

/** The cards in the order they are taken in, alternating sides. Each is taken once a period. The order is a ring, and the opening enters it at the list, so the first landings fill the sparse screen fastest: two rows, the empty field, three rows (the grid is full), then the brief. */
export const order: readonly string[] = ['list', 'doc', 'csv', 'brief', 'contact', 'calendar', 'notes', 'checks', 'sheet', 'link-r', 'link-l', 'bolt']

/** Seconds between one absorption and the next, everywhere, the turn of the period included. */
const EVERY = 2.25
/** Seconds of one repetition of the steady state: every card's turn once. */
export const PERIOD = order.length * EVERY

/** Seconds of one card's absorption (anticipation, then the swoop), how long its place stays open before a fresh card sets out for it, and that card's slow drift from the page edge to home. The open place and the long drift keep the scene in motion between absorptions: at any moment two or three cards are on their way in or out while the rest float at home. */
export const ABSORB = 1.15
export const PAUSE = 1.5
export const REFILL = 5

/** The share of the absorption at which a card passes under the screen's edge: the moment it lands. */
export const LAND = 0.85

/** When the first absorption starts: at once, while the motion is still easing in from the still, so the first card lands about a second after the motion begins. Its anticipation starts from rest, so starting it this early never jolts. */
export const FIRST = 0.15

/** When the `i`th card of the order starts its first absorption on wide screens. */
export const absorbAt = (i: number) => FIRST + EVERY * i

/** Seconds since the latest occurrence, at or before `t`, of a moment that first happens at `at` and then every PERIOD; Infinity before the first. */
export const sinceLast = (at: number, t: number) => (t < at ? Infinity : (t - at) % PERIOD)
/** Seconds from `t` to the next occurrence, at or after it, of a moment that first happens at `at` and then every PERIOD. */
export const untilNext = (at: number, t: number) => (t <= at ? at - t : (PERIOD - ((t - at) % PERIOD)) % PERIOD)
/** The occurrences of such a moment within the opening and the first repetition, [0, 2 PERIOD]: where sampled motion may jump. */
export const occurrences = (at: number) => [0, 1, 2].map((n) => at + n * PERIOD).filter((t) => t > 0 && t < 2 * PERIOD)
