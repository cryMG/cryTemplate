import { assert } from 'chai';

import {
  renderTemplate,
} from '../src/index.js';

describe('template rendering / whitespace control', function () {
  it('trims all whitespace before/after interpolation via {{- ... -}}', function () {
    const tpl = 'A \n  {{- name -}}  \nB';
    assert.strictEqual(renderTemplate(tpl, { name: 'X' }), 'AXB');
  });

  it('supports raw interpolation combined with trim markers via {{-= ... -}}', function () {
    const tpl = 'v= {{-= html -}} \nend';
    assert.strictEqual(renderTemplate(tpl, { html: '<em>ok</em>' }), 'v=<em>ok</em>end');
  });

  it('supports raw interpolation with newline-preserving trimming via {{~= ... ~}}', function () {
    const tpl = 'A\n  {{~= html ~}}  \nB';
    assert.strictEqual(renderTemplate(tpl, { html: '<em>ok</em>' }), 'A\n<em>ok</em>\nB');
  });

  it('supports mixed forms like {{- ... }} (trim left only)', function () {
    const tpl = 'A  {{- name }} B';
    assert.strictEqual(renderTemplate(tpl, { name: 'X' }), 'AX B');
  });

  it('supports trim right only via {{= ... -}}', function () {
    const tpl = 'A{{= name -}}   B';
    assert.strictEqual(renderTemplate(tpl, { name: 'X' }), 'AXB');
  });

  it('trims whitespace but keeps newlines via {{~ ... ~}}', function () {
    const tpl = 'A\n  {{~ name ~}}  \nB';
    assert.strictEqual(renderTemplate(tpl, { name: 'X' }), 'A\nX\nB');
  });

  it('supports back-to-back trimmed interpolations', function () {
    const tpl = 'A  {{- a -}}  {{- b -}}  B';
    assert.strictEqual(renderTemplate(tpl, { a: '1', b: '2' }), 'A12B');
  });

  it('trims around comment blocks {#- ... -#}', function () {
    const tpl = 'A  {#- ignored -#}  B';
    assert.strictEqual(renderTemplate(tpl, {}), 'AB');
  });

  it('keeps newlines when trimming around comments via {#~ ... ~#}', function () {
    const tpl = 'A\n  {#~ ignored ~#}  \nB';
    assert.strictEqual(renderTemplate(tpl, {}), 'A\n\nB');
  });

  it('keeps newlines for control tags when using ~%} (disables implicit newline skipping)', function () {
    const tpl = 'X{%~ if a ~%}\nY{%~ endif ~%}\nZ';
    assert.strictEqual(renderTemplate(tpl, { a: true }), 'X\nY\nZ');
  });

  it('removes newlines for control tags when using -%}', function () {
    const tpl = 'X{% if a -%}\nY{% endif -%}\nZ';
    assert.strictEqual(renderTemplate(tpl, { a: true }), 'XYZ');
  });

  it('does not trim when an interpolation is preserved as literal text (fail-safe)', function () {
    const tpl = 'A  {{- __tplPwn() -}}  B';
    assert.strictEqual(renderTemplate(tpl, {}), 'A  {{- __tplPwn() -}}  B');
  });

  it('does not trim when a misplaced control token is preserved as literal text (fail-safe)', function () {
    const tpl = 'A  {%- endif -%}  B';
    assert.strictEqual(renderTemplate(tpl, {}), 'A  {%- endif -%}  B');
  });
});
