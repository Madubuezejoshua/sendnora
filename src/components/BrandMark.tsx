export function BrandMark({ light = true }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="26" height="26" rx="7" fill="#22C55E" />
        <path
          d="M7.2 13.3L11.2 17.1L18.8 9.2"
          stroke="#050705"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`font-display text-[17px] font-bold tracking-[-0.02em] ${
          light ? 'text-[#F4F7F4]' : 'text-[#050705]'
        }`}
      >
        Sendnaro
      </span>
    </span>
  );
}
