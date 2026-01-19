/* global fetch */

(function initGithubStars () {
  const repo = 'cryMG/cryTemplate';
  const apiUrl = `https://api.github.com/repos/${repo}`;
  const cacheKey = `crytpl:gh:stars:${repo}`;
  const cacheTtlMs = 60 * 60 * 1000;

  function formatCount (count) {
    try {
      return new Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(count);
    } catch {
      return String(count);
    }
  }

  function setText (text, full) {
    for (const el of document.querySelectorAll('[data-github-stars]')) {
      el.textContent = text;
      if (full != null) {
        el.setAttribute('title', `${full} stars`);
        el.setAttribute('aria-label', `${full} GitHub stars`);
      }
    }
  }

  function readCache () {
    try {
      const raw = window.localStorage?.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.count !== 'number' || typeof parsed.ts !== 'number') return null;
      if ((Date.now() - parsed.ts) > cacheTtlMs) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCache (count) {
    try {
      window.localStorage?.setItem(cacheKey, JSON.stringify({
        count,
        ts: Date.now(),
      }));
    } catch {
      // ignore
    }
  }

  const cached = readCache();
  if (cached) {
    setText(formatCount(cached.count), cached.count);
    return;
  }

  const targets = document.querySelectorAll('[data-github-stars]');
  if (!targets.length) return;

  // Minimal UI hint while loading
  setText('…');

  fetch(apiUrl, {
    headers: {
      'Accept': 'application/vnd.github+json',
    },
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const count = Number(json?.stargazers_count);
      if (!Number.isFinite(count)) return;
      writeCache(count);
      setText(formatCount(count), count);
    })
    .catch(() => {
      // Keep button usable even if API is blocked/rate-limited.
      setText('');
    });
})();
