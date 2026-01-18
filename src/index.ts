/*
 * Lightweight and safe-by-default string template engine.
 *
 */

import {
  tplParse,
  tplRenderNodes,
} from './template-parser.js';

// re-export public helpers
export {
  escapeHtml,
  unescapeHtml,
} from './html-utils.js';

/**
 * Render a template using the provided data as the root scope.
 *
 * Contract:
 * - Inputs: template string, plain data object
 * - Output: rendered HTML string
 * - Errors: Malformed or misplaced control tokens are preserved as text; no throws
 */
export function renderTemplate (tpl: string, data: Record<string, unknown> = {}): string {
  const ast = tplParse(tpl);
  return tplRenderNodes(ast, [ data ]);
}
