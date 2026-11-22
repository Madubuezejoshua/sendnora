import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CodeBlock({
  label,
  code,
  maxHeight,
}: {
  label: string;
  code: string;
  maxHeight?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#090D0A] text-[#E6ECE7]">
      <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] bg-[#0D130E] px-4 py-2.5">
        <span className="font-mono text-xs text-[#9AA69D] truncate">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-[#A8B3AA] transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E] whitespace-nowrap shrink-0"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#22C55E]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-[#DDE6DF]"
        style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
