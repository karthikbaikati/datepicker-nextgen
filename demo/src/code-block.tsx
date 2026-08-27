/**
 * A tiny, dependency-free syntax highlighter for the TSX snippets on this page.
 *
 * Shipping Prism or Shiki to highlight a dozen static snippets would be more
 * bytes than the library the page is advertising, so this is a hand-rolled
 * scanner. It is not a parser: it walks the source once, tracking only whether
 * it is inside a JSX tag, which is the single piece of context needed to tell
 * an attribute name from a plain identifier. Everything it cannot classify
 * falls through as plain text, so the worst failure mode is under-colouring.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*                                  Tokenizer                                 */
/* -------------------------------------------------------------------------- */

type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'tag'
  | 'attr'
  | 'keyword'
  | 'literal'
  | 'number'
  | 'fn'
  | 'type'
  | 'punct';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
}

const KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'else',
  'export',
  'extends',
  'for',
  'from',
  'function',
  'if',
  'import',
  'in',
  'interface',
  'let',
  'new',
  'of',
  'return',
  'satisfies',
  'switch',
  'type',
  'typeof',
  'var',
  'while',
  'yield',
]);

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'this', 'NaN']);

const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)/y;
const WHITESPACE = /\s+/y;
const PUNCTUATION = /[{}()[\].,;:=+\-*/%!?&|^~<>@#]+/y;

/** Try a sticky pattern at `index`; returns the match text or `null`. */
function matchAt(pattern: RegExp, source: string, index: number): string | null {
  pattern.lastIndex = index;
  const found = pattern.exec(source);
  return found ? found[0] : null;
}

/** Consume a quoted or template string starting at `index`, honouring escapes. */
function readString(source: string, index: number): string | null {
  const quote = source[index];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;
  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote) return source.slice(index, cursor + 1);
    // An unterminated single-quoted string never spans a line in real code;
    // bailing keeps a stray apostrophe from swallowing the rest of the snippet.
    if (char === '\n' && quote !== '`') return null;
    cursor += 1;
  }
  return null;
}

/**
 * Split TSX source into coloured runs.
 *
 * `inTag` is the whole state machine: between `<Name` and the matching `>` an
 * identifier is an attribute, and outside of it an identifier is a value.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let inTag = false;
  // Depth of `{…}` expression containers inside the current tag. An identifier
  // is an attribute name only at depth 0; inside a prop expression it is code.
  let exprDepth = 0;

  const push = (kind: TokenKind, text: string): void => {
    const previous = tokens[tokens.length - 1];
    if (previous && previous.kind === kind)
      tokens[tokens.length - 1] = { kind, text: previous.text + text };
    else tokens.push({ kind, text });
  };

  while (index < source.length) {
    const rest = source.slice(index, index + 2);

    /* comments — including the `{/* … *\/}` form used inside JSX children */
    if (source.startsWith('{/*', index)) {
      const end = source.indexOf('*/}', index + 3);
      const text = end === -1 ? source.slice(index) : source.slice(index, end + 3);
      push('comment', text);
      index += text.length;
      continue;
    }
    if (rest === '//') {
      const newline = source.indexOf('\n', index);
      const text = newline === -1 ? source.slice(index) : source.slice(index, newline);
      push('comment', text);
      index += text.length;
      continue;
    }
    if (rest === '/*') {
      const end = source.indexOf('*/', index + 2);
      const text = end === -1 ? source.slice(index) : source.slice(index, end + 2);
      push('comment', text);
      index += text.length;
      continue;
    }

    /* strings */
    const literalString = readString(source, index);
    if (literalString !== null) {
      push('string', literalString);
      index += literalString.length;
      continue;
    }

    /* JSX tag open / close */
    const tagOpen = matchAt(/<\/?[A-Za-z][\w.]*/y, source, index);
    if (tagOpen !== null) {
      push('tag', tagOpen);
      index += tagOpen.length;
      inTag = true;
      exprDepth = 0;
      continue;
    }
    if (inTag && exprDepth === 0 && (rest === '/>' || source[index] === '>')) {
      const text = rest === '/>' ? '/>' : '>';
      push('tag', text);
      index += text.length;
      inTag = false;
      continue;
    }

    /* whitespace passes through untouched so indentation survives */
    const spaces = matchAt(WHITESPACE, source, index);
    if (spaces !== null) {
      push('plain', spaces);
      index += spaces.length;
      continue;
    }

    /* numbers */
    const digits = matchAt(NUMBER, source, index);
    if (digits !== null) {
      push('number', digits);
      index += digits.length;
      continue;
    }

    /* identifiers */
    const word = matchAt(IDENTIFIER, source, index);
    if (word !== null) {
      const next =
        source
          .slice(index + word.length)
          .match(/^\s*./)?.[0]
          .trimStart() ?? '';
      if (inTag && exprDepth === 0) push('attr', word);
      else if (KEYWORDS.has(word)) push('keyword', word);
      else if (LITERALS.has(word)) push('literal', word);
      else if (next === '(') push('fn', word);
      else if (/^[A-Z]/.test(word)) push('type', word);
      else push('plain', word);
      index += word.length;
      continue;
    }

    /* punctuation */
    const punctuation = matchAt(PUNCTUATION, source, index);
    if (punctuation !== null) {
      if (inTag) {
        for (const char of punctuation) {
          if (char === '{') exprDepth += 1;
          else if (char === '}') exprDepth = Math.max(0, exprDepth - 1);
        }
      }
      push('punct', punctuation);
      index += punctuation.length;
      continue;
    }

    push('plain', source[index] ?? '');
    index += 1;
  }

  return tokens;
}

