/**
 * Internal runtime helpers shared by parser/render modules.
 */

/**
 * Resolve a dot-path from a given object (ignores prototype chain).
 *
 * Security: we only read own properties to avoid prototype chain traversal.
 *
 * @param obj - Object to resolve from.
 * @param path - Path segments (already split by '.').
 * @returns Resolved value or undefined if the path cannot be fully resolved.
 */
export const tplResolveFrom = (obj: unknown, path: string[]): unknown => {
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
 *
 * @param scopes - Stack of scope objects; last entry is the innermost scope.
 * @param key - Identifier or dot-path.
 * @returns Resolved value or undefined.
 */
export const tplResolveKey = (scopes: Record<string, unknown>[], key: string): unknown => {
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
 *
 * @param v - Value to test.
 * @returns Truthiness result.
 */
export const tplTruthy = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
};

/**
 * Consider whether a value is "empty" for interpolation fallback purposes.
 * Empty-ish means: undefined, null, empty string (''), empty array ([]), or empty object ({}).
 * Note: boolean false and number 0 are NOT empty here, so `{{ val || 'x' }}` won't replace them.
 *
 * @param v - Value to test.
 * @returns Whether the value is considered empty-ish.
 */
export const tplEmptyish = (v: unknown): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') return Object.keys(v).length === 0;
  return false;
};
