// Ícones de traço em SVG, 16x16, herdando a cor do texto.
const strokeIconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function MicIcon({ off = false }: { off?: boolean }) {
  return (
    <svg {...strokeIconProps}>
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
      {off && <path d="M2 2l12 12" />}
    </svg>
  );
}

export function CamIcon({ off = false }: { off?: boolean }) {
  return (
    <svg {...strokeIconProps}>
      <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
      <path d="M10.5 7l4-2.5v7l-4-2.5" />
      {off && <path d="M2 2l12 12" />}
    </svg>
  );
}

export function ScreenIcon() {
  return (
    <svg {...strokeIconProps}>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14.5h5M8 11.5v3" />
    </svg>
  );
}

export function PhoneIcon() {
  return (
    <svg {...strokeIconProps}>
      <path d="M4 1.5l2 3-1.5 1.5a8 8 0 0 0 5.5 5.5L11.5 10l3 2-1 2.5c-6 .5-12-5.5-12-11.5z" />
    </svg>
  );
}
