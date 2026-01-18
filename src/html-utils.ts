/**
 * Escape a string to be safely inserted into HTML text or attribute contexts.
 *
 * Implementation detail: encodes `&`, `<`, `>`, `"` and `'` to ensure consistent,
 * attribute-safe output.
 *
 * @param str The string to escape.
 * @returns The escaped string.
 *
 * @example
 * ```ts
 * const unsafeString = '<script>alert("XSS")</script>';
 * const safeString = escapeHtml(unsafeString);
 * // safeString will be '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 * ```
 */
export function escapeHtml (str: string): string {
  // DOM-free, Node-safe implementation: replace in a single pass
  const s = String(str ?? '');
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (ch) => map[ch]);
}

/**
 * Unescape a string from HTML into plain text.
 *
 * Implementation detail: replaces common named and numeric entities we produce:
 * `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&#39;`
 *
 * @param str The string to unescape.
 * @returns The unescaped string.
 *
 * @example
 * ```ts
 * const safeString = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;';
 * const unsafeString = unescapeHtml(safeString);
 * // unsafeString will be '<script>alert("XSS")</script>'
 * ```
 */
export function unescapeHtml (str: string): string {
  // Handle common named and numeric entities we produce
  const s = String(str ?? '');
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/gi, (m: string, ent: string) => {
    switch (ent.toLowerCase()) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos':
      case '#39': return "'";
      default: return m;
    }
  });
}
