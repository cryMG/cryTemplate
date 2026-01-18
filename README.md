# cryTemplate

Lightweight and safe-by-default string template engine with zero dependencies.

## Highlights and guarantees

* Escapes HTML by default for interpolations (`{{ key }}` and `{{= key }}`)
* Opt-in raw insertion via `{{- key }}` for already-sanitized/fully trusted HTML
* Fallback operators inside interpolations:
  * `||` (empty-ish): replaces undefined, null, empty string, empty array or empty object
  * `??` (nullish): replaces only when value is undefined or null
  * Both operators are chainable from left to right, e.g. `{{ a || b ?? 'x' || 'y' }}`
* Minimal control flow: `{% if %}` / `{% elseif %}` / `{% else %}` / `{% endif %}`
  * Conditions support negation via `!` or leading `not` and comparisons: `==`, `!=`, `>`, `<`, `>=`, `<=`
  * Logical operators with grouping: `&&`, `||` and parentheses, e.g. `{% if (a == 'x' && b) || c %}`
  * RHS of comparisons can be a literal (string, number, boolean, null) or a key (identifier/dot-path)
* Iteration:
  * Arrays: `{% each listExpr as item %}`...`{% endeach %}`, optional index var: `{% each list as item, i %}`
  * Objects: if listExpr resolves to an object, iterate its own keys and expose `{ key, value }` as the loop var
* Inline comments: `{%# this is ignored %}`
* Filter pipeline for interpolations, e.g. `{{ user.name | trim | upper }}`
  * Built-in filters: upper, lower, trim, number, json, urlencode, attr, replace
  * number filter signatures:
    * number(decimals)
    * number(decimals, decimalSep)
    * number(decimals, decimalSep, thousandsSep)
* Dot-path resolution (e.g., user.name.first) across scope stack (later scopes shadow earlier)
* Misplaced/invalid control tokens degrade to literal text; no runtime throws for templates
* No arbitrary JS evaluation in templates (predictable and secure by design)

## License

MIT License. See LICENSE file for details.

Copyright (c) 2025-2026 cryeffect Media Group <https://crymg.de>, Peter Müller
