/**
 * Built-in `trim` filter.
 *
 * @param val - Input value.
 * @returns Trimmed string representation (empty string for null/undefined).
 */
export function filterTrim (val: unknown): string {
  return (val === undefined || val === null) ? '' : String(val as unknown).trim();
}
