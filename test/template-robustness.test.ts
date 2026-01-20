import { assert } from 'chai';

import {
  renderTemplate,
} from '../src/index.js';

import { ensureDom } from './test-utils/dom.js';

describe('template rendering / robustness', function () {
  before(function () {
    ensureDom();
  });

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

  it('preserves text outside tokens', function () {
    const tpl = ' Hello {{x}} world ';
    assert.strictEqual(renderTemplate(tpl, { x: 'wide' }), ' Hello wide world ');
  });

  it('multiple tokens back-to-back', function () {
    const tpl = '{{a}}{{b}}{{c}}';
    assert.strictEqual(renderTemplate(tpl, { a: '1', b: '2', c: '3' }), '123');
  });

  describe('comments', function () {
    it('omits inline comment blocks {# ... #}', function () {
      const tpl = 'A{# this is ignored #}B';
      assert.strictEqual(renderTemplate(tpl, {}), 'AB');
    });

    it('omits multiline comment blocks {# ... #}', function () {
      const tpl = 'A{#\nthis\nis\nignored\n#}B';
      assert.strictEqual(renderTemplate(tpl, {}), 'AB');
    });

    it('comment content may include brace-like text safely', function () {
      const tpl = 'X{# tricky #} braces #} and text #}Y';
      // Only the comment block is removed; the rest remains as literal text
      assert.strictEqual(renderTemplate(tpl, {}), 'X braces #} and text #}Y');
    });

    it('comment content may include token-like text safely', function () {
      const tpl = 'A{# {% if x %} {{ name }} {% end %} #}B';
      // Only the comment block is removed; the rest remains as literal text
      assert.strictEqual(renderTemplate(tpl, { x: 1, name: 'Z' }), 'AB');
    });
  });
});
