import type {
  Frame,
  TplCompareOp,
  TplIfNode,
  TplIfTest,
  TplIfTestExpr,
  TplNode,
} from './types.js';

import {
  tplResolveKey,
  tplTruthy,
} from './template-runtime.js';

/**
 * Parse an if/elseif test, supporting negation via '!' or leading 'not '.
 *
 * @param s - Raw test expression (e.g. `a`, `!a`, `a && b`, `x >= 10`).
 * @returns Parsed test AST.
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

  while (i < src.length) {
    const ch = src[i];
    // whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // parentheses
    if (ch === '(') {
      tokens.push({ t: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ t: 'rparen' });
      i++;
      continue;
    }
    // two-char logical ops
    const two = src.slice(i, i + 2);
    if (two === '&&') {
      tokens.push({ t: 'and' });
      i += 2;
      continue;
    }
    if (two === '||') {
      tokens.push({ t: 'or' });
      i += 2;
      continue;
    }
    // comparison ops (prefer 2-char)
    const twoComp = src.slice(i, i + 2);
    if (twoComp === '==' || twoComp === '!=' || twoComp === '>=' || twoComp === '<=') {
      tokens.push({ t: 'comp', v: twoComp as TplCompareOp });
      i += 2;
      continue;
    }
    if (ch === '>' || ch === '<') {
      tokens.push({ t: 'comp', v: ch as TplCompareOp });
      i++;
      continue;
    }
    // unary not '!' or word 'not'
    if (ch === '!') {
      tokens.push({ t: 'bang' });
      i++;
      continue;
    }
    if (/^[Nn]ot\b/.test(src.slice(i))) {
      tokens.push({ t: 'not' });
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
      tokens.push({ t: 'lit', v: inner });
      continue;
    }
    // identifier or keyword literals (true,false,null) or number
    const rem = src.slice(i);
    const mNum = /^(?:[+-]?\d+(?:\.\d+)?)/.exec(rem);
    if (mNum) {
      tokens.push({ t: 'lit', v: Number(mNum[0]) });
      i += mNum[0].length;
      continue;
    }
    const mIdent = /^([A-Za-z_][\w.]*)/.exec(rem);
    if (mIdent) {
      const word = mIdent[1];
      if (/^true$/i.test(word)) {
        tokens.push({ t: 'lit', v: true });
        i += word.length;
        continue;
      }
      if (/^false$/i.test(word)) {
        tokens.push({ t: 'lit', v: false });
        i += word.length;
        continue;
      }
      if (/^null$/i.test(word)) {
        tokens.push({ t: 'lit', v: null });
        i += word.length;
        continue;
      }
      tokens.push({ t: 'key', v: word });
      i += word.length;
      continue;
    }
    // Unknown char -> skip to avoid infinite loop
    i++;
  }

  // Recursive descent parser with precedence: NOT > AND > OR
  let p = 0;

  /** Peek at the current token without consuming it. */
  function peek (): Tok | undefined {
    return tokens[p];
  }

  /** Consume and return the current token. */
  function eat (): Tok | undefined {
    const t = tokens[p];
    p++;
    return t;
  }

  /**
   * Parse a literal or key token into a comparison/truthy expression.
   *
   * @returns Parsed expression or null if the current token is not an operand.
   */
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

  /** Parse a base truthy test (or parenthesized expression) without comparisons. */
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

  /** Parse an optional comparison (`left <op> right`) on top of a primary expression. */
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

  /** Parse unary negation operators (`!` / `not`) applied to a comparison/truthy node. */
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

  /** Parse a sequence of unary nodes joined by AND. */
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

  /** Parse a sequence of AND nodes joined by OR. */
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

  // finalize top-level expression parser
  parseExpression = parseOr;
  const ast = parseExpression();
  return ast ?? { type: 'truthy', key: '', negated: true };
};

/**
 * Open an `{% if %}` frame during parsing and push its consequent node list onto the stack.
 *
 * @param expr - Raw if test expression.
 * @param nodesStack - Stack of node lists used to build nested AST structures.
 * @param controlStack - Stack of open control frames.
 */
