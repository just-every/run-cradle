/** Shared, hidden SVG definitions for the page: the ribbon strand with its gradients, and the line icons the illustrations use. */
export function Defs() {
  return <svg className="lp-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="lp-gd" gradientUnits="userSpaceOnUse" x1="0" x2="300" y1="0" y2="0"><stop offset="0" stopColor="#12372e" stopOpacity="0" /><stop offset=".4" stopColor="#12372e" /><stop offset="1" stopColor="#0d302c" /></linearGradient>
      <linearGradient id="lp-gl" gradientUnits="userSpaceOnUse" x1="0" x2="300" y1="0" y2="0"><stop offset="0" stopColor="#d7f25b" stopOpacity="0" /><stop offset=".4" stopColor="#d7f25b" /><stop offset="1" stopColor="#c3e23d" /></linearGradient>
      <linearGradient id="lp-gs" gradientUnits="userSpaceOnUse" x1="0" x2="300" y1="0" y2="0"><stop offset="0" stopColor="#b9d2bb" stopOpacity="0" /><stop offset=".4" stopColor="#b9d2bb" /><stop offset="1" stopColor="#a9c6ad" /></linearGradient>
      <symbol id="lp-strand" viewBox="0 0 300 200" preserveAspectRatio="none">
        <path d="M0 52 C90 36 170 120 300 100" stroke="url(#lp-gd)" strokeWidth="16" fill="none" strokeLinecap="round" />
        <path d="M0 118 C80 140 180 76 300 98" stroke="url(#lp-gl)" strokeWidth="11" fill="none" strokeLinecap="round" />
        <path d="M0 172 C100 170 190 130 300 102" stroke="url(#lp-gs)" strokeWidth="22" fill="none" strokeLinecap="round" />
        <path d="M0 84 C100 90 190 104 300 100" stroke="url(#lp-gd)" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".6" />
        <rect x="64" y="24" width="14" height="7" rx="2" fill="#d7f25b" transform="rotate(-18 64 24)" />
        <rect x="120" y="150" width="12" height="6" rx="2" fill="#b9d2bb" transform="rotate(14 120 150)" />
      </symbol>
      <symbol id="lp-i-link" viewBox="0 0 16 16"><path d="M7 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" /></symbol>
      <symbol id="lp-i-check" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" /><path d="m5.3 8.2 1.9 1.9 3.5-3.9" /></symbol>
      <symbol id="lp-i-spark" viewBox="0 0 16 16"><path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" /></symbol>
    </defs>
  </svg>
}
