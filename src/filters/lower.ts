/**
 * Built-in `lower` filter.
 *
 * @param val - Input value.
 * @returns Lowercased string representation (empty string for null/undefined).
 */
export function filterLower (val: unknown): string {
  return (val === undefined || val === null) ? '' : String(val as unknown).toLowerCase();
}
