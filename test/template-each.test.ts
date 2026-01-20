import { assert } from 'chai';

import {
  renderTemplate,
} from '../src/index.js';

import { ensureDom } from './test-utils/dom.js';

describe('template rendering / each', function () {
  before(function () {
    ensureDom();
  });

  describe('newline trimming after control tokens', function () {
    it('removes one newline after each/endeach tags', function () {
      const tpl = '{% each items as it %}\n[{{ it }}]\n{% endeach %}\nX';
      assert.strictEqual(renderTemplate(tpl, { items: [ 1, 2 ] }), '[1]\n[2]\nX');
    });

    it('does not remove non-newline whitespace after %}', function () {
      const tpl = '{% each items as it %} [{{ it }}]{% endeach %}';
      assert.strictEqual(renderTemplate(tpl, { items: [ 'a', 'b' ] }), ' [a] [b]');
    });
  });

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

  it("supports index variable with 'as var, i'", function () {
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
