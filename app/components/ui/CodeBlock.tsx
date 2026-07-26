'use client';

import { useMemo, useState } from 'react';
import { highlight } from '@/lib/highlight';
import { Icon } from './icons.tsx';
import { CopyButton } from './primitives.tsx';

/**
 * Syntax-highlighted code with a collapse for long blocks.
 *
 * Agent output is full of 400-line file writes; rendering them at full height
 * turns the transcript into a scroll marathon, so anything past `collapseAfter`
 * lines is clipped behind a "show all" control that reports what it is hiding.
 */
export function CodeBlock({
  code,
  lang,
  filename,
  collapseAfter = 18,
  showLineNumbers = false,
  className = '',
}: {
  code: string;
  lang?: string | null;
  filename?: string | null;
  collapseAfter?: number;
  showLineNumbers?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = useMemo(() => code.replace(/\n$/, '').split('\n'), [code]);
  const clipped = !expanded && lines.length > collapseAfter;
  const shown = clipped ? lines.slice(0, collapseAfter) : lines;

  const rendered = useMemo(
    () =>
      shown.map((line, index) => (
        <div key={index} className="flex">
          {showLineNumbers && (
            <span className="w-9 shrink-0 select-none pr-2.5 text-right text-ink-500 tabular-nums">
              {index + 1}
            </span>
          )}
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {highlight(line, lang ?? undefined).map((token, i) => (
              <span key={i} className={token.cls}>
                {token.text}
              </span>
            ))}
          </span>
        </div>
      )),
    [shown, lang, showLineNumbers],
  );

  return (
    <figure
      className={`overflow-hidden rounded-md border border-ink-700 bg-ink-900/70 ${className}`}
    >
      <figcaption className="flex items-center gap-2 border-b border-ink-700 bg-ink-850/60 px-2.5 py-1">
        {filename ? (
          <>
            <Icon name="file" size={11.5} className="text-ink-500" />
            <span className="truncate font-mono text-[10.5px] text-ink-300">{filename}</span>
          </>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
            {lang ?? 'text'}
          </span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-ink-500 tabular-nums">{lines.length} ln</span>
        <CopyButton text={code} size="xs" title="Copy code" />
      </figcaption>

      <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11.5px] leading-[1.55]">
        {rendered}
      </pre>

      {(clipped || expanded) && lines.length > collapseAfter && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-ink-700 bg-ink-850/60 py-1 text-[10.5px] text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        >
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={12} />
          {expanded ? 'Collapse' : `Show ${lines.length - collapseAfter} more lines`}
        </button>
      )}
    </figure>
  );
}
