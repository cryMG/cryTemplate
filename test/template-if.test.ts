import { assert } from 'chai';

import {
  renderTemplate,
} from '../src/index.js';

import { ensureDom } from './test-utils/dom.js';

describe('template rendering / if-elseif-else', function () {
  before(function () {
    ensureDom();
  });

  describe('newline trimming after control tokens', function () {
    it('removes one newline after %} (LF)', function () {
      const tpl = '{% if a %}\nA\n{% endif %}\nB';
      assert.strictEqual(renderTemplate(tpl, { a: 1 }), 'A\nB');
      assert.strictEqual(renderTemplate(tpl, { a: 0 }), 'B');
    });

    it('removes one newline after %} (CRLF)', function () {
      const tpl = '{% if a %}\r\nA\r\n{% endif %}\r\nB';
      assert.strictEqual(renderTemplate(tpl, { a: 1 }), 'A\r\nB');
      assert.strictEqual(renderTemplate(tpl, { a: 0 }), 'B');
    });

    it('removes only a single newline when multiple follow', function () {
      const tpl = '{% if a %}\n\nA{% endif %}';
      assert.strictEqual(renderTemplate(tpl, { a: 1 }), '\nA');
    });
  });

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
