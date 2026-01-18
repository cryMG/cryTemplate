/**
 * Built-in `json` filter.
 *
 * @param val - Input value.
 * @returns JSON string representation (empty string if stringify returns undefined).
 */
export function filterJson (val: unknown): string {
  const s = JSON.stringify(val);
  return s ?? '';
}
