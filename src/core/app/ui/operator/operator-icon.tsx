export const OperatorIcon = ({ name }: { name: string }) => {
  const shared = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...shared}>
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M9 21v-7h6v7" />
        </svg>
      );
    case "overview":
      return (
        <svg {...shared}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "grid":
      return (
        <svg {...shared}>
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <path d="M3 10h18M9 4v16M15 4v16" />
        </svg>
      );
    case "risk":
      return (
        <svg {...shared}>
          <path d="m12 3 9 17H3z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "timeline":
      return (
        <svg {...shared}>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="8" cy="6" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="11" cy="18" r="2" />
        </svg>
      );
    case "lens":
      return (
        <svg {...shared}>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4M5 11h12M11 5v12" />
        </svg>
      );
    case "decision":
      return (
        <svg {...shared}>
          <path d="M5 3h14v18l-7-4-7 4z" />
          <path d="m8 9 2 2 4-4" />
        </svg>
      );
    case "automation":
      return (
        <svg {...shared}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <circle cx="12" cy="12" r="5" />
        </svg>
      );
    case "studio":
      return <svg {...shared}><path d="M4 20h16M5 16l3-9 9-3 3 3-3 9zM8 7l9 9" /><circle cx="13" cy="11" r="2" /></svg>;
    case "repair":
      return <svg {...shared}><path d="m14 6 4 4M6 14l-3 7 7-3L21 7l-4-4z" /><path d="m6 14 4 4" /></svg>;
    case "bell":
      return (
        <svg {...shared}>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-3v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L6.6 17l.1-.1A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.6-1H5.2v-3h.2A1.7 1.7 0 0 0 7 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h3v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v3H21a1.7 1.7 0 0 0-1.6 1" />
        </svg>
      );
  }
};
