import type {
  Frame,
  TplFallbackLink,
  TplFilter,
  TplIfTestCompareRight,
  TplInterpNode,
  TplNode,
  TplTextNode,
} from './types.js';

import {
  escapeHtml,
} from './html-utils.js';

import {
  tplParseElse,
  tplParseElseIf,
  tplParseEndIf,
  tplParseIfOpen,
  tplRenderIfNode,
} from './template-if.js';

import {
  tplParseEach,
  tplParseEndEach,
  tplRenderEachNode,
} from './template-each.js';

import {
  tplEmptyish,
  tplResolveKey,
} from './template-runtime.js';

import {
  applyTemplateFilters,
} from './template-filters.js';

/**
 * Checks whether a string is an identifier or dot-path identifier.
 *
 * @param s - Input string.
 * @returns True if the string matches the identifier/dot-path grammar.
 */
export const tplIsIdentifier = (s: string): boolean => /^[A-Za-z_][\w.]*$/.test(s);

/**
 * Push a node to the current node list on the stack.
 *
 * @param stack - Stack of node lists.
 * @param n - Node to append.
 */
const tplPush = (stack: TplNode[][], n: TplNode): void => {
  stack[stack.length - 1].push(n);
};

/**
 * Parse a template string to an AST.
 *
 * Recognized syntax:
 * - Interpolations: {{ key }} (escaped), {{= key }} (raw)
 * - Controls: {% if test %}, {% elseif test %}, {% else %}, {% endif %}
 *             {% each listExpr as var %}, {% endeach %}
 *
 * Misplaced/invalid control tokens are preserved verbatim as text so templates
 * degrade gracefully rather than throwing.
 *
 * @param tpl - Template source string.
 * @returns AST node list representing the parsed template.
 */
