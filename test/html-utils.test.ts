import { assert } from 'chai';

import {
  escapeHtml,
  unescapeHtml,
} from '../src/html-utils.js';

describe('html escaping', function () {
  describe('escapeHtml', function () {
    it('should escape basic HTML tags and quotes', function () {
      const input = '<script>alert("XSS")</script>';
      const result = escapeHtml(input);
      assert.strictEqual(result, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should escape comparison and ampersand characters', function () {
      const input = '5 > 3 & 2 < 4';
      const result = escapeHtml(input);
      assert.strictEqual(result, '5 &gt; 3 &amp; 2 &lt; 4');
    });

    it('should handle empty string and unicode input', function () {
      assert.strictEqual(escapeHtml(''), '');
      assert.strictEqual(escapeHtml('äöü 😀'), 'äöü 😀');
    });

    it('should escape single quotes', function () {
      assert.strictEqual(escapeHtml("'"), '&#39;');
      assert.strictEqual(escapeHtml("O'Reilly"), 'O&#39;Reilly');
    });
  });

  describe('unescapeHtml', function () {
    it('should unescape common HTML entities', function () {
      const input = '&lt;div&gt;Hello &amp; &quot;World&quot;&lt;/div&gt;';
      const result = unescapeHtml(input);
      assert.strictEqual(result, '<div>Hello & "World"</div>');
    });

    it('should be inverse of escapeHtml for typical inputs', function () {
      const original = '<p class="x">Me & You</p>';
      const escaped = escapeHtml(original);
      const unescaped = unescapeHtml(escaped);
      assert.strictEqual(unescaped, original);
    });

    it('should handle empty string and specific entities', function () {
      assert.strictEqual(unescapeHtml(''), '');
      assert.strictEqual(unescapeHtml('&quot;&amp;&#39;'), "\"&'");
    });

    it('should leave plain strings unchanged', function () {
      assert.strictEqual(unescapeHtml('plain'), 'plain');
    });
  });
});
