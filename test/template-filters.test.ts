import { assert } from 'chai';
import dayjs from 'dayjs';

import {
  registerTemplateFilter,
  renderTemplate,
} from '../src/index.js';
import { refs } from '../src/refs.js';

describe('template rendering / filters', function () {
  let prevDayjsRef: typeof refs.dayjs;

  beforeEach(function () {
    prevDayjsRef = refs.dayjs;
  });

  afterEach(function () {
    refs.dayjs = prevDayjsRef;
  });

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

  it('text converts value to string but leaves null or undefined as empty string', function () {
    assert.strictEqual(renderTemplate('a {{ val | text }} c', { val: 'b' }), 'a b c');
    assert.strictEqual(renderTemplate('a {{ val | text }} c', { val: 42 }), 'a 42 c');
    assert.strictEqual(renderTemplate('a {{ val | text }} c', { val: null }), 'a  c');
    assert.strictEqual(renderTemplate('a {{ val | text }} c', { val: undefined }), 'a  c');
    assert.strictEqual(renderTemplate('a {{ val | text }} c', { val: { o: 1 } }), 'a [object Object] c');
  });

  it('urlencode encodes reserved characters', function () {
    const out = renderTemplate('{{ v | urlencode }}', { v: 'a b&c' });
    assert.strictEqual(out, 'a%20b%26c');
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

  it('unknown filters are ignored (fail-safe)', function () {
    assert.strictEqual(renderTemplate('{{ name | doesNotExist }}', { name: 'Ada' }), 'Ada');
  });

  it('dateformat supports a small dayjs-like token set', function () {
    const d = new Date(2026, 0, 19, 15, 4, 5);
    const asString = d.toISOString();
    const asNumber = d.getTime();

    const pad2 = (n: number): string => String(n).padStart(2, '0');
    const tzOffsetMinutes = -d.getTimezoneOffset();
    const tzSign = tzOffsetMinutes >= 0 ? '+' : '-';
    const tzAbs = Math.abs(tzOffsetMinutes);
    const tzHours = Math.floor(tzAbs / 60);
    const tzMinutes = tzAbs % 60;
    const tz = `${tzSign}${pad2(tzHours)}:${pad2(tzMinutes)}`;

    assert.strictEqual(
      renderTemplate("{{ v | dateformat('YYYY-MM-DD HH:mm:ss') }}", { v: d }),
      '2026-01-19 15:04:05',
    );
    assert.strictEqual(
      renderTemplate("{{ v | dateformat('YYYY-MM-DD HH:mm:ss') }}", { v: asString }),
      '2026-01-19 15:04:05',
    );
    assert.strictEqual(
      renderTemplate("{{ v | dateformat('YYYY-MM-DD HH:mm:ss') }}", { v: asNumber }),
      '2026-01-19 15:04:05',
    );
    assert.strictEqual(
      renderTemplate("{{ v | dateformat('YY-M-D H:m:s') }}", { v: d }),
      '26-1-19 15:4:5',
    );
    assert.strictEqual(
      renderTemplate("{{ v | dateformat('h:hh A a') }}", { v: d }),
      '3:03 PM pm',
    );
    assert.strictEqual(
      renderTemplate("{{ v | dateformat('Z') }}", { v: d }),
      tz,
    );

    // default format
    assert.strictEqual(
      renderTemplate('{{ v | dateformat }}', { v: d }),
      '2026-01-19 15:04:05',
    );

    // Dayjs-like escaping: keep content inside brackets as literal
    assert.strictEqual(
      renderTemplate("{{ v | dateformat('YYYY[Y]MM[M]DD[D]') }}", { v: d }),
      '2026Y01M19D',
    );
  });

  it('dateformat uses own fallback when dayjs is not available', function () {
    refs.dayjs = null;

    const d = new Date(2026, 0, 19, 15, 4, 5);

    assert.strictEqual(
      renderTemplate("{{ v | dateformat('YYYY-MM-DD HH:mm:ss MMM') }}", { v: d }),
      '2026-01-19 15:04:05 011', // MMM is MM and M concatenated in fallback
    );
  });

  it('dateformat uses dayjs when available (and supports tokens beyond the fallback subset)', function () {
    refs.dayjs = dayjs;

    const d = new Date(2026, 0, 19, 15, 4, 5);

    // `MMM` is supported by dayjs, but the fallback subset intentionally does not.
    // This asserts we actually routed through dayjs.
    assert.strictEqual(
      renderTemplate("{{ v | dateformat('MMM') }}", { v: d }),
      'Jan',
    );
  });

  it('dateformat fallback matches dayjs for the supported token subset (Date, string, number)', function () {
    const d = new Date(2026, 0, 19, 15, 4, 5);
    const asString = d.toISOString();
    const asNumber = d.getTime();

    const fmt = 'YYYY-MM-DD HH:mm:ss Z A a [lit]';
    const tpl = "{{ v | dateformat('" + fmt + "') }}";

    refs.dayjs = null;
    const fallbackDate = renderTemplate(tpl, { v: d });
    const fallbackString = renderTemplate(tpl, { v: asString });
    const fallbackNumber = renderTemplate(tpl, { v: asNumber });

    refs.dayjs = dayjs;
    const dayjsDate = renderTemplate(tpl, { v: d });
    const dayjsString = renderTemplate(tpl, { v: asString });
    const dayjsNumber = renderTemplate(tpl, { v: asNumber });

    assert.strictEqual(fallbackDate, dayjsDate);
    assert.strictEqual(fallbackString, dayjsString);
    assert.strictEqual(fallbackNumber, dayjsNumber);
  });

  it('dateformat returns empty string for invalid input even when dayjs is available', function () {
    refs.dayjs = dayjs;
    assert.strictEqual(renderTemplate("{{ v | dateformat('YYYY') }}", { v: 'not-a-date' }), '');
  });

  it('dateformat returns empty string for invalid or empty input', function () {
    assert.strictEqual(renderTemplate("{{ v | dateformat('YYYY') }}", { v: null }), '');
    assert.strictEqual(renderTemplate("{{ v | dateformat('YYYY') }}", { v: undefined }), '');
    assert.strictEqual(renderTemplate("{{ v | dateformat('YYYY') }}", { v: 'not-a-date' }), '');
  });

  it('supports dynamically registered custom filters', function () {
    const toStr = (val: unknown): string => {
      if (val === undefined || val === null) return '';
      if (typeof val === 'string') return val;
      if (val && typeof val === 'object') return JSON.stringify(val) ?? '';
      return String(val as unknown);
    };

    registerTemplateFilter('brackets', (val) => {
      return '[' + toStr(val) + ']';
    });

    registerTemplateFilter('prefix', (val, args) => {
      const p = (Array.isArray(args) && typeof args[0] === 'string') ? args[0] : '';
      return p + toStr(val);
    });

    assert.strictEqual(renderTemplate('{{ name | brackets }}', { name: 'Ada' }), '[Ada]');
    assert.strictEqual(renderTemplate("{{ name | prefix('Hi ') }}", { name: 'Ada' }), 'Hi Ada');
  });

  it('rejects invalid filter names on registration', function () {
    assert.throws(() => {
      registerTemplateFilter('123invalid', (v) => String(v));
    }, TypeError, 'Invalid filter name: 123invalid');

    assert.throws(() => {
      registerTemplateFilter('has-dash', (v) => String(v));
    }, TypeError, 'Invalid filter name: has-dash');

    assert.throws(() => {
      registerTemplateFilter('with space', (v) => String(v));
    }, TypeError, 'Invalid filter name: with space');

    assert.throws(() => {
      registerTemplateFilter('valid_name!', (v) => String(v));
    }, TypeError, 'Invalid filter name: valid_name!');
  });

  it('rejects non-function filter handlers on registration', function () {
    assert.throws(() => {
      // @ts-expect-error Testing invalid input
      registerTemplateFilter('notAFunction', 42);
    }, TypeError, 'Filter handler must be a function');
  });
});
