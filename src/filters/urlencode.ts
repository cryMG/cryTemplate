/**
 * Built-in `urlencode` filter.
 *
 * @param val - Input value.
 * @returns URL-encoded string representation.
 */
export function filterUrlencode (val: unknown): string {
  return encodeURIComponent((val === undefined || val === null) ? '' : String(val as unknown));
}
