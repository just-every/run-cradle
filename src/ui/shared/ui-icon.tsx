/** Small line icons for app controls (chips, change lines, template tiles). Decorative: always aria-hidden. */
const paths = {
  link: <path d="M7 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" />,
  funnel: <path d="M2.5 3.5h11l-4.2 5v4l-2.6 1.2V8.5z" />,
  check: <><circle cx="8" cy="8" r="6.2" /><path d="m5.3 8.2 1.9 1.9 3.5-3.9" /></>,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  minus: <path d="M3.5 8h9" />,
  pencil: <path d="m10.6 2.9 2.5 2.5-7.4 7.4-3 .5.5-3zM9.4 4.1l2.5 2.5" />,
  people: <><circle cx="6" cy="5.5" r="2.3" /><path d="M1.8 13c.4-2.3 2-3.6 4.2-3.6s3.8 1.3 4.2 3.6" /><path d="M10.4 3.4a2.2 2.2 0 0 1 0 4.2M11.7 9.6c1.4.4 2.3 1.6 2.5 3.4" /></>,
  rocket: <><path d="M9.6 2.6c2.2-.6 3.8-.4 3.8-.4s.2 1.6-.4 3.8c-.6 2.3-2.7 4.6-4.6 5.8L5.8 9.2C7 7.3 7.3 3.2 9.6 2.6z" /><circle cx="10.2" cy="5.8" r="1.1" /><path d="M5.8 9.2 4 8.6l1.4-2.2 2.2-.2M8.4 11.8l.6 1.8 2.2-1.4.2-2.2M4.6 11.4c-.9.3-1.6 1.2-1.8 2.4 1.2-.2 2.1-.9 2.4-1.8" /></>,
  folder: <path d="M2 4.5c0-.6.4-1 1-1h3.3l1.4 1.5H13c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" />,
} as const

export type UiIconName = keyof typeof paths

export function UiIcon({ name, size = 14 }: { name: UiIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}