export const tplParse = (tpl: string): TplNode[] => {
  const root: TplNode[] = [];
  const nodesStack: TplNode[][] = [ root ];
  const controlStack: Frame[] = [];

  type TplWsTrimMode = 'all' | 'no-newlines' | null;

  const toTrimMode = (ch: string | undefined): TplWsTrimMode => {
    if (ch === '-') return 'all';
    if (ch === '~') return 'no-newlines';
    return null;
  };

  const trimEndByMode = (s: string, mode: TplWsTrimMode): string => {
    if (!mode) return s;
    if (mode === 'all') return s.replace(/\s+$/g, '');
    // whitespace except newlines (keep \r and \n)
    return s.replace(/[^\S\r\n]+$/g, '');
  };

  const skipWsForwardByMode = (idx0: number, mode: TplWsTrimMode): number => {
    if (!mode) return idx0;
    let i = idx0;
    for (; i < tpl.length; i++) {
      const ch = tpl[i];
      if (mode === 'no-newlines' && (ch === '\r' || ch === '\n')) break;
      if (/\s/.test(ch)) continue;
      break;
    }
    return i;
  };

  const skipOneNewlineAfterControlToken = (idx0: number): number => {
    if (idx0 >= tpl.length) return idx0;
    if (tpl[idx0] === '\r') {
      if (idx0 + 1 < tpl.length && tpl[idx0 + 1] === '\n') return idx0 + 2;
      return idx0 + 1;
    }
    if (tpl[idx0] === '\n') return idx0 + 1;
    return idx0;
  };

  const reToken = /\{\{|\{%|\{#/g;
  let idx = 0;
  while (idx < tpl.length) {
    reToken.lastIndex = idx;
    const m = reToken.exec(tpl);
    if (!m) {
      if (idx < tpl.length) tplPush(nodesStack, { type: 'text', value: tpl.slice(idx) });
      break;
    }
    const start = m.index;
    // Detect optional whitespace-trim marker right after the opener: - or ~
    const openTrimMode: TplWsTrimMode = toTrimMode(tpl[start + 2]);
    const openLen = 2 + (openTrimMode ? 1 : 0);

    // Always push the pre-token text as-is. Only apply left-trim if the token is actually consumed.
    let preTextNode: TplTextNode | null = null;
    if (start > idx) {
      const tn = { type: 'text' as const, value: tpl.slice(idx, start) };
      tplPush(nodesStack, tn);
      preTextNode = tn;
    }

    const applyLeftTrimIfNeeded = (tokenConsumed: boolean): void => {
      if (!tokenConsumed) return;
      if (!openTrimMode) return;
      if (!preTextNode) return;
      preTextNode.value = trimEndByMode(preTextNode.value, openTrimMode);
    };
    if (m[0] === '{{') {
      // Interpolation token
      const end = tpl.indexOf('}}', start + openLen);
      if (end === -1) {
        // Unterminated interpolation: keep the rest as text
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start) });
        break;
      }
      const closeTrimMode: TplWsTrimMode = toTrimMode(tpl[end - 1]);
      const innerEnd = closeTrimMode ? (end - 1) : end;
      const inner = tpl.slice(start + openLen, innerEnd).trim();
      // Support: {{ key }} (escaped) | {{= key }} (raw)
      // Fallbacks: {{ key || 'fallback' }} or chains with || and ??
      // Filters: {{ expr | upper | number(2) | json }}
      const reMode = /^([=]?)([\s\S]*)$/;
      const mm = reMode.exec(inner);
      let parsedAsInterpNode = false;
      let interpNode: TplInterpNode | null = null;
      let literalText: string | null = null;
      if (mm) {
        const mode: 'escape' | 'raw' = (mm[1] === '=') ? 'raw' : 'escape';
        let expr = mm[2].trim();

        // Split off filters segment at first single '|' (not '||'), outside of quotes
        let filtersSeg: string | null = null;
        {
          let inQ: '"' | "'" | null = null;
          for (let i2 = 0; i2 < expr.length; i2++) {
            const ch = expr[i2];
            if (inQ) {
              if (ch === '\\') {
                if (i2 + 1 < expr.length) {
                  i2++;
                }
              } else if (ch === inQ) {
                inQ = null;
              }
              continue;
            }
            if (ch === '"' || ch === '\'') {
              inQ = (ch === '"') ? '"' : '\'';
              continue;
            }
            if (ch === '|') {
              if (i2 + 1 < expr.length && expr[i2 + 1] === '|') {
                i2++;
                continue;
              }
              // single '|' → filters start here
              filtersSeg = expr.slice(i2);
              expr = expr.slice(0, i2).trim();
              break;
            }
          }
        }

        // Tokenize expression by top-level operators || and ??, respecting quotes
        const parts: string[] = [];
        const ops: ('or' | 'nullish')[] = [];
        let buf = '';
        let inQ: '"' | "'" | null = null;
        for (let i2 = 0; i2 < expr.length; i2++) {
          const ch = expr[i2];
          if (inQ) {
            buf += ch;
            if (ch === '\\') {
              // include next char as escaped if present
              if (i2 + 1 < expr.length) {
                i2++;
                buf += expr[i2];
              }
            } else if (ch === inQ) {
              inQ = null;
            }
            continue;
          }
          if (ch === '"' || ch === '\'') {
            inQ = ch === '"' ? '"' : '\'';
            buf += ch;
            continue;
          }
          // detect || or ?? when not in quotes
          if ((ch === '|' || ch === '?') && i2 + 1 < expr.length && expr[i2 + 1] === ch) {
            const part = buf.trim();
            if (part.length > 0) parts.push(part);
            buf = '';
            ops.push(ch === '|' ? 'or' : 'nullish');
            i2++; // skip second char
            continue;
          }
          buf += ch;
        }
        const last = buf.trim();
        if (last.length > 0) parts.push(last);

        if (parts.length >= 1 && tplIsIdentifier(parts[0])) {
          const leftKey = parts[0];
          const chain: TplFallbackLink[] = [];
          /**
           * Parse the right-hand side of a fallback chain element (literal or key).
           *
           * @param s - RHS token text.
           * @returns Parsed RHS expression or null if unsupported.
           */
          const parseRight = (s: string): TplIfTestCompareRight | null => {
            const reQuoted = /^(['"])([\s\S]*)\1$/;
            const mq = reQuoted.exec(s);
            if (mq) {
              const quote = mq[1];
              let innerQ = mq[2];
              innerQ = innerQ.replace(/\\\\/g, '\\');
              const esc = new RegExp('\\\\' + quote, 'g');
              innerQ = innerQ.replace(esc, quote);
              return { kind: 'literal', value: innerQ };
            }
            if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) return { kind: 'literal', value: Number(s) };
            if (/^true$/i.test(s)) return { kind: 'literal', value: true };
            if (/^false$/i.test(s)) return { kind: 'literal', value: false };
            if (/^null$/i.test(s)) return { kind: 'literal', value: null };
            if (tplIsIdentifier(s)) return { kind: 'key', key: s };
            return null;
          };
          // Build chain
          for (let i3 = 1; i3 < parts.length; i3++) {
            const r = parseRight(parts[i3]);
            if (!r) {
              chain.length = 0;
              break;
            }
            chain.push({ op: ops[i3 - 1], right: r });
          }
          const node: TplInterpNode = { type: 'interp', key: leftKey, mode };
          if (chain.length > 0) node.fallbackChain = chain;
          // Parse filters if present
          if (filtersSeg) {
            /**
             * Parse a filter argument (quoted string, number, boolean, null).
             *
             * @param s - Argument token text.
             * @returns Parsed argument value, or undefined if unsupported.
             */
            const parseArg = (s: string): string | number | boolean | null | undefined => {
              const reQuoted = /^(['"])([\s\S]*)\1$/;
              const mq = reQuoted.exec(s);
              if (mq) {
                const quote = mq[1];
                let innerQ = mq[2];
                innerQ = innerQ.replace(/\\\\/g, '\\');
                const esc = new RegExp('\\\\' + quote, 'g');
                innerQ = innerQ.replace(esc, quote);
                return innerQ;
              }
              if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) return Number(s);
              if (/^true$/i.test(s)) return true;
              if (/^false$/i.test(s)) return false;
              if (/^null$/i.test(s)) return null;
              return undefined;
            };
            const filters: TplFilter[] = [];
            // Split by '|' and parse name and optional (args)
            const seg = filtersSeg;
            const rawFilters = seg.split('|').map((t) => t.trim()).filter((t) => t.length > 0);
            for (const rf of rawFilters) {
              const mFn = /^(\w+)\s*(?:\((.*)\))?$/.exec(rf);
              if (!mFn) continue;
              const name = mFn[1];
              const f: TplFilter = { name };
              if (mFn[2] && mFn[2].trim().length > 0) {
                // Split args by comma outside quotes
                const argsSrc = mFn[2];
                const args: (string | number | boolean | null)[] = [];
                let a = '';
                let inA: '"' | "'" | null = null;
                for (let i4 = 0; i4 < argsSrc.length; i4++) {
                  const ch = argsSrc[i4];
                  if (inA) {
                    a += ch;
                    if (ch === '\\') {
                      if (i4 + 1 < argsSrc.length) {
                        i4++;
                        a += argsSrc[i4];
                      }
                    } else if (ch === inA) {
                      inA = null;
                    }
                    continue;
                  }
                  if (ch === '"' || ch === '\'') {
                    inA = (ch === '"') ? '"' : '\'';
                    a += ch;
                    continue;
                  }
                  if (ch === ',') {
                    const parsed = parseArg(a.trim());
                    if (parsed !== undefined) args.push(parsed);
                    a = '';
                    continue;
                  }
                  a += ch;
                }
                if (a.trim().length > 0) {
                  const parsed = parseArg(a.trim());
                  if (parsed !== undefined) args.push(parsed);
                }
                f.args = args;
              }
              filters.push(f);
            }
            if (filters.length > 0) node.filters = filters;
          }
          parsedAsInterpNode = true;
          interpNode = node;
        } else if (tplIsIdentifier(expr)) {
          parsedAsInterpNode = true;
          interpNode = { type: 'interp', key: expr, mode };
        } else {
          // Not a supported interpolation: keep literal token
          literalText = tpl.slice(start, end + 2);
        }
      } else {
        // Not a supported interpolation: keep literal token
        literalText = tpl.slice(start, end + 2);
      }

      applyLeftTrimIfNeeded(parsedAsInterpNode);
      if (parsedAsInterpNode && interpNode) {
        tplPush(nodesStack, interpNode);
      } else {
        tplPush(nodesStack, { type: 'text', value: literalText ?? tpl.slice(start, end + 2) });
      }
      idx = end + 2;
      // Only apply right-trim if the interpolation was actually parsed into a node.
      // If it was preserved as literal text, trimming would be surprising.
      if (closeTrimMode && parsedAsInterpNode) idx = skipWsForwardByMode(idx, closeTrimMode);
    } else if (m[0] === '{#') {
      // Comment token
      const end = tpl.indexOf('#}', start + openLen);
      if (end === -1) {
        // Unterminated comment: keep the rest as text
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start) });
        break;
      }
      const closeTrimMode: TplWsTrimMode = toTrimMode(tpl[end - 1]);
      applyLeftTrimIfNeeded(true);
      // Comment is ignored completely (no output)
      idx = end + 2;
      if (closeTrimMode) idx = skipWsForwardByMode(idx, closeTrimMode);
    } else {
      // Control token
      const end = tpl.indexOf('%}', start + openLen);
      if (end === -1) {
        // Unterminated control: keep the rest as text
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start) });
        break;
      }
      const closeTrimMode: TplWsTrimMode = toTrimMode(tpl[end - 1]);
      const rawEnd = closeTrimMode ? (end - 1) : end;
      const raw = tpl.slice(start + openLen, rawEnd).trim();
      let preservedAsText = false;
      /**
       * Push a literal control token back into output as plain text.
       *
       * @param v - Literal token text.
       */
      const pushTextToken = (v: string): void => {
        preservedAsText = true;
        tplPush(nodesStack, { type: 'text', value: v });
      };
      if (/^if\s+/i.test(raw)) {
        const expr = raw.replace(/^if\s+/i, '');
        tplParseIfOpen(expr, nodesStack, controlStack);
      } else if (/^elseif\s+/i.test(raw)) {
        const expr = raw.replace(/^elseif\s+/i, '');
        tplParseElseIf(expr, tpl.slice(start, end + 2), nodesStack, controlStack, pushTextToken);
      } else if (/^else$/i.test(raw)) {
        tplParseElse(tpl.slice(start, end + 2), nodesStack, controlStack, pushTextToken);
      } else if (/^endif$/i.test(raw)) {
        tplParseEndIf(tpl.slice(start, end + 2), nodesStack, controlStack, pushTextToken);
      } else if (/^each\s+/i.test(raw)) {
        tplParseEach(raw, tpl.slice(start, end + 2), nodesStack, controlStack, pushTextToken);
      } else if (/^endeach$/i.test(raw)) {
        tplParseEndEach(tpl.slice(start, end + 2), nodesStack, controlStack, pushTextToken);
      } else {
        // Unknown control -> keep literal
        preservedAsText = true;
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
      }

      applyLeftTrimIfNeeded(!preservedAsText);
      if (preservedAsText) {
        idx = end + 2;
      } else if (closeTrimMode) {
        // Explicit right-trim disables implicit "skip one newline" behavior.
        idx = skipWsForwardByMode(end + 2, closeTrimMode);
      } else {
        idx = skipOneNewlineAfterControlToken(end + 2);
      }
    }
  }

  return root;
};

