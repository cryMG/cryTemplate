import { assert } from 'chai';

import {
  renderTemplate,
} from '../src/index.js';

import { ensureDom } from './test-utils/dom.js';

describe('template rendering / interpolation', function () {
  before(function () {
    ensureDom();
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
