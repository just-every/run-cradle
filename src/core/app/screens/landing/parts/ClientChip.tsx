import { Icon } from './Icon'

/** A linked-record chip, as a Client cell or a board card shows it. */
export function ClientChip({ name }: { name: string }) {
  return <span className="lp-chip lp-chip--link"><Icon name="link" />{name}</span>
}