/* -------------------------------------------------------------------------- */
/*                                 Copy button                                */
/* -------------------------------------------------------------------------- */

export interface CopyButtonProps {
  /** The exact text placed on the clipboard. */
  text: string;
  /** Accessible name; the visible label stays the short "Copy". */
  label?: string;
  className?: string;
}

/**
 * Copy-to-clipboard with a two-second confirmation.
 *
 * `navigator.clipboard` is unavailable on insecure origins, so there is a
 * `document.execCommand` fallback — the page is served over plain HTTP often
 * enough (local preview, LAN testing) that silently doing nothing is worse
 * than a deprecated call.
 */
export function CopyButton({
  text,
  label = 'Copy to clipboard',
  className,
}: CopyButtonProps): ReactNode {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const confirm = useCallback(() => {
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  const copy = useCallback(() => {
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(text).then(confirm, fallback);
      return;
    }
    fallback();

    function fallback(): void {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand('copy');
        confirm();
      } catch {
        /* nothing more we can do — leave the button in its idle state */
      } finally {
        document.body.removeChild(field);
      }
    }
  }, [confirm, text]);

  return (
    <button
      type="button"
      className={className ? `dx-copy ${className}` : 'dx-copy'}
      onClick={copy}
      aria-label={label}
      data-copied={copied ? 'true' : undefined}
    >
      <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
      <span className="dx-copy__text">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Code block                                 */
/* -------------------------------------------------------------------------- */

export interface CodeBlockProps {
  /** The snippet. Leading/trailing blank lines are trimmed. */
  code: string;
  /** Filename or language chip shown in the block's header. */
  filename?: string;
  /** Hide the copy button — used where a copy control already sits nearby. */
  showCopy?: boolean;
  className?: string;
}

/** A highlighted, copyable snippet. Horizontal overflow scrolls inside the block. */
export function CodeBlock({
  code,
  filename,
  showCopy = true,
  className,
}: CodeBlockProps): ReactNode {
  const source = code.replace(/^\n+/, '').replace(/\s+$/, '');
  const tokens = tokenize(source);

  return (
    <figure className={className ? `dx-code ${className}` : 'dx-code'}>
      <div className="dx-code__bar">
        <span className="dx-code__name">{filename ?? 'tsx'}</span>
        {showCopy ? (
          <CopyButton text={source} label={`Copy the ${filename ?? 'code'} snippet`} />
        ) : null}
      </div>
      <pre className="dx-code__pre" tabIndex={0}>
        <code>
          {tokens.map((token, position) => (
            <span key={position} className={`dx-t dx-t--${token.kind}`}>
              {token.text}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
