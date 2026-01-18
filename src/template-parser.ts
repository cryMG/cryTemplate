import type {
  Frame,
  TplCompareOp,
  TplEachNode,
  TplFallbackLink,
  TplFilter,
  TplIfNode,
  TplIfTest,
  TplIfTestCompareRight,
  TplIfTestExpr,
  TplInterpNode,
  TplNode,
} from './types.js';

import {
  escapeHtml,
} from './html-utils.js';

/**
 * Checks whether a string is an identifier or dot-path identifier.
 */
export const tplIsIdentifier = (s: string): boolean => /^[A-Za-z_][\w.]*$/.test(s);

/**
 * Parse an if/elseif test, supporting negation via '!' or leading 'not '.
 */
export const tplParseTest = (s: string): TplIfTest => {
  const src = s.trim();
  type Tok =
    | { t: 'lparen' | 'rparen' }
    | { t: 'and' | 'or' | 'not' | 'bang' }
    | { t: 'comp', v: TplCompareOp }
    | { t: 'lit', v: string | number | boolean | null }
    | { t: 'key', v: string };

  // Tokenize respecting quotes and escapes
  const tokens: Tok[] = [];
  let i = 0;
  function push (tok: Tok): void {
    tokens.push(tok);
  }
  while (i < src.length) {
    const ch = src[i];
    // whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // parentheses
    if (ch === '(') {
      push({ t: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      push({ t: 'rparen' });
      i++;
      continue;
    }
    // two-char logical ops
    const two = src.slice(i, i + 2);
    if (two === '&&') {
      push({ t: 'and' });
      i += 2;
      continue;
    }
    if (two === '||') {
      push({ t: 'or' });
      i += 2;
      continue;
    }
    // comparison ops (prefer 2-char)
    const twoComp = src.slice(i, i + 2);
    if (twoComp === '==' || twoComp === '!=' || twoComp === '>=' || twoComp === '<=') {
      push({ t: 'comp', v: twoComp as TplCompareOp });
      i += 2;
      continue;
    }
    if (ch === '>' || ch === '<') {
      push({ t: 'comp', v: ch as TplCompareOp });
      i++;
      continue;
    }
    // unary not '!' or word 'not'
    if (ch === '!') {
      push({ t: 'bang' });
      i++;
      continue;
    }
    if (/^[Nn]ot\b/.test(src.slice(i))) {
      push({ t: 'not' });
      const mNot = /^not\b/i.exec(src.slice(i));
      i += (mNot ? mNot[0].length : 3);
      continue;
    }
    // quoted string literal
    if (ch === '"' || ch === '\'') {
      const quote = ch;
      i++;
      let inner = '';
      while (i < src.length) {
        const c = src[i];
        if (c === '\\') {
          if (i + 1 < src.length) {
            inner += src[i + 1];
            i += 2;
            continue;
          }
        }
        if (c === quote) {
          i++;
          break;
        }
        inner += c;
        i++;
      }
      push({ t: 'lit', v: inner });
      continue;
    }
    // identifier or keyword literals (true,false,null) or number
    const rem = src.slice(i);
    const mNum = /^(?:[+-]?\d+(?:\.\d+)?)/.exec(rem);
    if (mNum) {
      push({ t: 'lit', v: Number(mNum[0]) });
      i += mNum[0].length;
      continue;
    }
    const mIdent = /^([A-Za-z_][\w.]*)/.exec(rem);
    if (mIdent) {
      const word = mIdent[1];
      if (/^true$/i.test(word)) {
        push({ t: 'lit', v: true });
        i += word.length;
        continue;
      }
      if (/^false$/i.test(word)) {
        push({ t: 'lit', v: false });
        i += word.length;
        continue;
      }
      if (/^null$/i.test(word)) {
        push({ t: 'lit', v: null });
        i += word.length;
        continue;
      }
      push({ t: 'key', v: word });
      i += word.length;
      continue;
    }
    // Unknown char -> skip to avoid infinite loop
    i++;
  }

  // Recursive descent parser with precedence: NOT > AND > OR
  let p = 0;
  function peek (): Tok | undefined {
    return tokens[p];
  }
  function eat (): Tok | undefined {
    const t = tokens[p];
    p++;
    return t;
  }

  function parseOperandTok (): TplIfTestExpr | null {
    const t = peek();
    if (!t) return null;
    if (t.t === 'lit') {
      eat();
      return { kind: 'literal', value: t.v };
    }
    if (t.t === 'key') {
      eat();
      return { kind: 'key', key: t.v };
    }
    return null;
  }

  // Forward-declared top-level expression parser (assigned later)
  // Assign after defining parseOr below
  // eslint-disable-next-line prefer-const
  let parseExpression: () => TplIfTest | null;

  function parsePrimaryBase (): TplIfTest | null {
    const t = peek();
    if (!t) return null;
    if (t.t === 'lparen') {
      eat();
      const e = parseExpression();
      const pk = peek();
      if (pk?.t === 'rparen') eat();
      return e;
    }
    const op = parseOperandTok();
    if (!op) return null;
    if (op.kind === 'literal') return { type: 'truthy-literal', value: op.value, negated: false };
    return { type: 'truthy', key: op.key, negated: false };
  }

  function parseCompare (): TplIfTest | null {
    const leftPrim = parsePrimaryBase();
    if (!leftPrim) return null;
    const nxt = peek();
    if (nxt?.t === 'comp') {
      const opTok = eat() as { t: 'comp', v: TplCompareOp };
      const rightOp = parseOperandTok();
      if (!rightOp) return null;
      const leftExpr: TplIfTestExpr | null = ((): TplIfTestExpr | null => {
        if (leftPrim.type === 'truthy-literal') return { kind: 'literal', value: leftPrim.value };
        if (leftPrim.type === 'truthy') return { kind: 'key', key: leftPrim.key };
        return null;
      })();
      if (!leftExpr) return leftPrim;
      return { type: 'compare', left: leftExpr, op: opTok.v, right: rightOp, negated: false };
    }
    return leftPrim;
  }

  function parseUnary (): TplIfTest | null {
    let negateCount = 0;
    while (true) {
      const t = peek();
      if (t && (t.t === 'bang' || t.t === 'not')) {
        eat();
        negateCount++;
        continue;
      }
      break;
    }
    const nodePrim = parseCompare();
    if (!nodePrim) return null;
    let node: TplIfTest = nodePrim;
    while (negateCount-- > 0) {
      node = { type: 'not', node };
    }
    return node;
  }

  function parseAnd (): TplIfTest | null {
    const first = parseUnary();
    if (!first) return null;
    const nodes: TplIfTest[] = [ first ];
    while (peek()?.t === 'and') {
      eat();
      const nx = parseUnary();
      if (!nx) break;
      nodes.push(nx);
    }
    if (nodes.length === 1) return first;
    return { type: 'and', nodes };
  }

  function parseOr (): TplIfTest | null {
    const first = parseAnd();
    if (!first) return null;
    const nodes: TplIfTest[] = [ first ];
    while (peek()?.t === 'or') {
      eat();
      const nx = parseAnd();
      if (!nx) break;
      nodes.push(nx);
    }
    if (nodes.length === 1) return first;
    return { type: 'or', nodes };
  }

  // no standalone parsePrimary necessary; handled by parsePrimaryBase/parseCompare

  // finalize top-level expression parser
  parseExpression = parseOr;
  const ast = parseExpression();
  return ast ?? { type: 'truthy', key: '', negated: true };
};

/** Push a node to the current node list on the stack. */
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
      if (/^if\s+/i.test(raw)) {
        const expr = raw.replace(/^if\s+/i, '');
        const node: TplIfNode = { type: 'if', test: tplParseTest(expr), consequent: [] };
        // Open a new if-frame; append to parent only when {% endif %} is found
        controlStack.push({ kind: 'if', node, parentNodes: nodesStack[nodesStack.length - 1], inAlternate: false });
        nodesStack.push(node.consequent);
      } else if (/^elseif\s+/i.test(raw)) {
        const top = controlStack[controlStack.length - 1];
        if (top?.kind !== 'if' || top.inAlternate) {
          // Misplaced elseif -> keep literal
          tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
        } else {
          // End current branch and start a new elseif branch
          nodesStack.pop();
          const expr = raw.replace(/^elseif\s+/i, '');
          const test = tplParseTest(expr);
          const branchNodes: TplNode[] = [];
          top.node.elseIfs ??= [];
          top.node.elseIfs.push({ test, nodes: branchNodes });
          nodesStack.push(branchNodes);
        }
      } else if (/^else$/i.test(raw)) {
        const top = controlStack[controlStack.length - 1];
        if (top?.kind !== 'if' || top.inAlternate) {
          // Misplaced else -> keep literal
          tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
        } else {
          // Switch to alternate branch
          nodesStack.pop();
          top.node.alternate = [];
          nodesStack.push(top.node.alternate);
          top.inAlternate = true;
        }
      } else if (/^endif$/i.test(raw)) {
        const top = controlStack.pop();
        if (top?.kind !== 'if') {
          // Misplaced endif -> keep literal
          tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
        } else {
          // Close if-frame and append to parent
          nodesStack.pop();
          top.parentNodes.push(top.node);
        }
      } else if (/^each\s+/i.test(raw)) {
        const reEach = /^each\s+(.+?)\s+as\s+([A-Za-z_][\w]*)(?:\s*,\s*([A-Za-z_][\w]*))?$/i;
        const mEach = reEach.exec(raw);
        if (!mEach) {
          // Syntax error -> keep literal
          tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
        } else {
          const node: TplEachNode = { type: 'each', listExpr: mEach[1].trim(), varName: mEach[2], indexVarName: mEach[3], children: [] };
          // Open each-frame; append to parent only when {% endeach %} is found
          controlStack.push({ kind: 'each', node, parentNodes: nodesStack[nodesStack.length - 1] });
          nodesStack.push(node.children);
        }
      } else if (/^endeach$/i.test(raw)) {
        const top = controlStack.pop();
        if (top?.kind !== 'each') {
          // Misplaced endeach -> keep literal
          tplPush(nodesStack, { type: 'text', value: tpl.slice(start, end + 2) });
        } else {
          // Close each-frame and append to parent
          nodesStack.pop();
          top.parentNodes.push(top.node);
        }
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
 * Resolve a dot-path from a given object (ignores prototype chain).
 *
 * Security: we only read own properties to avoid prototype chain traversal.
 */
const tplResolveFrom = (obj: unknown, path: string[]): unknown => {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
};

/**
 * Resolve a key (identifier or dot-path) across a stack of scopes.
 * Later scopes shadow earlier ones. If not found in any scope, falls back to
 * resolving from the root scope.
 */
const tplResolveKey = (scopes: Record<string, unknown>[], key: string): unknown => {
  const parts = key.split('.');
  for (let i = scopes.length - 1; i >= 0; i--) {
    const frame = scopes[i];
    if (parts[0] in frame) {
      return tplResolveFrom(frame[parts[0]], parts.slice(1));
    }
  }
  return tplResolveFrom(scopes[0], parts);
};

/**
 * Truthiness for control flow:
 * - Arrays: true if non-empty
 * - Objects: true if has at least one own key
 * - Other values: Boolean coercion
 */
const tplTruthy = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
};

/**
 * Consider whether a value is "empty" for interpolation fallback purposes.
 * Empty-ish means: undefined, null, empty string (''), empty array ([]), or empty object ({}).
 * Note: boolean false and number 0 are NOT empty here, so `{{ val || 'x' }}` won't replace them.
 */
const tplEmptyish = (v: unknown): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') return Object.keys(v).length === 0;
  return false;
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
      // Evaluate condition including logical AND/OR/NOT, comparisons and truthy tests
      const evalTest = (t: TplIfTest): boolean => {
        if (t.type === 'truthy') {
          const v = tplResolveKey(scopes, t.key);
          const res = tplTruthy(v);
          return t.negated ? !res : res;
        }
        if (t.type === 'truthy-literal') {
          const res = tplTruthy(t.value as unknown);
          return t.negated ? !res : res;
        }
        if (t.type === 'not') {
          return !evalTest(t.node);
        }
        if (t.type === 'and') {
          for (const c of t.nodes) {
            if (!evalTest(c)) return false;
          }
          return true;
        }
        if (t.type === 'or') {
          for (const c of t.nodes) {
            if (evalTest(c)) return true;
          }
          return false;
        }
        // compare
        const leftVal = (t.left.kind === 'literal') ? t.left.value : tplResolveKey(scopes, t.left.key);
        const rightVal = (t.right.kind === 'literal') ? t.right.value : tplResolveKey(scopes, t.right.key);

        const compare = ((): boolean => {
          const op = t.op;
          if (op === '==' || op === '!=') {
            // equality with simple coercion patterns for typical types
            let res: boolean;
            if (typeof rightVal === 'number') {
              const ln = (typeof leftVal === 'number') ? leftVal : Number(leftVal);
              res = Number.isNaN(ln) ? false : (ln === rightVal);
            } else if (typeof rightVal === 'boolean') {
              const lb = Boolean(leftVal);
              res = lb === rightVal;
            } else if (rightVal === null) {
              res = (leftVal === null || leftVal === undefined);
            } else {
              const ls = (leftVal === null || leftVal === undefined) ? '' : String(leftVal as unknown);
              res = ls === String(rightVal as unknown);
            }
            return op === '==' ? res : !res;
          }
          // relational: prefer numeric comparison; fallback to string
          const ln = (typeof leftVal === 'number') ? leftVal : Number(leftVal);
          const rn = (typeof rightVal === 'number') ? rightVal : Number(rightVal);
          if (!Number.isNaN(ln) && !Number.isNaN(rn)) {
            if (t.op === '>') return ln > rn;
            if (t.op === '<') return ln < rn;
            if (t.op === '>=') return ln >= rn;
            if (t.op === '<=') return ln <= rn;
          }
          const ls = (leftVal === null || leftVal === undefined) ? '' : String(leftVal as unknown);
          const rs = (rightVal === null || rightVal === undefined) ? '' : String(rightVal as unknown);
          if (t.op === '>') return ls > rs;
          if (t.op === '<') return ls < rs;
          if (t.op === '>=') return ls >= rs;
          if (t.op === '<=') return ls <= rs;
          return false;
        })();
        return t.negated ? !compare : compare;
      };

      const ok = evalTest(n.test);
      if (ok) {
        out += tplRenderNodes(n.consequent, scopes);
      } else if (n.elseIfs && n.elseIfs.length > 0) {
        // Evaluate else-if branches in order and render first match
        let matched = false;
        for (const br of n.elseIfs) {
          const okb = evalTest(br.test);
          if (okb) {
            out += tplRenderNodes(br.nodes, scopes);
            matched = true;
            break;
          }
        }
        if (!matched && n.alternate) {
          out += tplRenderNodes(n.alternate, scopes);
        }
      } else if (n.alternate) {
        out += tplRenderNodes(n.alternate, scopes);
      }
    } else if (n.type === 'each') {
      const v = tplResolveKey(scopes, n.listExpr);
      if (Array.isArray(v)) {
        let i = 0;
        for (const item of v) {
          // Create a new scope that introduces the loop variable
          const base: Record<string, unknown> = scopes[scopes.length - 1];
          const newScope: Record<string, unknown> = { ...base, [n.varName]: item as unknown };
          if (n.indexVarName) newScope[n.indexVarName] = i;
          out += tplRenderNodes(n.children, [ ...scopes, newScope ]);
          i++;
        }
      } else if (v && typeof v === 'object') {
        // Iterate over object keys; expose entry.key and entry.value
        const rec = v as Record<string, unknown>;
        for (const k of Object.keys(rec)) {
          const entry = { key: k, value: rec[k] };
          const base: Record<string, unknown> = scopes[scopes.length - 1];
          const newScope: Record<string, unknown> = { ...base, [n.varName]: entry };
          out += tplRenderNodes(n.children, [ ...scopes, newScope ]);
        }
      }
    }
  }
  return out;
};
