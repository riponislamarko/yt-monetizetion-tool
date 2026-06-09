/** TubeIntel brand mark: a red rounded square with a white play glyph.
 * Matches src/app/icon.svg (the favicon) so the logo and tab icon stay in sync. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="TubeIntel"
    >
      <rect width="32" height="32" rx="7" fill="#FF0033" />
      <path d="M13 10.5l9 5.5-9 5.5z" fill="#fff" />
    </svg>
  );
}
