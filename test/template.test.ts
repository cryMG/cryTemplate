import { assert } from 'chai';
import { JSDOM } from 'jsdom';

import {
  renderTemplate,
} from '../src/index.js';

import {
  escapeHtml,
} from '../src/html-utils.js';

describe('template rendering', function () {
  before(function () {
    // Ensure DOM exists for potential helpers elsewhere (escapeHtml is pure, but keep consistent setup)
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      const dom = new JSDOM('<!doctype html><html><body></body></html>');
      (global as unknown as { window: Window }).window = dom.window as unknown as Window;
      (global as unknown as { document: Document }).document = dom.window.document;
    }
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
        assert.notInclude(out1, '\'');
        assert.notInclude(out2, '<');
        assert.notInclude(out2, '>');
        assert.notInclude(out2, '"');
        assert.notInclude(out2, '\'');
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

    it('unknown keys resolve to empty string', function () {
      const html = renderTemplate('A{{ y }}B', {});
      assert.strictEqual(html, 'AB');
    });

    it('null values resolve to empty string', function () {
      const html = renderTemplate('A{{ y }}B', { y: null });
      assert.strictEqual(html, 'AB');
    });

    it('stringifies non-strings', function () {
      const html = renderTemplate('n={{ n }}, b={{ b }}, o={{ o }}', { n: 12, b: false, o: { a: 1 } });
      assert.strictEqual(html, 'n=12, b=false, o=[object Object]');
    });

    it('supports dot-paths', function () {
      const html = renderTemplate('A{{ user.name.first }}B', { user: { name: { first: 'Ada' } } });
      assert.strictEqual(html, 'AAdaB');
    });

    it('whitespace tolerance inside braces', function () {
      const html = renderTemplate('X{{   a  }}Y{{b}}Z', { a: '1', b: '2' });
      assert.strictEqual(html, 'X1Y2Z');
    });

    it('fallback with literal using ||', function () {
      const html1 = renderTemplate("icon={{ sub.icon || 'list' }}", { sub: { icon: '' } });
      const html2 = renderTemplate("icon={{ sub.icon || 'list' }}", { sub: { icon: 'star' } });
      assert.strictEqual(html1, 'icon=list');
      assert.strictEqual(html2, 'icon=star');
    });

    it('fallback with key using ||', function () {
      const html = renderTemplate('v={{ a || b.value }}', { a: '', b: { value: 'x' } });
      assert.strictEqual(html, 'v=x');
    });

    it('fallback considers empty array/object/string as empty but keeps 0/false', function () {
      assert.strictEqual(renderTemplate('x={{ val || "d" }}', { val: '' }), 'x=d');
      assert.strictEqual(renderTemplate('x={{ val || "d" }}', { val: [] }), 'x=d');
      assert.strictEqual(renderTemplate('x={{ val || "d" }}', { val: {} }), 'x=d');
      assert.strictEqual(renderTemplate('x={{ val || "d" }}', { val: 0 }), 'x=0');
      assert.strictEqual(renderTemplate('x={{ val || "d" }}', { val: false }), 'x=false');
    });

    it('raw interpolation still applies fallback', function () {
      const html = renderTemplate('{{- html || "<em>x</em>" }}', { html: '' });
      assert.strictEqual(html, '<em>x</em>');
    });

    it('null-coalescing ?? uses fallback only for null/undefined', function () {
      assert.strictEqual(renderTemplate('x={{ v ?? "d" }}', { v: null }), 'x=d');
      assert.strictEqual(renderTemplate('x={{ v ?? "d" }}', { v: undefined }), 'x=d');
      assert.strictEqual(renderTemplate('x={{ v ?? "d" }}', { v: '' }), 'x=');
      assert.strictEqual(renderTemplate('x={{ v ?? "d" }}', { v: 0 }), 'x=0');
      assert.strictEqual(renderTemplate('x={{ v ?? "d" }}', { v: false }), 'x=false');
    });

    it('multiple fallbacks chain with || and ??', function () {
      const tpl = "x={{ a || b ?? c || 'z' }}";
      // a empty string -> use b if not nullish (b undefined) -> fall back to c if not empty (c empty array) -> use 'z'
      assert.strictEqual(renderTemplate(tpl, { a: '', b: undefined, c: [] }), 'x=z');
      // a empty -> b null -> c object with key -> c wins (not empty)
      assert.strictEqual(renderTemplate(tpl, { a: '', b: null, c: { k: 1 } }), 'x=[object Object]');
      // a string non-empty -> a wins
      assert.strictEqual(renderTemplate(tpl, { a: 'A', b: 'B', c: 'C' }), 'x=A');
      // a empty -> b defined (0) -> for ?? b wins
      assert.strictEqual(renderTemplate(tpl, { a: '', b: 0, c: 'C' }), 'x=0');
    });
  });

  describe('if / elseif / else', function () {
    it('basic if true renders consequent', function () {
      const tpl = '{% if a %}A{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { a: 1 }), 'A');
    });

    it('basic if false renders nothing', function () {
      const tpl = '{% if a %}A{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { a: 0 }), '');
    });

    it('if with else renders alternate when false', function () {
      const tpl = '{% if a %}T{% else %}F{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { a: '' }), 'F');
    });

    it('negation with ! and not', function () {
      const t1 = '{% if !a %}X{% endif %}';
      const t2 = '{% if not a %}Y{% endif %}';
      assert.strictEqual(renderTemplate(t1, { a: 0 }), 'X');
      assert.strictEqual(renderTemplate(t2, { a: '' }), 'Y');
    });

    it('elseif selects first matching branch', function () {
      const tpl = '{% if a %}A{% elseif b %}B{% elseif c %}C{% else %}Z{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { a: 0, b: 1, c: 1 }), 'B');
      assert.strictEqual(renderTemplate(tpl, { a: 0, b: 0, c: 'x' }), 'C');
      assert.strictEqual(renderTemplate(tpl, { a: 0, b: 0, c: 0 }), 'Z');
    });

    it('truthiness rules for arrays and objects', function () {
      const tpl = '{% if a %}TA{% else %}FA{% endif %}|{% if o %}TO{% else %}FO{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { a: [], o: {} }), 'FA|FO');
      assert.strictEqual(renderTemplate(tpl, { a: [ 1 ], o: { k: 1 } }), 'TA|TO');
    });

    it('nested if and interpolations', function () {
      const tpl = '{% if user %}Hello {{ user.name }}{% if user.admin %}!{% endif %}{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { user: { name: 'Root', admin: true } }), 'Hello Root!');
      assert.strictEqual(renderTemplate(tpl, { user: { name: 'User', admin: false } }), 'Hello User');
    });

    describe('elseif cascade', function () {
      it('falls through to the first matching elseif and stops', function () {
        const tpl = '{% if a %}A{% elseif b %}B{% elseif c %}C{% elseif d %}D{% else %}Z{% endif %}';
        // a false, b true -> B (stop, evaluate no further elseifs)
        assert.strictEqual(renderTemplate(tpl, { a: 0, b: 1, c: 1, d: 1 }), 'B');
        // a false, b false, c true -> C
        assert.strictEqual(renderTemplate(tpl, { a: '', b: 0, c: 'x', d: 1 }), 'C');
        // a false, b false, c false, d true -> D
        assert.strictEqual(renderTemplate(tpl, { a: null, b: false, c: 0, d: [ 1 ] }), 'D');
        // all false -> else
        assert.strictEqual(renderTemplate(tpl, { a: 0, b: 0, c: 0, d: [] }), 'Z');
      });

      it('supports negated elseif tests', function () {
        const tpl = '{% if a %}A{% elseif !b %}NB{% elseif not c %}NC{% else %}Z{% endif %}';
        // a true -> A
        assert.strictEqual(renderTemplate(tpl, { a: 'x', b: 0, c: 0 }), 'A');
        // a false, !b true -> NB
        assert.strictEqual(renderTemplate(tpl, { a: 0, b: 0, c: 1 }), 'NB');
        // a false, !b false, not c true -> NC
        assert.strictEqual(renderTemplate(tpl, { a: '', b: 'y', c: 0 }), 'NC');
        // all false -> else
        assert.strictEqual(renderTemplate(tpl, { a: 0, b: 1, c: [ 1 ] }), 'Z');
      });
    });

    describe('comparisons in conditions', function () {
      it('compares strings with == and != (quoted)', function () {
        const tpl = "{% if kind == 'foo' %}F{% elseif kind != 'bar' %}NB{% else %}Z{% endif %}";
        assert.strictEqual(renderTemplate(tpl, { kind: 'foo' }), 'F');
        assert.strictEqual(renderTemplate(tpl, { kind: 'baz' }), 'NB');
        assert.strictEqual(renderTemplate(tpl, { kind: 'bar' }), 'Z');
      });

      it('compares numbers with >, <, >=, <=', function () {
        const gt = '{% if n > 10 %}GT{% else %}LE{% endif %}';
        const lt = '{% if n < 5 %}LT{% else %}GE{% endif %}';
        const ge = '{% if n >= 3 %}GE{% else %}LT{% endif %}';
        const le = '{% if n <= 7 %}LE{% else %}GT{% endif %}';
        assert.strictEqual(renderTemplate(gt, { n: 11 }), 'GT');
        assert.strictEqual(renderTemplate(gt, { n: 10 }), 'LE');
        assert.strictEqual(renderTemplate(lt, { n: 4 }), 'LT');
        assert.strictEqual(renderTemplate(lt, { n: 5 }), 'GE');
        assert.strictEqual(renderTemplate(ge, { n: 3 }), 'GE');
        assert.strictEqual(renderTemplate(ge, { n: 2 }), 'LT');
        assert.strictEqual(renderTemplate(le, { n: 7 }), 'LE');
        assert.strictEqual(renderTemplate(le, { n: 8 }), 'GT');
      });

      it('compares booleans and null', function () {
        const tb = '{% if flag == true %}T{% else %}F{% endif %}';
        const fb = '{% if flag != false %}T{% else %}F{% endif %}';
        const nl = '{% if v == null %}N{% else %}X{% endif %}';
        assert.strictEqual(renderTemplate(tb, { flag: true }), 'T');
        assert.strictEqual(renderTemplate(tb, { flag: false }), 'F');
        assert.strictEqual(renderTemplate(fb, { flag: false }), 'F');
        assert.strictEqual(renderTemplate(fb, { flag: true }), 'T');
        assert.strictEqual(renderTemplate(nl, { v: null }), 'N');
        assert.strictEqual(renderTemplate(nl, { v: undefined }), 'N');
        assert.strictEqual(renderTemplate(nl, { v: 0 }), 'X');
      });

      it('RHS may be another key', function () {
        const tpl = '{% if lhs == rhs %}EQ{% elseif lhs > rhs %}GT{% else %}LT{% endif %}';
        assert.strictEqual(renderTemplate(tpl, { lhs: 3, rhs: 3 }), 'EQ');
        assert.strictEqual(renderTemplate(tpl, { lhs: 4, rhs: 3 }), 'GT');
        assert.strictEqual(renderTemplate(tpl, { lhs: 2, rhs: 3 }), 'LT');
      });

      it('handles whitespace and negation with comparisons', function () {
        const tpl = "{% if  val  ==  'x'  %}X{% elseif ! val %}E{% else %}O{% endif %}";
        assert.strictEqual(renderTemplate(tpl, { val: 'x' }), 'X');
        assert.strictEqual(renderTemplate(tpl, { val: '' }), 'E');
        assert.strictEqual(renderTemplate(tpl, { val: 'y' }), 'O');
      });

      it('supports literal-only truthy tests', function () {
        // empty string is falsy
        assert.strictEqual(renderTemplate("{% if '' %}T{% else %}F{% endif %}", {}), 'F');
        // non-empty string is truthy
        assert.strictEqual(renderTemplate("{% if 'x' %}T{% else %}F{% endif %}", {}), 'T');
        // number 0 is falsy; number 1 is truthy
        assert.strictEqual(renderTemplate('{% if 0 %}T{% else %}F{% endif %}', {}), 'F');
        assert.strictEqual(renderTemplate('{% if 1 %}T{% else %}F{% endif %}', {}), 'T');
        // null is falsy; booleans behave as expected
        assert.strictEqual(renderTemplate('{% if null %}T{% else %}F{% endif %}', {}), 'F');
        assert.strictEqual(renderTemplate('{% if false %}T{% else %}F{% endif %}', {}), 'F');
        assert.strictEqual(renderTemplate('{% if true %}T{% else %}F{% endif %}', {}), 'T');
      });

      it('supports literal-to-literal comparisons', function () {
        assert.strictEqual(renderTemplate("{% if 'a' == 'a' %}T{% else %}F{% endif %}", {}), 'T');
        assert.strictEqual(renderTemplate("{% if 'a' != 'b' %}T{% else %}F{% endif %}", {}), 'T');
        assert.strictEqual(renderTemplate('{% if 3 > 2 %}T{% else %}F{% endif %}', {}), 'T');
        assert.strictEqual(renderTemplate('{% if 2 >= 2 %}T{% else %}F{% endif %}', {}), 'T');
        assert.strictEqual(renderTemplate('{% if 1 < 0 %}T{% else %}F{% endif %}', {}), 'F');
      });

      it('supports logical AND and OR', function () {
        const tpl1 = "{% if a == 'x' && b == 'y' %}T{% else %}F{% endif %}";
        assert.strictEqual(renderTemplate(tpl1, { a: 'x', b: 'y' }), 'T');
        assert.strictEqual(renderTemplate(tpl1, { a: 'x', b: 'n' }), 'F');
        const tpl2 = "{% if a == 'x' || b == 'y' %}T{% else %}F{% endif %}";
        assert.strictEqual(renderTemplate(tpl2, { a: 'x', b: 'n' }), 'T');
        assert.strictEqual(renderTemplate(tpl2, { a: 'n', b: 'y' }), 'T');
        assert.strictEqual(renderTemplate(tpl2, { a: 'n', b: 'n' }), 'F');
      });

      it('respects precedence: AND before OR', function () {
        const tpl = '{% if a && b || c %}T{% else %}F{% endif %}';
        // With precedence (a && b) || c
        assert.strictEqual(renderTemplate(tpl, { a: true, b: true, c: false }), 'T');
        assert.strictEqual(renderTemplate(tpl, { a: true, b: false, c: false }), 'F');
        assert.strictEqual(renderTemplate(tpl, { a: false, b: true, c: true }), 'T');
        assert.strictEqual(renderTemplate(tpl, { a: false, b: false, c: false }), 'F');
      });

      it('supports grouping with parentheses', function () {
        const tpl = "{% if (a == 'x' && b == 'y') || (c && !d) %}T{% else %}F{% endif %}";
        assert.strictEqual(renderTemplate(tpl, { a: 'x', b: 'y', c: false, d: false }), 'T');
        assert.strictEqual(renderTemplate(tpl, { a: 'x', b: 'n', c: true, d: false }), 'T');
        assert.strictEqual(renderTemplate(tpl, { a: 'x', b: 'n', c: true, d: true }), 'F');
        assert.strictEqual(renderTemplate(tpl, { a: 'n', b: 'n', c: false, d: false }), 'F');
      });
    });
  });

  describe('each loops', function () {
    it('renders children for each array item', function () {
      const tpl = '{% each items as it %}[{{ it }}]{% endeach %}';
      assert.strictEqual(renderTemplate(tpl, { items: [ 1, 2, 3 ] }), '[1][2][3]');
    });

    it('empty arrays render nothing', function () {
      const tpl = '{% each items as it %}X{% endeach %}';
      assert.strictEqual(renderTemplate(tpl, { items: [] }), '');
    });

    it('loop variable shadows outer scope only inside loop', function () {
      const tpl = 'A={{ it }}|{% each items as it %}({{ it }}){% endeach %}|B={{ it }}';
      assert.strictEqual(renderTemplate(tpl, { it: 'OUT', items: [ 'IN1', 'IN2' ] }), 'A=OUT|(IN1)(IN2)|B=OUT');
    });

    it('dot-path list expression', function () {
      const tpl = '{% each data.items as x %}{{ x }}{% endeach %}';
      assert.strictEqual(renderTemplate(tpl, { data: { items: [ 'a', 'b' ] } }), 'ab');
    });

    it('loop body can contain if/else and interpolations', function () {
      const tpl = '{% each items as it %}{% if it.ok %}{{ it.v }}{% else %}-{% endif %}{% endeach %}';
      const data = { items: [ { ok: true, v: 'A' }, { ok: false, v: 'X' }, { ok: true, v: 'B' } ] };
      assert.strictEqual(renderTemplate(tpl, data), 'A-B');
    });

    it('supports index variable with \'as var, i\'', function () {
      const tpl = '{% each items as it, i %}[{{ i }}:{{ it }}]{% endeach %}';
      const out = renderTemplate(tpl, { items: [ 'a', 'b', 'c' ] });
      assert.strictEqual(out, '[0:a][1:b][2:c]');
    });

    it('index variable shadows only inside loop and does not leak', function () {
      const tpl = 'pre={{ i }}|{% each items as it, i %}({{ i }}){% endeach %}|post={{ i }}';
      const out = renderTemplate(tpl, { i: 'OUT', items: [ 10, 20 ] });
      assert.strictEqual(out, 'pre=OUT|(0)(1)|post=OUT');
    });

    it('iterates objects exposing entry.key and entry.value', function () {
      const tpl = '{% each obj as e %}({{ e.key }}={{ e.value }}){% endeach %}';
      const out = renderTemplate(tpl, { obj: { a: 1, b: 2 } });
      // Object key enumeration preserves insertion order in modern JS engines
      assert.strictEqual(out, '(a=1)(b=2)');
    });

    it('empty object renders nothing', function () {
      const tpl = '{% each obj as e %}X{% endeach %}';
      assert.strictEqual(renderTemplate(tpl, { obj: {} }), '');
    });
  });

  describe('nesting and malformed controls', function () {
    it('supports nested each within if', function () {
      const tpl = '{% if items %}{% each items as it %}[{{ it }}]{% endeach %}{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { items: [ 1, 2 ] }), '[1][2]');
    });

    it('misplaced endif kept as text', function () {
      const tpl = 'A{% endif %}B';
      assert.strictEqual(renderTemplate(tpl, {}), 'A{% endif %}B');
    });

    it('elseif without if kept as text', function () {
      const tpl = 'X{% elseif a %}Y';
      assert.strictEqual(renderTemplate(tpl, { a: 1 }), 'X{% elseif a %}Y');
    });

    it('else without if kept as text', function () {
      const tpl = 'P{% else %}Q';
      assert.strictEqual(renderTemplate(tpl, {}), 'P{% else %}Q');
    });

    it('endeach without each kept as text', function () {
      const tpl = 'U{% endeach %}V';
      assert.strictEqual(renderTemplate(tpl, {}), 'U{% endeach %}V');
    });

    it('unterminated interpolation kept as text chunk', function () {
      const tpl = 'A{{ name B';
      assert.strictEqual(renderTemplate(tpl, { name: 'X' }), 'A{{ name B');
    });

    it('unterminated control kept as text chunk', function () {
      const tpl = 'A{% if a B';
      assert.strictEqual(renderTemplate(tpl, { a: 1 }), 'A{% if a B');
    });
  });

  describe('whitespace and stability', function () {
    it('preserves text outside tokens', function () {
      const tpl = ' Hello {{x}} world ';
      assert.strictEqual(renderTemplate(tpl, { x: 'wide' }), ' Hello wide world ');
    });

    it('multiple tokens back-to-back', function () {
      const tpl = '{{a}}{{b}}{{c}}';
      assert.strictEqual(renderTemplate(tpl, { a: '1', b: '2', c: '3' }), '123');
    });

    it('raw injection: no escaping', function () {
      const tpl = '{{- html }}';
      assert.strictEqual(renderTemplate(tpl, { html: '<span x="y">z</span>' }), '<span x="y">z</span>');
    });
  });

  describe('inline comments', function () {
    it('omits inline comment blocks {%# ... %}', function () {
      const tpl = 'A{%# this is ignored %}B';
      assert.strictEqual(renderTemplate(tpl, {}), 'AB');
    });

    it('comment content may include percent brace text safely', function () {
      const tpl = 'X{%# tricky %} braces %} and text %}Y';
      // Only the comment block is removed; the rest remains as literal text
      assert.strictEqual(renderTemplate(tpl, {}), 'X braces %} and text %}Y');
    });
  });
});
