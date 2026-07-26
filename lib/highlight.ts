/**
 * A deliberately small syntax highlighter. Client-safe, zero dependencies.
 *
 * Karkhana renders code in three places — chat code fences, tool-call payloads,
 * and diffs — and all three previously showed flat grey text. Pulling in Shiki
 * or Prism for that would add megabytes and a build step to a local dashboard,
 * so this does the 90% version: one pass of alternated regexes per language
 * family, emitting `tok-*` spans that globals.css colours per theme.
 *
 * Rules must use non-capturing groups only — group N of the combined regex is
 * assumed to be rule N.
 */

export type Token = { text: string; cls: string };

type Rule = { cls: string; source: string };

const C_LIKE_KEYWORDS =
  'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|await|async|yield|import|export|from|as|default|try|catch|finally|throw|delete|void|null|undefined|true|false|interface|type|enum|implements|public|private|protected|readonly|static|abstract|satisfies|keyof|infer|declare';

const PY_KEYWORDS =
  'def|class|return|if|elif|else|for|while|break|continue|import|from|as|with|try|except|finally|raise|lambda|yield|global|nonlocal|pass|assert|del|and|or|not|is|in|None|True|False|async|await|self';

const SH_KEYWORDS =
  'if|then|elif|else|fi|for|while|until|do|done|case|esac|function|return|export|local|source|set|unset|echo|cd|exit|trap|shift|read';

const GO_KEYWORDS =
  'package|import|func|return|if|else|for|range|switch|case|default|type|struct|interface|map|chan|go|defer|select|var|const|nil|true|false|break|continue|fallthrough';

const RUST_KEYWORDS =
  'fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|match|if|else|for|while|loop|return|self|Self|where|async|await|move|ref|dyn|as|crate|super|true|false|Some|None|Ok|Err';

const SQL_KEYWORDS =
  'SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|OFFSET|HAVING|UNION|ALL|AS|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|DISTINCT|COUNT|SUM|AVG|CASE|WHEN|THEN|END';

const STRINGS = String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\`(?:\\.|[^\\\`])*\``;
const NUMBER = String.raw`\b(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b`;

function ruleset(keywords: string, opts: { hash?: boolean; slash?: boolean } = {}): Rule[] {
  const rules: Rule[] = [];
  if (opts.slash !== false) rules.push({ cls: 'tok-com', source: String.raw`//[^\n]*|/\*[\s\S]*?\*/` });
  if (opts.hash) rules.push({ cls: 'tok-com', source: String.raw`#[^\n]*` });
  rules.push(
    { cls: 'tok-str', source: STRINGS },
    { cls: 'tok-num', source: NUMBER },
    { cls: 'tok-key', source: String.raw`\b(?:${keywords})\b` },
    { cls: 'tok-typ', source: String.raw`\b[A-Z][A-Za-z0-9_]*\b` },
    { cls: 'tok-fn', source: String.raw`\b[A-Za-z_$][\w$]*(?=\s*\()` },
    { cls: 'tok-op', source: String.raw`[{}()\[\].,;:+\-*/%<>=!&|^~?@]+` },
  );
  return rules;
}

const SHELL_RULES: Rule[] = [
  { cls: 'tok-com', source: String.raw`#[^\n]*` },
  { cls: 'tok-str', source: STRINGS },
  { cls: 'tok-var', source: String.raw`\$\{[^}]*\}|\$[A-Za-z_][\w]*` },
  { cls: 'tok-typ', source: String.raw`(?:^|\s)--?[A-Za-z][\w-]*` },
  { cls: 'tok-key', source: String.raw`\b(?:${SH_KEYWORDS})\b` },
  { cls: 'tok-fn', source: String.raw`(?:^|[|&;]\s*)\s*[A-Za-z_][\w.\-]*` },
  { cls: 'tok-num', source: NUMBER },
  { cls: 'tok-op', source: String.raw`[|&;<>()$]+` },
];

const JSON_RULES: Rule[] = [
  { cls: 'tok-fn', source: String.raw`"(?:\\.|[^"\\])*"(?=\s*:)` },
  { cls: 'tok-str', source: String.raw`"(?:\\.|[^"\\])*"` },
  { cls: 'tok-num', source: NUMBER },
  { cls: 'tok-key', source: String.raw`\b(?:true|false|null)\b` },
  { cls: 'tok-op', source: String.raw`[{}\[\],:]+` },
];

