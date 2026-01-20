/*
 * Lightweight and safe-by-default string template engine.
 *
 */

import {
  tplParse,
  tplRenderNodes,
} from './template-parser.js';

// re-export some functions
export {
  tplParse,
  tplRenderNodes,
} from './template-parser.js';

export {
  escapeHtml,
  unescapeHtml,
} from './html-utils.js';

export {
  registerTemplateFilter,
} from './template-filters.js';

export {
  setDayjsTemplateReference,
} from './refs.js';

/**
 * Render a template using the provided data as the root scope.
 *
 * Malformed or misplaced control tokens are preserved as text - no throws.
 *
 * @param tpl - Template string.
 * @param data - Data object for the root scope. May be nested.
 * @returns Rendered string.
 */
export function renderTemplate (tpl: string, data: Record<string, unknown> = {}): string {
  const ast = tplParse(tpl);
  return tplRenderNodes(ast, [ data ]);
}
