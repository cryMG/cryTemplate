import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { assert } from 'chai';
import { createRequire } from 'node:module';

interface BrowserIifeExports {
  escapeHtml: (input: string) => string;
  unescapeHtml: (input: string) => string;
  renderTemplate: (tpl: string, data?: Record<string, unknown>) => string;
  registerTemplateFilter?: (name: string, handler: unknown) => void;
}

describe('package entrypoints', function () {

  /*
   * ESM
   */
  it('can be imported as ESM via package exports', async function () {
    const esmMod = await import('crytemplate');

    assert.isFunction(esmMod.escapeHtml);
    assert.isFunction(esmMod.unescapeHtml);
    assert.isFunction(esmMod.renderTemplate);

    const out = esmMod.renderTemplate('A{{ x }}B', { x: '<b>hi</b>' });
    assert.strictEqual(out, 'A&lt;b&gt;hi&lt;/b&gt;B');
  });

  /*
   * CJS
   */
  it('can be required as CJS via package exports', function () {
    const require = createRequire(import.meta.url);
    const cjsMod = require('crytemplate') as typeof import('crytemplate');

    assert.isFunction(cjsMod.escapeHtml);
    assert.isFunction(cjsMod.unescapeHtml);
    assert.isFunction(cjsMod.renderTemplate);

    const out = cjsMod.renderTemplate('A{{ x }}B', { x: '<b>hi</b>' });
    assert.strictEqual(out, 'A&lt;b&gt;hi&lt;/b&gt;B');
  });

  /*
   * browser bundles
   */
  const browserDir = path.resolve(process.cwd(), 'dist', 'browser');

  function loadIife (filename: string): BrowserIifeExports {
    const filePath = path.join(browserDir, filename);
    const code = fs.readFileSync(filePath, 'utf8');

    const context: Record<string, unknown> = { console };
    context.globalThis = context;
    context.window = context;
    context.self = context;

    vm.runInNewContext(code, context, { filename: filePath });

    const exportsObj = context.cryTemplate;
    assert.isObject(exportsObj);
    return exportsObj as BrowserIifeExports;
  }

  it('browser bundle (IIFE) exposes cryTemplate via crytemplate.js', function () {
    const mod = loadIife('crytemplate.js');

    assert.isObject(mod);
    assert.isFunction(mod.escapeHtml);
    assert.isFunction(mod.unescapeHtml);
    assert.isFunction(mod.renderTemplate);

    const out = mod.renderTemplate('A{{ x }}B', { x: '<b>hi</b>' });
    assert.strictEqual(out, 'A&lt;b&gt;hi&lt;/b&gt;B');
  });

  it('browser bundle (IIFE) exposes cryTemplate via crytemplate.min.js', function () {
    const mod = loadIife('crytemplate.min.js');

    assert.isObject(mod);
    assert.isFunction(mod.escapeHtml);
    assert.isFunction(mod.unescapeHtml);
    assert.isFunction(mod.renderTemplate);

    const out = mod.renderTemplate('A{{ x }}B', { x: '<b>hi</b>' });
    assert.strictEqual(out, 'A&lt;b&gt;hi&lt;/b&gt;B');
  });
});
