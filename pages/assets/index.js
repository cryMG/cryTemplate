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

function el (id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

function debounce (fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => {
      t = null;
      fn(...args);
    }, waitMs);
  };
}

const examples = {
  hello: {
    tpl: "Hello {{ name | trim | upper }}!\n\nToday: {{ createdAt | dateformat('YYYY-MM-DD') }}",
    data: {
      name: '  Alex  ',
      createdAt: '2026-01-19T12:00:00Z',
    },
  },
  escape: {
    tpl: "Escaped (default): {{ html }}\n\nRaw (opt-in): {{- html }}",
    data: {
      html: '<strong>Trusted?</strong> <em>Escape-by-default</em> & <script>alert(1)</script>',
    },
  },
  comments: {
    tpl: [
      'Hello {{ name }}!',
      '',
      '{# This is a comment. It will not render. #}',
      '',
      '{#',
      '  Comments can span',
      '  multiple lines.',
      '#}',
      '',
      'User email: {{ user.email || "(missing)" }}',
    ].join('\n'),
    data: {
      name: 'Alex',
      user: {
        email: 'alex@example.com',
      },
    },
  },
  dotpath: {
    tpl: [
      'Profile:',
      'Hello {{ user.profile.firstName | trim }} {{ user.profile.lastName | upper }}!',
      'Role: {{ user.role || "(none)" }}',
      'City: {{ user.address.city || "(unknown)" }}',
      "Member since: {{ user.createdAt | dateformat('YYYY-MM') }}",
    ].join('\n'),
    data: {
      user: {
        role: 'editor',
        createdAt: '2024-10-03T10:00:00Z',
        profile: {
          firstName: '  Alex  ',
          lastName: 'Miller',
        },
        address: {
          city: 'Berlin',
        },
      },
    },
  },
  report: {
    tpl: [
      'Invoice {{ invoice.id }}',
      'Customer: {{ customer.name }}',
      "Date: {{ invoice.date | dateformat('YYYY-MM-DD') }}",
      '',
      'Items:',
      '{% each lines as line %}',
      '- {{ line.name | trim }}  x{{ line.qty ?? 1 }}',
      "  Unit:  {{ line.unitPrice | number(2, ',', '.') }}",
      "  Total: {{ line.total | number(2, ',', '.') }}",
      '{% endeach %}',
      '',
      "Subtotal: {{ totals.subtotal | number(2, ',', '.') }}",
      "VAT ({{ totals.vatRate }}%): {{ totals.vat | number(2, ',', '.') }}",
      "Total: {{ totals.total | number(2, ',', '.') }}",
    ].join('\n'),
    data: {
      invoice: {
        id: 'INV-2026-001',
        date: '2026-01-19T12:00:00Z',
      },
      customer: {
        name: 'Example GmbH',
      },
      lines: [
        { name: '  Consulting  ', qty: 3, unitPrice: 120, total: 360 },
        { name: 'Implementation', qty: 1, unitPrice: 450, total: 450 },
      ],
      totals: {
        subtotal: 810,
        vatRate: 19,
        vat: 153.9,
        total: 963.9,
      },
    },
  },
  if: {
    tpl: [
      '{% if user.admin %}',
      'Admin: {{ user.name }}',
      '{% elseif user.moderator %}',
      'Moderator: {{ user.name }}',
      '{% else %}',
      'User: {{ user.name || user.email || "anonymous" }}',
      '{% endif %}',
    ].join('\n'),
    data: {
      user: {
        name: 'Sam',
        email: 'sam@example.com',
        admin: false,
        moderator: true,
      },
    },
  },
  each: {
    tpl: [
      'Shopping list:',
      '{% each items as item %}',
      '- {{ item.name | trim }} (x{{ item.qty ?? 1 }})',
      '{% endeach %}',
      '',
      'Total items: {{ itemsCount }}',
    ].join('\n'),
    data: {
      items: [
        { name: '  Coffee  ', qty: 2 },
        { name: 'Tea', qty: 1 },
        { name: 'Sugar', qty: null },
      ],
      itemsCount: 3,
    },
  },
  fallbacks: {
    tpl: [
      'Fallback operators:',
      '',
      'Empty string:',
      "- || (empty-ish): '{{ emptyStr || 'fallback' }}'",
      "- ?? (nullish):   '{{ emptyStr ?? 'fallback' }}'",
      '',
      'Null:',
      "- || (empty-ish): '{{ nullVal || 'fallback' }}'",
      "- ?? (nullish):   '{{ nullVal ?? 'fallback' }}'",
      '',
      'Zero:',
      "- || (empty-ish): '{{ zero || 'fallback' }}'",
      "- ?? (nullish):   '{{ zero ?? 'fallback' }}'",
    ].join('\n'),
    data: {
      emptyStr: '',
      nullVal: null,
      zero: 0,
    },
  },
  filters: {
    tpl: [
      'Filter recipes:',
      '',
      "Slug: {{ title | trim | lower | replace(' ', '-') }}",
      'Search URL: https://example.com/search?q={{ query | urlencode }}',
      'Pretty JSON: {{ user | json }}',
      '',
      "Price (German format): {{ price | number(2, ',', '.') }} €",
    ].join('\n'),
    data: {
      title: '  Hello World  ',
      query: 'cats & dogs',
      user: {
        id: 123,
        role: 'admin',
        active: true,
      },
      price: 1234.5,
    },
  },
};

const exampleSelect = el('exampleSelect');
const resetBtn = el('resetBtn');
const tplInput = el('tplInput');
const dataInput = el('dataInput');
const outText = el('outText');
const statusLine = el('statusLine');
const heroResult = document.getElementById('hero-result');

function formatJson (value) {
  return JSON.stringify(value, null, 2);
}

function setExample (key) {
  const ex = examples[key] ?? examples.hello;
  tplInput.value = ex.tpl;
  dataInput.value = formatJson(ex.data);
  renderNow();
}

function renderNow () {
  const start = performance.now();

  let data;
  try {
    data = JSON.parse(dataInput.value || '{}');
  } catch (err) {
    outText.textContent = '';
    statusLine.textContent = `Data JSON error: ${err?.message ?? String(err)}`;
    statusLine.style.color = 'rgba(255, 210, 210, 0.92)';
    return;
  }

  try {
    const out = cryTemplate.renderTemplate(tplInput.value, data);
    outText.textContent = out;
    const dur = performance.now() - start;
    statusLine.textContent = `Rendered in ${dur.toFixed(2)}ms`;
    statusLine.style.color = '';

    if (heroResult) {
      const heroOut = cryTemplate.renderTemplate('Hello {{ name | trim | upper }}!', { name: '  Alex  ' });
      heroResult.textContent = heroOut;
    }
  } catch (err) {
    outText.textContent = '';
    statusLine.textContent = `Render error: ${err?.message ?? String(err)}`;
    statusLine.style.color = 'rgba(255, 210, 210, 0.92)';
  }
}

const renderDebounced = debounce(renderNow, 120);

tplInput.addEventListener('input', renderDebounced);
dataInput.addEventListener('input', renderDebounced);

exampleSelect.addEventListener('change', () => {
  setExample(exampleSelect.value);
});

resetBtn.addEventListener('click', () => {
  setExample(exampleSelect.value);
});

// Initialize
setExample(exampleSelect.value);

highlightAll();
