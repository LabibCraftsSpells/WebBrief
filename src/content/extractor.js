// extractor.js – Content script injected into the active tab.
// Responsible for extracting the meaningful textual content from the page.
// This file runs in the page context via chrome.scripting.executeScript.

(() => {
  // ─────────────────────────────────────────────
  // 1. Tags to unconditionally remove (noise)
  // ─────────────────────────────────────────────
  const REMOVE_TAGS = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
    'video', 'audio', 'picture', 'figure > figcaption',
    'nav', 'footer', 'aside',
    'form', 'button', 'input', 'select', 'textarea', 'label',
    'header nav', 'header menu',
  ];

  // Role/class/id patterns that strongly indicate non-content
  const NOISE_PATTERNS = [
    // Navigation
    /\b(nav|navigation|navbar|menu|sidebar|side-bar|sidenav)\b/i,
    // Ads
    /\b(ad|ads|advert|advertisement|sponsor|promo|banner|popup|pop-up)\b/i,
    // Cookie/GDPR
    /\b(cookie|gdpr|consent|privacy-notice|privacy-banner|cc-banner)\b/i,
    // Social
    /\b(share|social|tweet|facebook|instagram|linkedin|follow)\b/i,
    // Footer / header noise
    /\b(footer|site-footer|page-footer|header|site-header|page-header|masthead)\b/i,
    // Widget noise
    /\b(widget|related|recommended|trending|popular|more-stories|newsletter|subscribe)\b/i,
    // Comments
    /\b(comments?|comment-section|disqus|livefyre)\b/i,
    // Breadcrumbs
    /\b(breadcrumb|crumb)\b/i,
  ];

  // ─────────────────────────────────────────────
  // 2. Helpers
  // ─────────────────────────────────────────────

  /**
   * Returns true if the element looks like noise based on its
   * id, class, role, or aria-label attributes.
   */
  function isNoisy(el) {
    const attrs = [
      el.id || '',
      el.className || '',
      el.getAttribute('role') || '',
      el.getAttribute('aria-label') || '',
    ].join(' ');

    return NOISE_PATTERNS.some(pattern => pattern.test(attrs));
  }

  /**
   * Clones a DOM subtree, strips known noise elements, and returns
   * plain text content.
   */
  function extractText(root) {
    const clone = root.cloneNode(true);

    // Remove hard-coded noisy tag selectors
    REMOVE_TAGS.forEach(sel => {
      try {
        clone.querySelectorAll(sel).forEach(el => el.remove());
      } catch (_) { /* ignore invalid selectors */ }
    });

    // Remove elements whose attributes match noise patterns
    clone.querySelectorAll('*').forEach(el => {
      if (isNoisy(el)) el.remove();
    });

    // Collapse whitespace and return
    return (clone.innerText || clone.textContent || '')
      .replace(/\s{3,}/g, '\n\n')
      .trim();
  }

  // ─────────────────────────────────────────────
  // 3. Candidate selection – prefer semantic HTML
  // ─────────────────────────────────────────────

  function findMainContent() {
    // Priority order of semantic containers
    const candidates = [
      document.querySelector('article'),
      document.querySelector('[role="main"]'),
      document.querySelector('main'),
      // Common CMS/blog class names
      document.querySelector('.post-content'),
      document.querySelector('.article-content'),
      document.querySelector('.entry-content'),
      document.querySelector('.content-body'),
      document.querySelector('.page-content'),
      document.querySelector('#content'),
      document.querySelector('#main-content'),
      document.querySelector('#main'),
    ].filter(Boolean);

    for (const el of candidates) {
      const text = extractText(el);
      // Only accept if it has meaningful length (avoid tiny elements)
      if (text.length > 300) {
        return { text, source: el.tagName.toLowerCase() };
      }
    }

    // Heuristic fallback: find the densest text block
    const blocks = Array.from(
      document.querySelectorAll('div, section')
    ).filter(el => !isNoisy(el));

    // Score each block by text length minus link density penalty
    let best = null;
    let bestScore = 0;

    for (const el of blocks) {
      const allText = (el.innerText || el.textContent || '').trim();
      if (allText.length < 200) continue;

      const links = el.querySelectorAll('a');
      const linkText = Array.from(links)
        .map(a => (a.innerText || a.textContent || '').trim())
        .join('').length;

      const linkDensity = allText.length > 0 ? linkText / allText.length : 1;
      // Penalise high link density (nav-like blocks)
      const score = allText.length * (1 - linkDensity * 2);

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best) {
      const text = extractText(best);
      if (text.length > 100) return { text, source: 'heuristic' };
    }

    // Last resort: full body
    const bodyText = extractText(document.body);
    return { text: bodyText, source: 'body' };
  }

  // ─────────────────────────────────────────────
  // 4. Run extraction and return result
  // ─────────────────────────────────────────────

  const { text, source } = findMainContent();

  return {
    text: text,
    source: source,
    title: document.title || '',
    url: location.href,
    length: text.length,
  };
})();
