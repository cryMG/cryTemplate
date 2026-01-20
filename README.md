# cryTemplate

**Lightweight** and **safe-by-default** string template engine with **zero dependencies**.

No code execution from templates – just string magic with interpolation, control flow, iteration, filters, and HTML escaping. 🪄

[![NPM](https://nodei.co/npm/crytemplate.svg?data=d,s)](https://nodei.co/npm/crytemplate/)

![Test and Release](https://github.com/cryMG/cryTemplate/workflows/Build%20and%20code%20checks/badge.svg)

Infomation and live demo (GitHub Pages): <https://crymg.github.io/cryTemplate/>

## Why another template parser?

Many existing template engines either allow arbitrary code execution (e.g., via `eval` or `new Function`), have heavy dependencies, or come with complex syntax and features that are overkill for simple templating needs.

*cryTemplate* is our answer to a minimal, secure, and easy-to-use template engine that covers common use cases without the risks and bloat of more complex solutions.

## Highlights

* HTML-escapes interpolations by default (`{{ ... }}`)
* Raw HTML output is explicit (`{{= ... }}`)
* No arbitrary JavaScript execution from templates (secure and predictable)
* Basics included: interpolations, `{% if %}` conditionals, `{% each %}` loops, comments
* Filters with a pipe syntax (`{{ value | trim | upper }}`), including `dateformat`
* Dot-path lookups across a scope stack + simple fallbacks (`||`, `??`)
* Fail-safe parsing: malformed/unsupported tokens degrade to literal text (no runtime throws)

## Usage

*cryTemplate* can be consumed as ESM, CJS, or directly in the browser.

### ESM (Node.js / modern bundlers)

```ts
import { renderTemplate } from 'crytemplate';

const out = renderTemplate('Hello {{ name | trim | upper }}!', { name: '  Alex  ' });
// => "Hello ALEX!"
```

### CJS (Node.js require)

```js
const { renderTemplate } = require('crytemplate');

const out = renderTemplate('Hello {{ name }}!', { name: 'Alex' });
// => "Hello Alex!"
```

### Browser (no bundler)

The browser bundles can be directly included via script tags.

From the `dist/browser` folder, use either:

* `dist/browser/crytemplate.js`
* `dist/browser/crytemplate.min.js`

Or use a CDN like jsDelivr or UNPKG:

```html
<script src="https://cdn.jsdelivr.net/npm/crytemplate/dist/browser/crytemplate.min.js"></script>
<script src="https://unpkg.com/crytemplate/dist/browser/crytemplate.min.js"></script>
```

They expose a global `cryTemplate` object.

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script src="https://cdn.jsdelivr.net/npm/crytemplate/dist/browser/crytemplate.min.js"></script>
  </head>
  <body>
    <script>
      const out = cryTemplate.renderTemplate('Hi {{ name }}!', { name: 'Alex' });
      console.log(out);
      // logs "Hi Alex!"
    </script>
  </body>
</html>
```

## Interpolations

Interpolations insert data into the output using double curly braces.

Supported forms:

* `{{ key }}`: HTML-escaped insertion (default)
* `{{= key }}`: raw insertion (no HTML escaping)

Where `key` is an identifier or dot-path identifier:

* `name`
* `user.name`
* `user.profile.firstName`

If a key cannot be resolved, it becomes an empty string.

> [!IMPORTANT]
> Interpolations do not evaluate JavaScript. You cannot call functions from templates.
> Only identifier/dot-path lookups, fallbacks (`||`, `??`) and filters are supported.

### Escaping behavior

By default, interpolation output is HTML-escaped (safe-by-default):

```txt
{{ title }}
```

Raw insertion bypasses escaping:

```txt
{{= trustedHtml }}
```

Only use raw insertion for already-sanitized, fully trusted HTML.

### Dot-path resolution

Dot-paths resolve through objects:

```txt
Hello {{ user.name.first }}!
```

If any segment is missing, the result is empty.

### Fallback operators (`||` and `??`)

Interpolations support fallbacks:

* `||` (empty-ish): replaces `undefined`, `null`, `''`, `[]`, `{}`
* `??` (nullish): replaces only `undefined` and `null`

Fallbacks are chainable left-to-right:

```txt
Hello {{ user.name || user.email || 'anonymous' }}
```

Examples showing the semantic difference:

```txt
{{ v || 'fallback' }}   // replaces '' but keeps 0 and false
{{ v ?? 'fallback' }}   // replaces null/undefined but keeps ''
```

### Filters in interpolations

You can pipe the resolved value through one or more filters:

```txt
{{ user.name | trim | upper }}
{{ price | number(2, ',', '.') }}
{{ createdAt | dateformat('YYYY-MM-DD') }}
```

Filters are applied left-to-right, and unknown filters are ignored.

See below for details on built-in and custom filters.

## Conditionals

Conditionals provide minimal control flow using `{% ... %}` blocks.

Supported tags:

* `{% if test %}`
* `{% elseif test %}`
* `{% else %}`
* `{% endif %}`

Example:

```txt
{% if user.admin %}
  Admin
{% elseif user.moderator %}
  Moderator
{% else %}
  User
{% endif %}
```

> [!IMPORTANT]
> Tests are not JavaScript expressions. There is no arbitrary code execution.
> If a test is malformed/unsupported, the engine degrades safely.

### Truthiness rules

Truthiness is intentionally simple and predictable:

* Arrays are truthy only when non-empty (`[1]` → true, `[]` → false)
* Objects are truthy only when they have at least one own key (`{k:1}` → true, `{}` → false)
* Everything else uses normal boolean coercion (`0` → false, `'x'` → true)

Examples:

```txt
{% if items %}has items{% else %}no items{% endif %}
{% if obj %}has keys{% else %}empty{% endif %}
```

### Negation

Negation works with either `!` or leading `not`:

```txt
{% if !user.admin %}not admin{% endif %}
{% if not user.admin %}not admin{% endif %}
```

### Comparisons

Supported comparison operators:

* `==`, `!=` (equality)
* `>`, `<`, `>=`, `<=` (numeric/string comparisons)

The left-hand side is usually a key, the right-hand side can be:

* a literal: `'text'`, `123`, `3.14`, `true`, `false`, `null`
* another key

Examples:

```txt
{% if status == 'open' %}...{% endif %}
{% if age >= 18 %}adult{% endif %}
{% if lhs > rhs %}...{% endif %}
{% if v == null %}missing{% endif %}
```

### Logical operators and grouping

You can combine tests using `&&` and `||` and group with parentheses:

```txt
{% if (a == 'x' && b) || c %}
  ok
{% endif %}
```

Precedence is `&&` before `||`.

### Malformed control tokens

Misplaced or invalid control tokens degrade to literal text instead of throwing at runtime.
This keeps rendering fail-safe even on partially broken templates.

## Loops

Loops are implemented with an `{% each ... %}` block.

Supported forms:

* Arrays: `{% each listExpr as item %}` ... `{% endeach %}`
* Arrays with index: `{% each listExpr as item, i %}` ... `{% endeach %}`
* Objects: if `listExpr` resolves to an object, the engine iterates own keys and exposes an entry object as the loop variable.

### Iterating arrays

```txt
{% each items as it %}
  - {{ it }}
{% endeach %}
```

With an index variable:

```txt
{% each items as it, i %}
  {{ i }}: {{ it }}
{% endeach %}
```

If the array is empty, the loop renders nothing.

### Iterating objects

If the list expression is an object, the loop variable is an entry object with `key` and `value`:

```txt
{% each user as e %}
  {{ e.key }} = {{ e.value }}
{% endeach %}
```

Object iteration uses the engine's normal key enumeration order (insertion order in modern JS engines).

### Scoping rules

Each loop introduces a nested scope:

* The loop variable (and optional index variable) exist only inside the loop body.
* Outer variables with the same name are shadowed inside the loop, but remain unchanged outside.

Example:

```txt
outside={{ it }}
{% each items as it %}
  inside={{ it }}
{% endeach %}
outside-again={{ it }}
```

### Nesting

Loops can be nested and combined with conditionals:

```txt
{% each users as u %}
  {% if u.active %}
    {{ u.name }}
  {% endif %}
{% endeach %}
```

## Comments

Comments can be added using `{# comment #}` blocks:

```txt
{# This is a comment #}

{#
  This is also a comment.
  It can span multiple lines.
#}
```

## Filters

Filters can be applied to interpolations using a pipe syntax:

```txt
{{ key | filterName }}
{{ key | filterName(arg1, arg2) | otherFilter }}
```

Filters are applied **left-to-right**. After all filters have been applied, the final value is converted to a string (`null`/`undefined` become an empty string) and then HTML-escaped unless you use the raw interpolation form `{{= ... }}`.

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

Trims whitespace from the string representation of the value. Returns `''` for `null`/`undefined`.

Optional mode (first argument):

* `trim('left')` → `trimStart()`
* `trim('right')` → `trimEnd()`
* `trim('both')` → `trim()` (default)

Unknown mode values fall back to `both`.

Example: `{{ user.name | trim }}` or `{{ user.name | trim('left') }}` / `{{ user.name | trim('right') }}`

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

#### `dateformat(format?)`

Formats a date/time value.

Inputs:

* `Date`
* `number` (timestamp, milliseconds since epoch)
* `string` (anything `new Date(value)` can parse)

If the input cannot be parsed as a valid date, the filter returns `''`.

By default, it formats using:

* `YYYY-MM-DD HH:mm:ss`

Example:

```txt
{{ createdAt | dateformat('YYYY-MM-DD HH:mm:ss') }}
{{ createdAt | dateformat }}
```

Supported formatting tokens in [Day.js](https://day.js.org/docs/en/display/format)-style:

* `YYYY`, `YY`
* `M`, `MM`
* `D`, `DD`
* `H`, `HH`
* `h`, `hh`
* `m`, `mm`
* `s`, `ss`
* `Z` (timezone offset in `±HH:mm`)
* `A`, `a` (AM/PM)

Escaping: anything inside `[...]` is treated as a literal and the brackets are removed.

Example:

```txt
{{ createdAt | dateformat('YYYY-MM-DD [YYYY-MM-DD]') }}
```

##### Dayjs integration

cryTemplate does not require [Day.js](https://day.js.org/), but you can enable full Day.js formatting by providing a Day.js reference.

`setDayjsTemplateReference(dayjs)` sets the reference that the `dateformat` filter will use.
Passing `null` clears it and reverts to the built-in token subset.

Example:

```ts
import dayjs from 'dayjs';
import { setDayjsTemplateReference, renderTemplate } from 'crytemplate';

setDayjsTemplateReference(dayjs);

const out = renderTemplate("{{ d | dateformat('MMM YYYY') }}", { d: new Date() });
```

### Custom filters

You can create and register your own filters at runtime.

> [!CAUTION]
> By implementing custom filters, you take responsibility for ensuring that they do not introduce security vulnerabilities (e.g., via code execution or unsafe HTML generation).

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
