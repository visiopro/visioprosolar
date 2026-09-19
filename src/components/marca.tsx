export function Marca({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M14 40a18 18 0 0 1 36 0" fill="none" stroke="var(--color-sol)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="40" r="7" fill="var(--color-sol)" />
      <path d="M10 48h44" stroke="var(--color-nevoa)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
