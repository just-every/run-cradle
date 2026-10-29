// CI distributes the complete records journeys across existing workers.
export function recordsBrowserWidths(widths = [1440, 390, 320], {bothPhones=false} = {}) {
 const selected = process.env.CRADLE_RECORDS_BROWSER_WIDTH
 if (selected === undefined) return widths
 const requested=selected.split(',').map(Number)
 if (!requested.length || requested.some(width=>![1440,390,320].includes(width)||!widths.includes(width))) throw new Error('CRADLE_RECORDS_BROWSER_WIDTH must select available journey widths: 1440, 390 or 320')
 // The retained history smoke still checks both phones in its existing worker.
 return bothPhones&&selected==='390' ? widths.filter(width=>width<=390) : widths.filter(width=>requested.includes(width))
}
