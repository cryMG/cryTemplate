/**
 * Built-in `string` filter.
 *
 * @param val - Input value.
 * @returns String value of the input (empty string for null/undefined).
 */
export function filterString (val: unknown): string {
  return (val === undefined || val === null) ? '' : String(val as unknown);
}
