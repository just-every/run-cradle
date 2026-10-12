/** The records grid inside the Projects screen, as a ring of rows. Seven show; the eighth waits out of sight and is the next to arrive. A new record slides in at the top, the others move down a place, and the bottom one eases out and becomes the next to wait, so once full the grid always shows seven rows (the motion opens with fewer, opening.ts). Each row keeps its own status colour; eight arrivals a period bring every row back to its place, so the grid repeats with the rest of the hero. */
export const GREEN = '#9fcf94'
export const YELLOW = '#e9d777'
export const PURPLE = '#b79be8'

/** Status colour of each row of the ring: the still's seven, top to bottom, then the one that waits. */
export const statuses: readonly string[] = [GREEN, GREEN, GREEN, YELLOW, YELLOW, PURPLE, PURPLE, PURPLE]
export const SHOWN = 7

/** What a card can add to a row on show: a due date, a done status (only on a row not already green), a linked client. */
export type Mark = 'date' | 'done' | 'link'
/** What the still's rows carry, by ring: as the grid stands when the opening period ends (rowsPlan.ts), the top two linked to clients, the next four with due dates and the bottom one done. The motion opens without them and adds them as cards land (RowMarks.tsx). */
export const stillMarks: Readonly<Record<number, readonly Mark[]>> = { 0: ['link'], 1: ['link'], 2: ['date'], 3: ['date'], 4: ['date'], 5: ['date'], 6: ['done'] }

/** The vertical centre of the row in place `slot` (0 at the top), in the grid's units. */
export const rowY = (slot: number) => 45 + slot * 24
/** How far left a new row starts as it slides in. */
export const ENTER_X = -28
/** A row's place as the transform the motion layer gives it: in slot `slot`, `x` along. */
export const place = (slot: number, x = 0) => `translate(${x}px, ${rowY(slot)}px)`
