import { refs } from '../refs.js';

/**
 * Built-in `dateformat` filter.
 *
 * Supports a subset of Dayjs formatting tokens unless a dayjs reference is set.
 * If a dayjs reference is set, the full dayjs formatting capabilities are available.
 *
 * Supported tokens:
 * - `YYYY`: 4-digit year
 * - `YY`: 2-digit year
 * - `MM`: zero-padded month (01-12)
 * - `M`: month (1-12)
 * - `DD`: zero-padded day of month (01-31)
 * - `D`: day of month (1-31)
 * - `HH`: zero-padded hours (00-23)
 * - `H`: hours (0-23)
 * - `hh`: zero-padded hours (01-12)
 * - `h`: hours (1-12)
 * - `mm`: zero-padded minutes (00-59)
 * - `m`: minutes (0-59)
 * - `ss`: zero-padded seconds (00-59)
 * - `s`: seconds (0-59)
 * - `Z`: timezone offset in ±HH:mm format
 * - `A`: AM/PM
 * - `a`: am/pm
 *
 * @param val - Input value.
 * @param args - `[format]` arguments.
 * @returns Formatted date string.
 */
export function filterDateformat (val: unknown, args?: (string | number | boolean | null)[]): string {
  if (val === undefined || val === null) return '';

  const firstArg = (Array.isArray(args) && args.length > 0) ? args[0] : undefined;
  const format = (firstArg === undefined || firstArg === null) ? 'YYYY-MM-DD HH:mm:ss' : String(firstArg);

  // use dayjs if available
  if (refs.dayjs) {
    const date = refs.dayjs(val as string | number | Date);
    if (!date.isValid()) return '';

    return date.format(format);
  }

  // use js Date if dayjs is not available
  const date = (val instanceof Date) ? val : new Date(val as string | number);

  // check for valid date
  if (isNaN(date.getTime())) return '';

  const pad2 = (n: number): string => String(n).padStart(2, '0');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const hours12 = (hours24 % 12) === 0 ? 12 : (hours24 % 12);
  const meridiem = hours24 < 12 ? 'AM' : 'PM';

  const tzOffsetMinutes = -date.getTimezoneOffset();
  const tzSign = tzOffsetMinutes >= 0 ? '+' : '-';
  const tzAbs = Math.abs(tzOffsetMinutes);
  const tzHours = Math.floor(tzAbs / 60);
  const tzMinutes = tzAbs % 60;
  const tz = `${tzSign}${pad2(tzHours)}:${pad2(tzMinutes)}`;

  const tokenPattern = /(YYYY|YY|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|Z|A|a)/g;
  const replaceTokens = (s: string): string => {
    return s.replace(tokenPattern, (token) => {
      switch (token) {
        case 'YYYY': return String(date.getFullYear());
        case 'YY': return pad2(date.getFullYear() % 100);
        case 'M': return String(month);
        case 'MM': return pad2(month);
        case 'D': return String(day);
        case 'DD': return pad2(day);
        case 'H': return String(hours24);
        case 'HH': return pad2(hours24);
        case 'h': return String(hours12);
        case 'hh': return pad2(hours12);
        case 'm': return String(minutes);
        case 'mm': return pad2(minutes);
        case 's': return String(seconds);
        case 'ss': return pad2(seconds);
        case 'Z': return tz;
        case 'A': return meridiem;
        case 'a': return meridiem.toLowerCase();
        default: return token;
      }
    });
  };

  // Dayjs-like escaping: everything inside [...] is treated as a literal,
  // and the surrounding brackets are removed.
  // Example: YYYY[Y]MM[M]DD[D] -> 2026Y01M19D
  let out = '';
  let i = 0;
  while (i < format.length) {
    const open = format.indexOf('[', i);
    if (open === -1) {
      out += replaceTokens(format.slice(i));
      break;
    }

    out += replaceTokens(format.slice(i, open));
    const close = format.indexOf(']', open + 1);
    if (close === -1) {
      // No matching closing bracket: treat '[' as a literal character.
      out += '[';
      i = open + 1;
      continue;
    }

    out += format.slice(open + 1, close);
    i = close + 1;
  }

  return out;
}
