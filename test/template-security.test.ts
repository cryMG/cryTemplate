import { assert } from 'chai';

import {
  renderTemplate,
} from '../src/index.js';

import {
  escapeHtml,
} from '../src/html-utils.js';

import { ensureDom } from './test-utils/dom.js';

describe('template rendering / security', function () {
  before(function () {
    ensureDom();
  });

  describe('no code execution', function () {
    it('does not evaluate expressions or function calls inside interpolations', function () {
      let executed = false;
      (globalThis as unknown as { __tplPwn?: () => string }).__tplPwn = () => {
        executed = true;
        return 'PWN';
      };

      const out = renderTemplate('A{{ __tplPwn() }}B', {});
      // Unsupported interpolation syntax is preserved literally.
      assert.strictEqual(out, 'A{{ __tplPwn() }}B');
      assert.isFalse(executed);
    });

    it('does not evaluate expressions or function calls inside if conditions', function () {
      let executed = false;
      (globalThis as unknown as { __tplPwnIf?: () => boolean }).__tplPwnIf = () => {
        executed = true;
        return true;
      };

      const tpl = '{% if __tplPwnIf() %}YES{% else %}NO{% endif %}';
      const out = renderTemplate(tpl, {});

      // Unsupported syntax must not execute code; it should not match truthy values.
      assert.strictEqual(out, 'NO');
      assert.isFalse(executed);
    });

    it('does not execute getters while resolving keys', function () {
      let getterExecuted = false;
      const data: Record<string, unknown> = {};
      Object.defineProperty(data, 'x', {
        enumerable: true,
        get () {
          getterExecuted = true;
          return 'X';
        },
      });

      const out = renderTemplate('v={{ x }}', data);
      // Accessors are ignored; treat as unresolved.
      assert.strictEqual(out, 'v=');
      assert.isFalse(getterExecuted);
    });

    it('does not resolve values from the prototype chain', function () {
      const proto = { secret: 'S' };
      const data = Object.create(proto) as Record<string, unknown>;
      const out = renderTemplate('v={{ secret }}', data);
      assert.strictEqual(out, 'v=');
    });

    it('does not execute code via filter arguments', function () {
      let executed = false;
      (globalThis as unknown as { __tplPwnArg?: () => string }).__tplPwnArg = () => {
        executed = true;
        return 'X';
      };

      // Filter args only accept literals; function-call-like tokens must not be executed.
      const out = renderTemplate("{{ v | replace(__tplPwnArg(), 'y') }}", { v: 'abc' });
      assert.strictEqual(out, 'abc');
      assert.isFalse(executed);
    });

    it('does not execute code by attempting to invoke filters from the template', function () {
      let executed = false;
      (globalThis as unknown as { __tplPwnFilter?: () => string }).__tplPwnFilter = () => {
        executed = true;
        return 'PWN';
      };

      // Even though the filter syntax looks like a call, it can only call registered filters by name.
      // Unknown filters are ignored and must not execute any global function.
      const out = renderTemplate('{{ v | __tplPwnFilter() }}', { v: 'abc' });
      assert.strictEqual(out, 'abc');
      assert.isFalse(executed);
    });
  });

  describe('fuzz/property-based', function () {
    function randStr (len: number): string {
      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>&\"'{}_- \n\t\u00e4\u00f6\u00fc\u20ac";
      let s = '';
      for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
      return s;
    }

    it('escaped placeholders never leak raw HTML specials', function () {
      for (let i = 0; i < 50; i++) {
        const key = 'k' + i;
        const val = randStr(20);
        const tpl1 = `[[{{ ${key} }}]]`;
        const out1 = renderTemplate(tpl1, { [key]: val });
        const escaped = escapeHtml(val);
        assert.strictEqual(out1, `[[${escaped}]]`);
        // ensure no raw specials remain
        assert.notInclude(out1, '<');
        assert.notInclude(out1, '>');
        assert.notInclude(out1, '"');
        assert.notInclude(out1, "'");
      }
    });

    it('raw insertion matches the original string (no escaping)', function () {
      for (let i = 0; i < 50; i++) {
        const key = 'r' + i;
        const val = randStr(25);
        const tpl = `PRE{{= ${key} }}POST`;
        const out = renderTemplate(tpl, { [key]: val });
        assert.strictEqual(out, `PRE${String(val)}POST`);
      }
    });

    it('should not throw on mixed/random templates', function () {
      const tokens = [ '{{', '{{=', '}}' ];
      for (let i = 0; i < 30; i++) {
        let tpl = '';
        for (let j = 0; j < 10; j++) {
          const t = tokens[Math.floor(Math.random() * tokens.length)];
          if (t === '}}') {
            tpl += t;
          } else {
            tpl += `${t} k${j} }}`;
          }
        }
        // Include some plain text too
        tpl = 'X-' + tpl + '-Y';
        const data: Record<string, unknown> = {};
        for (let j = 0; j < 10; j++) {
          data[`k${j}`] = randStr(10);
        }
        let out = '';
        assert.doesNotThrow(() => {
          out = renderTemplate(tpl, data);
        });
        assert.isString(out);
      }
    });
  });

  describe('interpolation', function () {
    it('escapes by default', function () {
      const html = renderTemplate('A{{ x }}B', { x: '<em>hi"</em>' });
      assert.strictEqual(html, 'A&lt;em&gt;hi&quot;&lt;/em&gt;B');
    });

    it('raw variant {{= key }} inserts as-is', function () {
      const html = renderTemplate('A{{= x }}B', { x: '<em>hi"</em>' });
      assert.strictEqual(html, 'A<em>hi"</em>B');
    });

    it('raw interpolation still applies fallback', function () {
      const html = renderTemplate('{{= html || "<em>x</em>" }}', { html: '' });
      assert.strictEqual(html, '<em>x</em>');
    });

    it('raw injection: no escaping', function () {
      const tpl = '{{= html }}';
      assert.strictEqual(renderTemplate(tpl, { html: '<span x="y">z</span>' }), '<span x="y">z</span>');
    });
  });
});
