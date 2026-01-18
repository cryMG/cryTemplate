import type {
  Frame,
  TplFallbackLink,
  TplFilter,
  TplIfTestCompareRight,
  TplInterpNode,
  TplNode,
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
 * - Interpolations: {{ key }}, {{= key }} (escaped), {{- key }} (raw)
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

  const reToken = /\{\{|\{%/g;
  let idx = 0;
  while (idx < tpl.length) {
    reToken.lastIndex = idx;
    const m = reToken.exec(tpl);
    if (!m) {
      if (idx < tpl.length) tplPush(nodesStack, { type: 'text', value: tpl.slice(idx) });
      break;
    }
    const start = m.index;
    if (start > idx) tplPush(nodesStack, { type: 'text', value: tpl.slice(idx, start) });
    if (m[0] === '{{') {
      // Interpolation token
      const end = tpl.indexOf('}}', start + 2);
      if (end === -1) {
        // Unterminated interpolation: keep the rest as text
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start) });
        break;
      }
      const inner = tpl.slice(start + 2, end).trim();
      // Support: {{ key }} | {{= key }} | {{- key }}
      // Fallbacks: {{ key || 'fallback' }} or chains with || and ??
      // Filters: {{ expr | upper | number(2) | json }}
      const reMode = /^([-=]?)([\s\S]*)$/;
      const mm = reMode.exec(inner);
      if (mm) {
        const mode: 'escape' | 'raw' = (mm[1] === '-') ? 'raw' : 'escape';
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
              const name = mFn[1] as TplFilter['name'];
              if (![ 'upper', 'lower', 'trim', 'number', 'json', 'urlencode', 'attr', 'replace' ].includes(name)) continue;
              const f: TplFilter = { name } as TplFilter;
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
          tplPush(nodesStack, node);
        } else if (tplIsIdentifier(expr)) {
          tplPush(nodesStack, { type: 'interp', key: expr, mode });
        } else {
          // Not a supported interpolation: keep literal token
          tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
        }
      } else {
        // Not a supported interpolation: keep literal token
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
      }
      idx = end + 2;
    } else {
      // Control token
      const end = tpl.indexOf('%}', start + 2);
      if (end === -1) {
        // Unterminated control: keep the rest as text
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start) });
        break;
      }
      const raw = tpl.slice(start + 2, end).trim();
      /**
       * Push a literal control token back into output as plain text.
       *
       * @param v - Literal token text.
       */
      const pushTextToken = (v: string): void => {
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
      } else if (raw.startsWith('#')) {
        // Inline comment: ignore completely (no output)
        // Do nothing (skip adding any node)
      } else {
        // Unknown control -> keep literal
        tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
      }
      idx = end + 2;
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
        for (const f of n.filters) {
          const name = f.name;
          if (name === 'upper') {
            val = (val === undefined || val === null) ? '' : String(val as unknown).toUpperCase();
          } else if (name === 'lower') {
            val = (val === undefined || val === null) ? '' : String(val as unknown).toLowerCase();
          } else if (name === 'trim') {
            val = (val === undefined || val === null) ? '' : String(val as unknown).trim();
          } else if (name === 'replace') {
            const a0 = Array.isArray(f.args) ? f.args[0] : undefined;
            const a1 = Array.isArray(f.args) ? f.args[1] : undefined;
            const oldStr = (typeof a0 === 'string') ? a0 : undefined;
            const newStr = (typeof a1 === 'string') ? a1 : '';
            const base = (val === undefined || val === null) ? '' : String(val as unknown);
            if (oldStr && oldStr.length > 0) {
              // global, literal replacement (no regex), including multiple occurrences
              val = base.split(oldStr).join(newStr);
            } else {
              val = base;
            }
          } else if (name === 'number') {
            const firstArg = (Array.isArray(f.args) && f.args.length > 0) ? f.args[0] : undefined;
            const secondArg = (Array.isArray(f.args) && f.args.length > 1) ? f.args[1] : undefined;
            const thirdArg = (Array.isArray(f.args) && f.args.length > 2) ? f.args[2] : undefined;
            const d = (typeof firstArg === 'number') ? firstArg : undefined;
            // Semantics:
            // - 1 arg: number(decimals)
            // - 2 args: number(decimals, decimalSep)
            // - 3 args: number(decimals, decimalSep, thousandsSep)
            const decimalSep = (typeof secondArg === 'string') ? secondArg : undefined;
            const thousandsSep = (typeof thirdArg === 'string') ? thirdArg : undefined;
            const num = (typeof val === 'number') ? val : Number(val);
            if (Number.isFinite(num)) {
              const decimals = (typeof d === 'number') ? Math.max(0, Math.floor(d)) : undefined;
              let s = (typeof decimals === 'number') ? num.toFixed(decimals) : String(num);
              const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
              if (m) {
                const sign = m[1] ?? '';
                const intPart = m[2];
                const frac = m[3] ?? '';
                const grouped = (thousandsSep && thousandsSep.length > 0)
                  ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep)
                  : intPart;
                const decChar = (decimalSep ?? '.');
                s = sign + grouped + (frac.length > 0 ? decChar + frac : '');
              }
              val = s;
            } else {
              val = (val === undefined || val === null) ? '' : String(val as unknown);
            }
          } else if (name === 'json') {
            const s = JSON.stringify(val);
            val = s ?? '';
          } else if (name === 'urlencode') {
            val = encodeURIComponent((val === undefined || val === null) ? '' : String(val as unknown));
          } else if (name === 'attr') {
            // attribute-safe: rely on default HTML escaping later; keep as-is here
            val = (val === undefined || val === null) ? '' : String(val as unknown);
          }
        }
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
