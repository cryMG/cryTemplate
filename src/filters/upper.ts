/**
 * Built-in `upper` filter.
 *
 * @param val - Input value.
 * @returns Uppercased string representation (empty string for null/undefined).
 */
export function filterUpper (val: unknown): string {
  return (val === undefined || val === null) ? '' : String(val as unknown).toUpperCase();
}