const CSS_RULES: Rule[] = [
  { cls: 'tok-com', source: String.raw`/\*[\s\S]*?\*/` },
  { cls: 'tok-str', source: STRINGS },
  { cls: 'tok-key', source: String.raw`--[\w-]+|@[\w-]+` },
  { cls: 'tok-fn', source: String.raw`[.#][\w-]+|&:[\w-]+` },
  { cls: 'tok-typ', source: String.raw`\b[a-z-]+(?=\s*:)` },
  { cls: 'tok-num', source: String.raw`#[0-9a-fA-F]{3,8}\b|${NUMBER}(?:px|rem|em|%|s|ms|vh|vw|fr)?` },
  { cls: 'tok-op', source: String.raw`[{}();:,]+` },
];

const MARKUP_RULES: Rule[] = [
  { cls: 'tok-com', source: String.raw`<!--[\s\S]*?-->` },
  { cls: 'tok-str', source: STRINGS },
  { cls: 'tok-key', source: String.raw`</?[A-Za-z][\w:.-]*` },
  { cls: 'tok-typ', source: String.raw`\b[\w-]+(?==)` },
  { cls: 'tok-op', source: String.raw`[<>/=]+` },
];

const BY_LANGUAGE: Record<string, Rule[]> = {
  ts: ruleset(C_LIKE_KEYWORDS),
  js: ruleset(C_LIKE_KEYWORDS),
  json: JSON_RULES,
  py: ruleset(PY_KEYWORDS, { hash: true, slash: false }),
  sh: SHELL_RULES,
  go: ruleset(GO_KEYWORDS),
  rust: ruleset(RUST_KEYWORDS),
  java: ruleset(C_LIKE_KEYWORDS),
  css: CSS_RULES,
  html: MARKUP_RULES,
  sql: ruleset(SQL_KEYWORDS, { slash: false, hash: true }),
  yaml: [
    { cls: 'tok-com', source: String.raw`#[^\n]*` },
    { cls: 'tok-fn', source: String.raw`^\s*[\w.-]+(?=\s*:)` },
    { cls: 'tok-str', source: STRINGS },
    { cls: 'tok-num', source: NUMBER },
    { cls: 'tok-key', source: String.raw`\b(?:true|false|null|yes|no)\b` },
  ],
};

/** Maps the many aliases a fence can carry onto a rule set. */
const ALIASES: Record<string, string> = {
  typescript: 'ts',
  tsx: 'ts',
  mts: 'ts',
  cts: 'ts',
  javascript: 'js',
  jsx: 'js',
  mjs: 'js',
  cjs: 'js',
  node: 'js',
  json5: 'json',
  jsonc: 'json',
  python: 'py',
  py3: 'py',
  bash: 'sh',
  zsh: 'sh',
  shell: 'sh',
  console: 'sh',
  terminal: 'sh',
  golang: 'go',
  rs: 'rust',
  scss: 'css',
  less: 'css',
  xml: 'html',
  svg: 'html',
  vue: 'html',
  yml: 'yaml',
  postgres: 'sql',
  psql: 'sql',
};

export function normalizeLanguage(lang: string | undefined): string | null {
  if (!lang) return null;
  const key = lang.toLowerCase().replace(/^\./, '').trim();
  const resolved = ALIASES[key] ?? key;
  return BY_LANGUAGE[resolved] ? resolved : null;
}

/** Guesses a language from a file path, for tool-call payloads. */
export function languageFromPath(filePath: string | undefined): string | null {
  if (!filePath) return null;
  const ext = filePath.split('.').pop();
  return ext ? normalizeLanguage(ext) : null;
}

const cache = new Map<string, RegExp>();

function combined(lang: string, rules: Rule[]): RegExp {
  const cached = cache.get(lang);
  if (cached) return cached;
  const re = new RegExp(rules.map((r) => `(${r.source})`).join('|'), 'gm');
  cache.set(lang, re);
  return re;
}

const MAX_HIGHLIGHT_CHARS = 60_000;

/**
 * Tokenizes `code`. Unknown languages and oversized inputs fall back to one
 * plain token, so callers can render the result unconditionally.
 */
export function highlight(code: string, lang?: string): Token[] {
  const resolved = normalizeLanguage(lang);
  if (!resolved || code.length > MAX_HIGHLIGHT_CHARS) return [{ text: code, cls: '' }];

  const rules = BY_LANGUAGE[resolved] as Rule[];
  const re = combined(resolved, rules);
  const tokens: Token[] = [];
  let lastIndex = 0;
  re.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = re.exec(code)) !== null) {
    // A zero-width match would spin forever; nudge past it.
    if (match[0] === '') {
      re.lastIndex++;
      continue;
    }
    if (match.index > lastIndex) tokens.push({ text: code.slice(lastIndex, match.index), cls: '' });

    let cls = '';
    for (let i = 0; i < rules.length; i++) {
      if (match[i + 1] !== undefined) {
        cls = (rules[i] as Rule).cls;
        break;
      }
    }
    tokens.push({ text: match[0], cls });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < code.length) tokens.push({ text: code.slice(lastIndex), cls: '' });

  return tokens;
}
