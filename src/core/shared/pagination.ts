export const collection = <Item>(items: Item[], total = items.length) => ({
  cursor: null,
  items,
  total,
  totalLabel: total > 10_000 ? '10,000+' : String(total),
})
