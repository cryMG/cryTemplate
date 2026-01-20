/*!
 * cryTemplate
 *
 * Lightweight and safe-by-default string template engine with zero dependencies.
 *
 * No code execution from templates – just string magic with interpolation,
 * control flow, iteration, filters, and HTML escaping.
 *
 * Copyright (c) 2025-2026 cryeffect Media Group <https://crymg.de>, Peter Müller
 * Licensed under the MIT License.
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
 * Data objects are merged left to right, so later objects override
 * properties of earlier ones.
 *
 * Malformed or misplaced control tokens are preserved as text - no throws.
 *
 * @param tpl - Template string.
 * @param data - Data object for the root scope. May be nested. May be repeated.
 * @returns Rendered string.
 */
export function renderTemplate (tpl: string, ...data: Record<string, unknown>[]): string {
  const ast = tplParse(tpl);
  return tplRenderNodes(ast, data);
}
