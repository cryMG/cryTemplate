/**
 * Built-in `trim` filter.
 *
 * Optional mode can be provided as the first argument:
 * - 'left': trimStart()
 * - 'right': trimEnd()
 * - 'both': trim()
 *
 * Unknown mode values fall back to 'both'.
 *
 * @param val - Input value.
 * @param args - Optional filter arguments.
 * @returns Trimmed string representation (empty string for null/undefined).
 */
export function filterTrim (val: unknown, args?: (string | number | boolean | null)[]): string {
  const str = (val === undefined || val === null) ? '' : String(val as unknown);
  const mode = (Array.isArray(args) && typeof args[0] === 'string') ? args[0].toLowerCase() : 'both';

  if (mode === 'left') return str.trimStart();
  if (mode === 'right') return str.trimEnd();
  return str.trim();
}
