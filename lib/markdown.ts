/**
 * A small Markdown parser for assistant messages. Client-safe, no dependencies.
 *
 * Agents answer in Markdown — headings, bullets, fenced code — and the old log
 * pane printed the raw asterisks and backticks. This covers what actually shows
 * up in agent output (fences, lists, headings, quotes, tables, inline code,
 * emphasis, links) and treats anything else as literal text, which is the safe
 * failure mode for a log viewer.
 *
 * Nothing here produces HTML: the parser returns data, and React renders it, so
 * there is no path from agent output to `dangerouslySetInnerHTML`.
 */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'strike'; text: string }
  | { type: 'link'; text: string; href: string };

export type MdBlock =
  | { type: 'p'; inline: MdInline[] }
  | { type: 'heading'; level: number; inline: MdInline[] }
  | { type: 'code'; lang: string | null; code: string }
  | { type: 'list'; ordered: boolean; items: { inline: MdInline[]; depth: number }[] }
  | { type: 'quote'; inline: MdInline[] }
  | { type: 'table'; head: MdInline[][]; rows: MdInline[][][] }
  | { type: 'hr' };

const INLINE_PATTERN =
  /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|(?<![*\w])\*([^*\n]+?)\*(?!\*)|(?<![_\w])_([^_\n]+?)_(?!_)|\[([^\]]+)\]\(([^)\s]+)[^)]*\)|(https?:\/\/[^\s<>()]+)/g;

export function parseInline(source: string): MdInline[] {
  const nodes: MdInline[] = [];
  let lastIndex = 0;
  INLINE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(source)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: source.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined) nodes.push({ type: 'code', text: match[2].trim() });
    else if (match[3] !== undefined) nodes.push({ type: 'strong', text: match[3] });
    else if (match[4] !== undefined) nodes.push({ type: 'strong', text: match[4] });
    else if (match[5] !== undefined) nodes.push({ type: 'strike', text: match[5] });
    else if (match[6] !== undefined) nodes.push({ type: 'em', text: match[6] });
    else if (match[7] !== undefined) nodes.push({ type: 'em', text: match[7] });
    else if (match[8] !== undefined && match[9] !== undefined) {
      nodes.push({ type: 'link', text: match[8], href: match[9] });
    } else if (match[10] !== undefined) {
      nodes.push({ type: 'link', text: match[10], href: match[10] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) nodes.push({ type: 'text', text: source.slice(lastIndex) });

  return nodes.length ? nodes : [{ type: 'text', text: source }];
}

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEP = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join('\n').trim();
    if (text) blocks.push({ type: 'p', inline: parseInline(text) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;

    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const marker = fence[1] as string;
      const body: string[] = [];
      i++;
      // An unterminated fence runs to the end of the message — that is exactly
      // what a still-streaming code block looks like, so it must still render.
      while (i < lines.length && !new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(lines[i] as string)) {
        body.push(lines[i] as string);
        i++;
      }
      blocks.push({ type: 'code', lang: fence[2] || null, code: body.join('\n') });
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ type: 'hr' });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: (heading[1] as string).length,
        inline: parseInline(heading[2] as string),
      });
      continue;
    }

    if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1] as string)) {
      flushParagraph();
      const head = splitRow(line).map(parseInline);
      const rows: MdInline[][][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i] as string)) {
        rows.push(splitRow(lines[i] as string).map(parseInline));
        i++;
      }
      i--;
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flushParagraph();
      const body = [quote[1] as string];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1] as string)) {
        body.push((QUOTE.exec(lines[i + 1] as string)?.[1] ?? '') as string);
        i++;
      }
      blocks.push({ type: 'quote', inline: parseInline(body.join('\n')) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: { inline: MdInline[]; depth: number }[] = [];
      while (i < lines.length) {
        const current = lines[i] as string;
        const m = isOrdered ? ORDERED.exec(current) : BULLET.exec(current);
        if (!m) break;
        items.push({
          inline: parseInline(m[2] as string),
          depth: Math.min(3, Math.floor((m[1] as string).replace(/\t/g, '  ').length / 2)),
        });
        i++;
      }
      i--;
      blocks.push({ type: 'list', ordered: isOrdered, items });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

/** Flattens markdown to plain text — used for copy and for search matching. */
export function markdownToText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[\w+#.-]*\n?/g, ''))
    .replace(/[*_~`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}
