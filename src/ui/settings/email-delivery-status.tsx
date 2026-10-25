type Delivery = { id: string; notificationId: string | null; state: 'failed' | 'unknown'; errorMessage: string | null }

function deliveryItems(value: unknown): Delivery[] {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) throw new Error('Email delivery status omitted its items.')
  return value.items.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Email delivery status returned an invalid item.')
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || !['failed', 'unknown'].includes(String(row.state)) || !(row.notificationId === null || typeof row.notificationId === 'string') || !(row.error_message === null || typeof row.error_message === 'string')) throw new Error('Email delivery status returned an invalid outcome.')
    return { id: row.id, notificationId: row.notificationId, state: row.state as Delivery['state'], errorMessage: row.error_message }
  })
}

export function EmailDeliveryStatus({ value }: { value: unknown }) {
  const items = deliveryItems(value)
  if (!items.length) return null
  return <section className="cr-settings-details"><h3>Delivery status</h3><dl>{items.map(item => <div className="cr-tile" key={item.id} data-delivery-id={item.id}>
    <dt style={{ fontSize: 13 }}>{item.state === 'unknown' ? 'Unknown' : 'Failed'}</dt>
    {item.errorMessage ? <dd>{item.errorMessage.replaceAll('_', ' ')}</dd> : null}
    {item.notificationId ? <dd><a className="cr-link" href={`/app/notifications#notification-${encodeURIComponent(item.notificationId)}`}>Open notification</a></dd> : null}
  </div>)}</dl></section>
}
