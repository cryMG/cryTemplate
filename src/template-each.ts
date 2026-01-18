import type {
  Frame,
  TplEachNode,
  TplNode,
} from './types.js';

import {
  tplResolveKey,
} from './template-runtime.js';

/**
 * Open an `{% each %}` frame during parsing and push its child node list onto the stack.
 *
 * @param listExpr - Identifier/dot-path expression resolving to an array or object.
 * @param varName - Loop variable name exposed inside the loop scope.
 * @param indexVarName - Optional index variable name (arrays only).
 * @param nodesStack - Stack of node lists used to build nested AST structures.
 * @param controlStack - Stack of open control frames.
 */
export const tplParseEachOpen = (
  listExpr: string,
  varName: string,
  indexVarName: string | undefined,
  nodesStack: TplNode[][],
  controlStack: Frame[],
): void => {
  const node: TplEachNode = {
    type: 'each',
    listExpr,
    varName,
    indexVarName,
    children: [],
  };
  controlStack.push({ kind: 'each', node, parentNodes: nodesStack[nodesStack.length - 1] });
  nodesStack.push(node.children);
};

/**
 * Parse an `{% each listExpr as var[, i] %}` token.
 *
 * On syntax errors, the literal token is preserved as plain text.
 *
 * @param raw - Inner control token contents (without `{%` / `%}`).
 * @param literalToken - Full literal token text to preserve on errors.
 * @param nodesStack - Stack of node lists used to build nested AST structures.
 * @param controlStack - Stack of open control frames.
 * @param pushText - Callback to append a text node to the current node list.
 */
export const tplParseEach = (
  raw: string,
  literalToken: string,
  nodesStack: TplNode[][],
  controlStack: Frame[],
  pushText: (v: string) => void,
): void => {
  const reEach = /^each\s+(.+?)\s+as\s+([A-Za-z_][\w]*)(?:\s*,\s*([A-Za-z_][\w]*))?$/i;
  const mEach = reEach.exec(raw);
  if (!mEach) {
    // Syntax error -> keep literal
    pushText(literalToken);
    return;
  }
  tplParseEachOpen(mEach[1].trim(), mEach[2], mEach[3], nodesStack, controlStack);
};

/**
 * Close an `{% endeach %}` frame during parsing.
 *
 * If misplaced, the literal token is preserved as plain text.
 *
 * @param literalToken - Full literal token text to preserve when misplaced.
 * @param nodesStack - Stack of node lists used to build nested AST structures.
 * @param controlStack - Stack of open control frames.
 * @param pushText - Callback to append a text node to the current node list.
 */
export const tplParseEndEach = (
  literalToken: string,
  nodesStack: TplNode[][],
  controlStack: Frame[],
  pushText: (v: string) => void,
): void => {
  const top = controlStack.pop();
  if (top?.kind !== 'each') {
    pushText(literalToken);
    return;
  }

  nodesStack.pop();
  top.parentNodes.push(top.node);
};

/**
 * Render an `each` node:
 * - Arrays: expose item as `varName` and optional index as `indexVarName`.
 * - Objects: iterate own keys and expose `{ key, value }` as `varName`.
 *
 * @param n - The AST node to render.
 * @param scopes - Scope stack used for key resolution.
 * @param renderNodes - Recursive renderer for child node lists.
 * @returns Rendered string output for this loop node.
 */
export const tplRenderEachNode = (
  n: TplEachNode,
  scopes: Record<string, unknown>[],
  renderNodes: (nodes: TplNode[], scopes: Record<string, unknown>[]) => string,
): string => {
  let out = '';
  const v = tplResolveKey(scopes, n.listExpr);
  if (Array.isArray(v)) {
    let i = 0;
    for (const item of v) {
      // Create a new scope that introduces the loop variable
      const base: Record<string, unknown> = scopes[scopes.length - 1];
      const newScope: Record<string, unknown> = { ...base, [n.varName]: item as unknown };
      if (n.indexVarName) newScope[n.indexVarName] = i;
      out += renderNodes(n.children, [ ...scopes, newScope ]);
      i++;
    }
  } else if (v && typeof v === 'object') {
    // Iterate over object keys; expose entry.key and entry.value
    const rec = v as Record<string, unknown>;
    for (const k of Object.keys(rec)) {
      const entry = { key: k, value: rec[k] };
      const base: Record<string, unknown> = scopes[scopes.length - 1];
      const newScope: Record<string, unknown> = { ...base, [n.varName]: entry };
      out += renderNodes(n.children, [ ...scopes, newScope ]);
    }
  }
  return out;
};
