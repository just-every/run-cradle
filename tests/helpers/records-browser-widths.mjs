// CI runs the complete records journeys separately for each viewport.
export function recordsBrowserWidths(widths = [1440, 390]) {
 const selected = process.env.CRADLE_RECORDS_BROWSER_WIDTH
 if (selected === undefined) return widths
 if (!['1440', '390'].includes(selected) || !widths.includes(Number(selected))) throw new Error('CRADLE_RECORDS_BROWSER_WIDTH must select 1440 or 390 from the journey widths')
 return [Number(selected)]
}
