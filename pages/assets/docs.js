/* global cryTemplate, hljs */

function highlightAll () {
  try {
    if (typeof hljs?.highlightElement !== 'function') return;

    for (const codeEl of document.querySelectorAll('pre code')) {
      const isCrytpl = codeEl.classList.contains('language-crytpl') || codeEl.classList.contains('language-crytemplate');
      try {
        hljs.highlightElement(codeEl);
      } catch {
        // For crytpl: don't fall back to auto-detect (would highlight plain text too).
        if (isCrytpl) continue;

        // For other blocks: fall back to auto-detect.
        try {
          for (const cls of Array.from(codeEl.classList)) {
            if (cls.startsWith('language-')) codeEl.classList.remove(cls);
          }
          hljs.highlightElement(codeEl);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore highlighting errors
  }
}

function textFromCodeBlock (root, selector) {
  const node = root.querySelector(selector);
  if (!node) return '';
  return (node.textContent ?? '').trim();
}

function renderExample (exampleEl) {
  const tpl = textFromCodeBlock(exampleEl, '[data-tpl] code');
  const dataRaw = textFromCodeBlock(exampleEl, '[data-data] code');
  const outEl = exampleEl.querySelector('[data-out]');
  if (!outEl) return;

  let data;
  try {
    data = JSON.parse(dataRaw || '{}');
  } catch (err) {
    outEl.textContent = `Data JSON error: ${err?.message ?? String(err)}`;
    return;
  }

  try {
    outEl.textContent = cryTemplate.renderTemplate(tpl, data);
  } catch (err) {
    outEl.textContent = `Render error: ${err?.message ?? String(err)}`;
  }
}

for (const exampleEl of document.querySelectorAll('[data-example]')) {
  const runBtn = exampleEl.querySelector('[data-run]');
  if (runBtn) {
    runBtn.addEventListener('click', () => renderExample(exampleEl));
  }
}

highlightAll();
