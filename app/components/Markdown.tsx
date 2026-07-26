'use client';

import { useMemo } from 'react';
import { parseMarkdown, type MdBlock, type MdInline } from '@/lib/markdown';
import { CodeBlock } from './ui/CodeBlock.tsx';

function Inline({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'code':
            return (
              <code
                key={i}
                className="rounded border border-ink-700 bg-ink-800 px-1 py-px font-mono text-[11.5px] text-forge-500"
              >
                {node.text}
              </code>
            );
          case 'strong':
            return (
              <strong key={i} className="font-semibold text-ink-50">
                {node.text}
              </strong>
            );
          case 'em':
            return (
              <em key={i} className="italic">
                {node.text}
              </em>
            );
          case 'strike':
            return (
              <span key={i} className="text-ink-400 line-through">
                {node.text}
              </span>
            );
          case 'link':
            return (
              // Agent output is untrusted text; noreferrer + noopener keeps a
              // link in a log from reaching back into this tab.
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-info underline decoration-info/40 underline-offset-2 hover:decoration-info"
              >
                {node.text}
              </a>
            );
          default:
            return <span key={i}>{node.text}</span>;
        }
      })}
    </>
  );
}

function Block({ block }: { block: MdBlock }) {
  switch (block.type) {
    case 'heading': {
      const size =
        block.level <= 1 ? 'text-[15px]' : block.level === 2 ? 'text-[13.5px]' : 'text-[12.5px]';
      return (
        <p className={`mt-3 mb-1 font-semibold text-ink-50 first:mt-0 ${size}`}>
          <Inline nodes={block.inline} />
        </p>
      );
    }
    case 'code':
      return <CodeBlock className="my-2" code={block.code} lang={block.lang} />;
    case 'list':
      return (
        <ul className="my-1.5 space-y-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2" style={{ paddingLeft: `${item.depth * 14}px` }}>
              {block.ordered ? (
                <span className="w-4 shrink-0 text-right text-ink-400 tabular-nums">{i + 1}.</span>
              ) : (
                <span className="mt-[7.5px] h-1 w-1 shrink-0 rounded-full bg-forge-500/70" />
              )}
              <span className="min-w-0 flex-1 leading-[1.6]">
                <Inline nodes={item.inline} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'quote':
      return (
        <blockquote className="my-2 border-l-2 border-forge-500/40 bg-forge-500/5 py-1 pl-3 text-ink-200">
          <Inline nodes={block.inline} />
        </blockquote>
      );
    case 'table':
      return (
        <div className="my-2 overflow-x-auto rounded-md border border-ink-700">
          <table className="w-full border-collapse text-[11.5px]">
            <thead className="bg-ink-850">
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    className="border-b border-ink-700 px-2.5 py-1.5 text-left font-semibold text-ink-100"
                  >
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="odd:bg-ink-850/40">
                  {row.map((cell, j) => (
                    <td key={j} className="border-b border-ink-800 px-2.5 py-1.5 align-top">
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr className="my-3 border-ink-700" />;
    default:
      return (
        <p className="my-1.5 whitespace-pre-wrap break-words leading-[1.65] first:mt-0">
          <Inline nodes={block.inline} />
        </p>
      );
  }
}

/** Renders assistant Markdown as React nodes — never as HTML. */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`text-[12.5px] text-ink-100 ${className}`}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
