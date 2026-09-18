import { useId } from "react";

/** The DeSC mark: one squircle split into two interlocking halves. */
export function Logo({ className }: { className?: string }) {
  // Unique ids so several logos on one page don't share a gradient/mask.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="desc">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b5cff" />
          <stop offset="1" stopColor="#36e0d3" />
        </linearGradient>
        <mask id={`m${id}`}>
          <rect width="64" height="64" fill="#fff" />
          <path
            d="M32 -4 C46 11 46 21 32 32 C18 43 18 53 32 68"
            fill="none"
            stroke="#000"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="18" fill={`url(#g${id})`} mask={`url(#m${id})`} />
    </svg>
  );
}
