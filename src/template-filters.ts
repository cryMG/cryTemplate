import type {
  TemplateFilterHandler,
  TplFilter,
} from './types.js';

import { filterDateformat } from './filters/dateformat.js';
import { filterJson } from './filters/json.js';
import { filterLower } from './filters/lower.js';
import { filterNumber } from './filters/number.js';
import { filterReplace } from './filters/replace.js';
import { filterString } from './filters/string.js';
import { filterTrim } from './filters/trim.js';
import { filterUpper } from './filters/upper.js';
import { filterUrlencode } from './filters/urlencode.js';

/**
 * Internal registry for template filters.
 */
const templateFilterRegistry = new Map<string, TemplateFilterHandler>();

/**
 * Register (or override) a template filter.
 *
 * Unknown filters referenced in templates are ignored at render time.
 * Registering a filter makes it available for `{{ value | filterName(...) }}`.
 *
 * @param name - Filter name (must match `/^[a-z][\w]*$/`).
 * @param handler - Function that receives the current value and optional arguments.
 */
export const registerTemplateFilter = (name: string, handler: TemplateFilterHandler): void => {
  if (!/^[a-z][\w]*$/.test(name)) {
    throw new TypeError(`Invalid filter name: ${name}`);
  }
  if (typeof handler !== 'function') {
    throw new TypeError('Filter handler must be a function');
  }
  templateFilterRegistry.set(name, handler);
};

/**
 * Look up a registered template filter handler.
 *
 * @param name - Filter name.
 * @returns The handler, or undefined if the filter is not registered.
 */
export const getTemplateFilter = (name: string): TemplateFilterHandler | undefined => {
  return templateFilterRegistry.get(name);
};

/**
 * Apply a filter pipeline (left-to-right).
 *
 * Unknown filter names are ignored to keep rendering fail-safe.
 *
 * @param value - Input value.
 * @param filters - Filter pipeline as parsed from the template.
 * @returns Transformed value after all known filters were applied.
 */
export const applyTemplateFilters = (value: unknown, filters: TplFilter[] | undefined): unknown => {
  let val = value;
  if (!filters || filters.length === 0) return val;

  for (const f of filters) {
    const handler = templateFilterRegistry.get(f.name);
    if (!handler) continue;
    val = handler(val, f.args);
  }
  return val;
};

/*
 * Register built-in filters.
 */
registerTemplateFilter('dateformat', filterDateformat);
registerTemplateFilter('json', filterJson);
registerTemplateFilter('lower', filterLower);
registerTemplateFilter('number', filterNumber);
registerTemplateFilter('replace', filterReplace);
registerTemplateFilter('string', filterString);
registerTemplateFilter('trim', filterTrim);
registerTemplateFilter('upper', filterUpper);
registerTemplateFilter('urlencode', filterUrlencode);
