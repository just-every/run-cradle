import { Clip, EASE, EASE_OUT } from './clip'
import { openingRow, openingSlot } from './opening'
import { ENTER_X, GREEN, type Mark, place, PURPLE, SHOWN, statuses, YELLOW } from './rows'

/** The grid's part of the hero: the ring of rows moving as records arrive, each arrival's highlight, and what cards add to rows already there (due dates, done statuses, linked clients). An addition stays with its row until the row eases out at the bottom and is reset out of sight. A period brings a whole turn of the ring, so every row leaves once a period and the grid repeats with the rest of the hero. */
export type RowAction = { at: number } & ({ add: number } | { mark: Mark })

/** Seconds for the rows to move down a place and the bottom one to ease out; how long a new row waits for that room to open and then takes to slide into it; and between rows arriving together. A new row settles before the next arrival moves it on. */
const MOVE = 0.4
const LEAVE = 0.32
const ENTER = { after: 0.12, takes: 0.28 } as const
const STAGGER = 0.42
if (ENTER.after + ENTER.takes > STAGGER) throw new Error('Hero grid rows must settle before the next arrives')

const POP = { from: 'scale(0.6)', over: 'scale(1.08)', rest: 'scale(1)' } as const

export type RowClips = { row: Clip; hl: Clip; date: Clip; done: Clip | null; link: Clip }

/** The grid's clips for one period's actions, as plan.ts repeats them: each period's arrivals must turn the ring whole, so it repeats too. It opens sparse (opening.ts): the first arrivals fill the empty slots below, pushing nothing out, and once the grid is full it turns as always, so the grid repeats from the second period on. */
export function planRows(actions: readonly RowAction[], periods: number): RowClips[] {
  const arrivals = actions.reduce((n, a) => n + ('add' in a ? a.add : 0), 0)
  if (arrivals !== statuses.length * periods) throw new Error(`Hero grid needs one turn of its ${statuses.length}-row ring a period, not ${arrivals / periods} arrivals`)
  const clips: RowClips[] = statuses.map((status, i) => {
    const hidden = { opacity: 0, transform: POP.from }
    return {
      row: new Clip(`row ${i}`, openingRow(i)),
      hl: new Clip(`row ${i} highlight`, { opacity: 0 }),
      date: new Clip(`row ${i} date`, hidden),
      done: status === GREEN ? null : new Clip(`row ${i} status`, hidden),
      link: new Clip(`row ${i} link`, hidden),
    }
  })
  const ring = { slot: statuses.map((_, i) => openingSlot(i)) }
  const marked: Record<Mark, Set<number>> = { date: new Set(), done: new Set(), link: new Set() }

  const arrive = (t: number) => {
    // The next to arrive is the ring's row before the one at the top, waiting out of sight.
    const next = (ring.slot.indexOf(0) + statuses.length - 1) % statuses.length
    if (ring.slot[next] !== null) throw new Error(`Hero grid row ${next} is on show when it should arrive at ${t.toFixed(2)}s`)
    for (const [i, s] of ring.slot.entries()) {
      if (s === null) continue
      if (s + 1 < SHOWN) { clips[i].row.to(t, MOVE, { transform: place(s + 1) }, EASE_OUT); ring.slot[i] = s + 1; continue }
      // The bottom row eases out, waits at the start, and is cleared of what it carried while out of sight.
      clips[i].row.to(t, LEAVE, { transform: place(SHOWN), opacity: 0 }, EASE_OUT).set(t + LEAVE + 0.01, { transform: place(0, ENTER_X) })
      for (const clip of [clips[i].date, clips[i].done, clips[i].link]) if (clip?.touched) clip.set(t + LEAVE + 0.02, { opacity: 0, transform: POP.from })
      for (const set of Object.values(marked)) set.delete(i)
      ring.slot[i] = null
    }
    // The rows below make room first, quickly, so the new one slides into open space rather than across the row it displaces.
    clips[next].row.to(t + ENTER.after, ENTER.takes, { transform: place(0), opacity: 1 }, EASE_OUT)
    clips[next].hl.to(t + ENTER.after, 0.2, { opacity: 0.34 }, EASE_OUT).to(t + ENTER.after + 0.2, 1.4, { opacity: 0 }, EASE)
    ring.slot[next] = 0
  }

  /** Rows that may take an addition: those on show, top first. */
  const onShow = () => ring.slot
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => s !== null)
    .sort((a, b) => (a.s ?? 0) - (b.s ?? 0))

  const pop = (clip: Clip, t: number) => clip.to(t, 0.16, { opacity: 1, transform: POP.over }, EASE_OUT).to(t + 0.16, 0.24, { transform: POP.rest }, EASE)

  const mark = (t: number, what: Mark) => {
    const free = onShow().filter(({ i }) => !marked[what].has(i) && (what !== 'done' || clips[i].done))
    const picks = what === 'date' ? free.slice(0, 4)
      : what === 'done' ? free.sort((a, b) => [YELLOW, PURPLE].indexOf(statuses[a.i]) - [YELLOW, PURPLE].indexOf(statuses[b.i])).slice(0, 2)
      : free.slice(0, 1)
    if (!picks.length) throw new Error(`Hero grid has no row to take a ${what} at ${t.toFixed(2)}s`)
    picks.forEach(({ i }, n) => {
      const clip = what === 'done' ? clips[i].done : clips[i][what]
      if (!clip) throw new Error(`Hero grid row ${i} cannot take a ${what}`)
      pop(clip, t + n * (what === 'date' ? 0.09 : 0.16))
      clips[i].hl.to(t + n * 0.09, 0.14, { opacity: 0.3 }, EASE_OUT).to(t + n * 0.09 + 0.14, 1.1, { opacity: 0 }, EASE)
      marked[what].add(i)
    })
  }

  const steps = actions.flatMap((a) => ('add' in a ? Array.from({ length: a.add }, (_, n) => ({ t: a.at + n * STAGGER, run: () => arrive(a.at + n * STAGGER) })) : [{ t: a.at, run: () => mark(a.at, a.mark) }]))
  for (const step of steps.sort((a, b) => a.t - b.t)) step.run()
  return clips
}
