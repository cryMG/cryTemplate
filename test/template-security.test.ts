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
        const tpl2 = `[[{{= ${key} }}]]`;
        const out1 = renderTemplate(tpl1, { [key]: val });
        const out2 = renderTemplate(tpl2, { [key]: val });
        const escaped = escapeHtml(val);
        assert.strictEqual(out1, `[[${escaped}]]`);
        assert.strictEqual(out2, `[[${escaped}]]`);
        // ensure no raw specials remain
        assert.notInclude(out1, '<');
        assert.notInclude(out1, '>');
        assert.notInclude(out1, '"');
        assert.notInclude(out1, "'");
        assert.notInclude(out2, '<');
        assert.notInclude(out2, '>');
        assert.notInclude(out2, '"');
        assert.notInclude(out2, "'");
      }
    });

    it('raw insertion matches the original string (no escaping)', function () {
      for (let i = 0; i < 50; i++) {
        const key = 'r' + i;
        const val = randStr(25);
        const tpl = `PRE{{- ${key} }}POST`;
        const out = renderTemplate(tpl, { [key]: val });
        assert.strictEqual(out, `PRE${String(val)}POST`);
      }
    });

    it('should not throw on mixed/random templates', function () {
      const tokens = [ '{{', '{{=', '{{-', '}}' ];
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

    it('escaped variant {{= key }} matches default', function () {
      const html = renderTemplate('A{{= x }}B', { x: '<em>hi"</em>' });
      assert.strictEqual(html, 'A&lt;em&gt;hi&quot;&lt;/em&gt;B');
    });

    it('raw variant {{- key }} inserts as-is', function () {
      const html = renderTemplate('A{{- x }}B', { x: '<em>ok</em>' });
      assert.strictEqual(html, 'A<em>ok</em>B');
    });

    it('raw interpolation still applies fallback', function () {
      const html = renderTemplate('{{- html || "<em>x</em>" }}', { html: '' });
      assert.strictEqual(html, '<em>x</em>');
    });

    it('raw injection: no escaping', function () {
      const tpl = '{{- html }}';
      assert.strictEqual(renderTemplate(tpl, { html: '<span x="y">z</span>' }), '<span x="y">z</span>');
    });
  });
});
