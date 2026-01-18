import { assert } from 'chai';

import {
  renderTemplate,
} from '../src/index.js';

describe('filters', function () {
  it('upper and lower', function () {
    assert.strictEqual(renderTemplate('{{ name | upper }}', { name: 'Ada' }), 'ADA');
    assert.strictEqual(renderTemplate('{{ name | lower }}', { name: 'BETA' }), 'beta');
  });

  it('trim removes surrounding whitespace', function () {
    assert.strictEqual(renderTemplate('{{ v | trim }}', { v: '  x  \n' }), 'x');
  });

  it('number() formats numeric output with optional precision', function () {
    assert.strictEqual(renderTemplate('{{ v | number }}', { v: 12.5 }), '12.5');
    assert.strictEqual(renderTemplate('{{ v | number(2) }}', { v: 1.234 }), '1.23');
    // Non-numeric yields empty-safe string conversion
    assert.strictEqual(renderTemplate('{{ v | number(1) }}', { v: 'abc' }), 'abc');
  });

  it('number(decimals, decimalSep) sets decimal separator without grouping', function () {
    assert.strictEqual(renderTemplate("{{ v | number(2, ',') }}", { v: 1234567.8 }), '1234567,80');
    assert.strictEqual(renderTemplate("{{ v | number(0, ',') }}", { v: 1000000 }), '1000000');
  });

  it('number(decimals, decimalSep, thousandsSep) supports european style', function () {
    // Expect 1.337,42 for 1337.42 with decimal=',' and thousands='.'
    assert.strictEqual(renderTemplate("{{ v | number(2, ',', '.') }}", { v: 1337.42 }), '1.337,42');
    // Also check larger grouping
    assert.strictEqual(renderTemplate("{{ v | number(3, ',', '.') }}", { v: 1234567.8 }), '1.234.567,800');
    // When decimals=0, no decimal part should be printed
    assert.strictEqual(renderTemplate("{{ v | number(0, ',', '.') }}", { v: 1234567 }), '1.234.567');
  });

  it('json serializes values', function () {
    // Use raw to avoid HTML entity escaping
    assert.strictEqual(renderTemplate('{{- obj | json }}', { obj: { a: 1 } }), '{"a":1}');
    assert.strictEqual(renderTemplate('{{- arr | json }}', { arr: [ 1, 'x' ] }), '[1,"x"]');
  });

  it('urlencode encodes reserved characters', function () {
    const out = renderTemplate('{{ v | urlencode }}', { v: 'a b&c' });
    assert.strictEqual(out, 'a%20b%26c');
  });

  it('attr leaves string for attribute contexts; escaping still applies', function () {
    const out = renderTemplate('<a title="{{ name | attr }}">', { name: 'a"b' });
    assert.strictEqual(out, '<a title="a&quot;b">');
  });

  it('supports filter chaining', function () {
    const out = renderTemplate('{{ v | trim | upper }}', { v: '  ok  ' });
    assert.strictEqual(out, 'OK');
  });

  it('replace(old, new) replaces all occurrences literally', function () {
    assert.strictEqual(renderTemplate("{{ v | replace('x', 'y') }}", { v: 'x-xx-x' }), 'y-yy-y');
    // Empty old should be a no-op
    assert.strictEqual(renderTemplate("{{ v | replace('', 'y') }}", { v: 'abc' }), 'abc');
  });

  it('replace works after coercion and can chain', function () {
    const out = renderTemplate("{{ v | number(2, ',') | replace(',', ';') }}", { v: 12.34 });
    assert.strictEqual(out, '12;34');
  });
});
