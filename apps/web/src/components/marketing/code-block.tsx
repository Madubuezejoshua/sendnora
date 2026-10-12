import { cn } from '@sendnaro/ui';

/** Plain, accessible code block (no client JS). Long lines scroll instead of wrapping. */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'border-border overflow-hidden rounded-lg border bg-[hsl(222_47%_8%)] text-slate-100',
        className,
      )}
    >
      {label && (
        <figcaption className="border-b border-white/10 px-4 py-2 font-mono text-xs text-slate-400">
          {label}
        </figcaption>
      )}
      <pre
        tabIndex={0}
        className="focus-visible:ring-ring overflow-x-auto p-4 text-[13px] leading-relaxed focus-visible:outline-none focus-visible:ring-2"
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}
