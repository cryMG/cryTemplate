import { assert } from 'chai';
import { createRequire } from 'node:module';

describe('package entrypoints', function () {

  it('can be imported as ESM via package exports', async function () {
    const esmMod = await import('crytemplate');

    assert.isFunction(esmMod.escapeHtml);
    assert.isFunction(esmMod.unescapeHtml);
    assert.isFunction(esmMod.renderTemplate);

    const out = esmMod.renderTemplate('A{{ x }}B', { x: '<b>hi</b>' });
    assert.strictEqual(out, 'A&lt;b&gt;hi&lt;/b&gt;B');
  });

  it('can be required as CJS via package exports', function () {
    const require = createRequire(import.meta.url);
    const cjsMod = require('crytemplate') as typeof import('crytemplate');

    assert.isFunction(cjsMod.escapeHtml);
    assert.isFunction(cjsMod.unescapeHtml);
    assert.isFunction(cjsMod.renderTemplate);

    const out = cjsMod.renderTemplate('A{{ x }}B', { x: '<b>hi</b>' });
    assert.strictEqual(out, 'A&lt;b&gt;hi&lt;/b&gt;B');
  });
});
