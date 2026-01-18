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
  * Built-in filters: upper, lower, trim, number, json, urlencode, replace, string
  * number filter signatures:
    * number(decimals)
    * number(decimals, decimalSep)
    * number(decimals, decimalSep, thousandsSep)
* Dot-path resolution (e.g., user.name.first) across scope stack (later scopes shadow earlier)
* Misplaced/invalid control tokens degrade to literal text; no runtime throws for templates
* No arbitrary JS evaluation in templates (predictable and secure by design)

## Filters

Filters can be applied to interpolations using a pipe syntax:

```txt
{{ key | filterName }}
{{ key | filterName(arg1, arg2) | otherFilter }}
```

Filters are applied **left-to-right**. After all filters have been applied, the final value is converted to a string (`null`/`undefined` become an empty string) and then HTML-escaped unless you use the raw interpolation form `{{- ... }}`.

### Filter names

* In templates, filter names are parsed as `\w+` (letters, digits, underscore).
* When registering filters in JS/TS, the current registry enforces lowercase names that match: `^[a-z][\w]*$`.

Unknown filter names referenced in templates are **ignored at render time** (fail-safe behavior).

### Filter arguments

Filter arguments are optional and comma-separated:

```txt
{{ title | replace(' ', '-') | lower }}
{{ price | number(2, ',', '.') }}
```

Supported argument literals:

* strings in single or double quotes (supports basic backslash escaping)
* numbers (`123`, `-1`, `3.14`)
* booleans (`true`/`false`, case-insensitive)
* `null` (case-insensitive)

Other/unsupported argument tokens are ignored.

### Built-in filters

#### `upper`

Uppercases the string representation of the value. Returns `''` for `null`/`undefined`.

Example: `{{ user.name | upper }}`

#### `lower`

Lowercases the string representation of the value. Returns `''` for `null`/`undefined`.

Example: `{{ user.name | lower }}`

#### `trim`

Trims surrounding whitespace from the string representation of the value. Returns `''` for `null`/`undefined`.

Example: `{{ user.name | trim }}`

#### `replace(from, to)`

Performs a literal, global replacement on the string representation of the value.

* `from` is coerced to string
* `to` is coerced to string
* if `from` is `''`, the input is returned unchanged

Examples:

* `{{ title | replace(' ', '-') }}`
* `{{ title | trim | replace('  ', ' ') }}`

#### `string`

Coerces to string early.

* `null`/`undefined` → `''`
* otherwise → `String(value)`

This can be useful for chaining when you want to be explicit about string conversion.

Example: `{{ value | text | replace('x', 'y') }}`

#### `number(decimals?, decimalSep?, thousandsSep?)`

Formats numeric output.

* Attempts to convert the value via `Number(value)` if it is not already a number.
* If the result is not a finite number, it returns `''` for `null`/`undefined` and otherwise `String(value)`.

Signatures:

* `number()`
* `number(decimals)`
* `number(decimals, decimalSep)`
* `number(decimals, decimalSep, thousandsSep)`

Examples:

* `{{ price | number(2) }}` → `1234.50`
* `{{ price | number(2, ',') }}` → `1234,50`
* `{{ price | number(2, ',', '.') }}` → `1.234,50`

#### `json`

Serializes the value via `JSON.stringify(value)`.

* If `JSON.stringify` returns `undefined` (e.g. for `undefined`), the filter returns `''`.

Example: `{{ obj | json }}`

#### `urlencode`

Encodes the string representation of the value via `encodeURIComponent(...)`.

Example: `{{ query | urlencode }}`

### Custom filters

You can create and register your own filters at runtime.

#### Registering a filter

Import `registerTemplateFilter` and register a handler:

```ts
import { registerTemplateFilter, renderTemplate } from 'crytemplate';

registerTemplateFilter('slug', (value) => {
  const s = (value === undefined || value === null) ? '' : String(value);
  return s.trim().toLowerCase().replace(/\s+/g, '-');
});

const out = renderTemplate('Hello {{ name | slug }}!', { name: 'John Doe' });
```

Notes:

* The handler signature is `(value: unknown, args?: (string | number | boolean | null)[]) => unknown`.
* Returning non-strings is allowed; the engine will stringify after the filter pipeline.
* Register filters once during application startup (the registry is global to the module).
* Re-registering the same name overrides the previous handler (including built-ins).

## License

MIT License. See LICENSE file for details.

Copyright (c) 2025-2026 cryeffect Media Group <https://crymg.de>, Peter Müller
