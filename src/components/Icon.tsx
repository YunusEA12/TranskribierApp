// Small stroke icon set (24×24). Drawn for this app; no third-party assets.

const PATHS = {
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" />
    </>
  ),
  history: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.2" />
      <circle cx="4.5" cy="12" r="1.2" />
      <circle cx="4.5" cy="18" r="1.2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </>
  ),
  upload: <path d="M12 15.5V4M7 8.5 12 4l5 4.5M4.5 15v4.5h15V15" />,
  download: <path d="M12 4v11.5M7 11l5 4.5 5-4.5M4.5 15v4.5h15V15" />,
  share: <path d="M12 14V3.5M8 7l4-3.5L16 7M7 11H5v9.5h14V11h-2" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  trash: <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  back: <path d="M14.5 5 7.5 12l7 7" />,
  vault: (
    <>
      <path d="M6 3.5h10.5A2.5 2.5 0 0 1 19 6v14.5H8.5A2.5 2.5 0 0 1 6 18z" />
      <path d="M6 18a2.5 2.5 0 0 1 2.5-2.5H19M10 8h5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.2v.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="m11 12.5 8.5-8.5M16.5 7l2.5 2.5" />
    </>
  ),
  external: <path d="M13.5 4.5h6v6M19.5 4.5l-9 9M17.5 14v5.5h-13v-13H10" />,
  person: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  retry: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
} as const;

const FILLED = {
  pause: (
    <>
      <rect x="6" y="5" width="4.2" height="14" rx="1.2" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.2" />
    </>
  ),
  play: <path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.2" />,
} as const;

export type IconName = keyof typeof PATHS | keyof typeof FILLED;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const filled = name in FILLED;
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {filled ? FILLED[name as keyof typeof FILLED] : PATHS[name as keyof typeof PATHS]}
    </svg>
  );
}