/**
 * Render a list of nodes with the provided scope stack.
 *
 * Evaluation order for interpolations:
 * 1) Resolve primary key
 * 2) Apply fallback chain (|| and ??) left-to-right
 * 3) Apply filter pipeline in order
 * 4) Stringify the value
 * 5) Escape HTML unless mode === 'raw'
 *
 * Control structures:
 * - If / ElseIf / Else use tplTruthy() and comparison semantics from tplParseTest()
 * - Each over arrays creates a nested scope with the loop var (and optional index)
 * - Each over objects iterates own keys and exposes `{ key, value }` as the loop var
 *
 * @param nodes - AST node list to render.
 * @param scopes - Scope stack used for key resolution.
 * @returns Rendered string output.
 */
export const tplRenderNodes = (nodes: TplNode[], scopes: Record<string, unknown>[]): string => {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') {
      out += n.value;
    } else if (n.type === 'interp') {
      let val = tplResolveKey(scopes, n.key);
      // Apply fallback chain left-to-right
      if (n.fallbackChain && n.fallbackChain.length > 0) {
        for (const fb of n.fallbackChain) {
          const isEmpty = tplEmptyish(val);
          const isNullish = (val === null || val === undefined);
          if ((fb.op === 'or' && isEmpty) || (fb.op === 'nullish' && isNullish)) {
            val = (fb.right.kind === 'literal') ? fb.right.value : tplResolveKey(scopes, fb.right.key);
          }
        }
      }
      // Apply filters sequentially before final string conversion and escaping
      if (n.filters && n.filters.length > 0) {
        val = applyTemplateFilters(val, n.filters);
      }
      let str: string;
      if (typeof val === 'string') str = val;
      else if (val === undefined || val === null) str = '';
      else str = String(val as unknown);
      out += (n.mode === 'raw') ? str : escapeHtml(str);
    } else if (n.type === 'if') {
      out += tplRenderIfNode(n, scopes, tplRenderNodes);
    } else if (n.type === 'each') {
      out += tplRenderEachNode(n, scopes, tplRenderNodes);
    }
  }
  return out;
};