export const tplParseIfOpen = (expr: string, nodesStack: TplNode[][], controlStack: Frame[]): void => {
  const node: TplIfNode = { type: 'if', test: tplParseTest(expr), consequent: [] };
  controlStack.push({ kind: 'if', node, parentNodes: nodesStack[nodesStack.length - 1], inAlternate: false });
  nodesStack.push(node.consequent);
};

/**
 * Parse an `{% elseif %}` token.
 *
 * If misplaced (no open if / already in else branch), the literal token is preserved as text.
 *
 * @param expr - Raw elseif test expression.
 * @param literalToken - Full literal token text to preserve when misplaced.
 * @param nodesStack - Stack of node lists used to build nested AST structures.
 * @param controlStack - Stack of open control frames.
 * @param pushText - Callback to append a text node to the current node list.
 */
export const tplParseElseIf = (
  expr: string,
  literalToken: string,
  nodesStack: TplNode[][],
  controlStack: Frame[],
  pushText: (v: string) => void,
): void => {
  const top = controlStack[controlStack.length - 1];
  if (top?.kind !== 'if') {
    pushText(literalToken);
    return;
  }
  if (top.inAlternate) {
    pushText(literalToken);
    return;
  }

  nodesStack.pop();
  const test = tplParseTest(expr);
  const branchNodes: TplNode[] = [];
  top.node.elseIfs ??= [];
  top.node.elseIfs.push({ test, nodes: branchNodes });
  nodesStack.push(branchNodes);
};

/**
 * Parse an `{% else %}` token.
 *
 * If misplaced (no open if / already in else branch), the literal token is preserved as text.
 *
 * @param literalToken - Full literal token text to preserve when misplaced.
 * @param nodesStack - Stack of node lists used to build nested AST structures.
 * @param controlStack - Stack of open control frames.
 * @param pushText - Callback to append a text node to the current node list.
 */
export const tplParseElse = (
  literalToken: string,
  nodesStack: TplNode[][],
  controlStack: Frame[],
  pushText: (v: string) => void,
): void => {
  const top = controlStack[controlStack.length - 1];
  if (top?.kind !== 'if') {
    pushText(literalToken);
    return;
  }
  if (top.inAlternate) {
    pushText(literalToken);
    return;
  }

  nodesStack.pop();
  top.node.alternate = [];
  nodesStack.push(top.node.alternate);
  top.inAlternate = true;
};

/**
 * Parse an `{% endif %}` token.
 *
 * If misplaced, the literal token is preserved as text.
 *
 * @param literalToken - Full literal token text to preserve when misplaced.
 * @param nodesStack - Stack of node lists used to build nested AST structures.
 * @param controlStack - Stack of open control frames.
 * @param pushText - Callback to append a text node to the current node list.
 */
export const tplParseEndIf = (
  literalToken: string,
  nodesStack: TplNode[][],
  controlStack: Frame[],
  pushText: (v: string) => void,
): void => {
  const top = controlStack.pop();
  if (top?.kind !== 'if') {
    pushText(literalToken);
    return;
  }

  nodesStack.pop();
  top.parentNodes.push(top.node);
};

/**
 * Render an `if` node by evaluating its test tree and rendering the first matching branch.
 *
 * @param n - The AST node to render.
 * @param scopes - Scope stack used for key resolution.
 * @param renderNodes - Recursive renderer for child node lists.
 * @returns Rendered string output for this if node.
 */
export const tplRenderIfNode = (
  n: TplIfNode,
  scopes: Record<string, unknown>[],
  renderNodes: (nodes: TplNode[], scopes: Record<string, unknown>[]) => string,
): string => {
  /**
   * Evaluate a parsed if-test node against the current scope stack.
   *
   * @param t - Test AST node.
   * @returns Whether the test evaluates to true.
   */
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

    /**
     * Compare two values using the template engine's coercion semantics.
     *
     * @returns Result of the comparison.
     */
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
    return renderNodes(n.consequent, scopes);
  }
  if (n.elseIfs && n.elseIfs.length > 0) {
    for (const br of n.elseIfs) {
      const okb = evalTest(br.test);
      if (okb) {
        return renderNodes(br.nodes, scopes);
      }
    }
    if (n.alternate) {
      return renderNodes(n.alternate, scopes);
    }
    return '';
  }
  if (n.alternate) {
    return renderNodes(n.alternate, scopes);
  }
  return '';
};
