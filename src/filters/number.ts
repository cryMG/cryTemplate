/**
 * Built-in `number` filter.
 *
 * @param val - Input value.
 * @param args - Optional arguments: `number()`, `number(decimals)`, `number(decimals, decimalSep)`, `number(decimals, decimalSep, thousandsSep)`.
 * @returns Formatted number string.
 */
export function filterNumber (val: unknown, args?: (string | number | boolean | null)[]): string {
  const firstArg = (Array.isArray(args) && args.length > 0) ? args[0] : undefined;
  const secondArg = (Array.isArray(args) && args.length > 1) ? args[1] : undefined;
  const thirdArg = (Array.isArray(args) && args.length > 2) ? args[2] : undefined;
  const d = (typeof firstArg === 'number') ? firstArg : undefined;

  // Semantics:
  // - 0 args: number()
  // - 1 arg: number(decimals)
  // - 2 args: number(decimals, decimalSep)
  // - 3 args: number(decimals, decimalSep, thousandsSep)
  const decimalSep = (typeof secondArg === 'string') ? secondArg : undefined;
  const thousandsSep = (typeof thirdArg === 'string') ? thirdArg : undefined;

  const num = (typeof val === 'number') ? val : Number(val);
  if (Number.isFinite(num)) {
    const decimals = (typeof d === 'number') ? Math.max(0, Math.floor(d)) : undefined;
    let s = (typeof decimals === 'number') ? num.toFixed(decimals) : String(num);
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
    if (m) {
      const sign = m[1] ?? '';
      const intPart = m[2];
      const frac = m[3] ?? '';
      const grouped = (thousandsSep && thousandsSep.length > 0)
        ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep)
        : intPart;
      const decChar = (decimalSep ?? '.');
      s = sign + grouped + (frac.length > 0 ? decChar + frac : '');
    }
    return s;
  }

  return (val === undefined || val === null) ? '' : String(val as unknown);
}
