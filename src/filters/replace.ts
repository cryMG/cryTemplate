/**
 * Built-in `replace` filter.
 *
 * @param val - Input value.
 * @param args - `[from, to]` arguments.
 * @returns String with occurrences of `from` replaced by `to`.
 */
export function filterReplace (val: unknown, args?: (string | number | boolean | null)[]): string {
  const src = (val === undefined || val === null) ? '' : String(val as unknown);

  const from = (args && args.length > 0) ? String(args[0] as unknown) : '';
  const to = (args && args.length > 1) ? String(args[1] as unknown) : '';

  if (from === '') return src;
  return src.split(from).join(to);
}
