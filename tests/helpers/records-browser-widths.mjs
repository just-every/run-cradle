// CI runs the complete records journeys separately for each viewport.
export function recordsBrowserWidths(widths = [1440, 390, 320]) {
 const selected = process.env.CRADLE_RECORDS_BROWSER_WIDTH
 if (selected === undefined) return widths
 if (!['1440', '390', '320'].includes(selected) || !widths.includes(Number(selected))) throw new Error('CRADLE_RECORDS_BROWSER_WIDTH must select 1440, 390 or 320 from the journey widths')
 // A journey opting into 320 keeps both phone widths in the phone CI shard.
 return selected === '390' ? widths.filter(width => width <= 390) : [Number(selected)]
}
