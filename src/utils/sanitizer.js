// sanitizer.js – Sanitizes text before it is displayed in the popup.
// Prevents XSS by ensuring we never treat page-derived text as HTML.

/**
 * Escapes a string so it is safe to embed inside HTML attributes or
 * text nodes if you ever need to construct HTML strings manually.
 * For most display purposes, prefer textContent assignment instead.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips all HTML tags from a string, returning plain text.
 * Use this before storing or displaying any text that came
 * from the page DOM or AI response that might contain markup.
 *
 * @param {string} str
 * @returns {string}
 */
function stripTags(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Safely sets the textContent of a DOM element.
 * NEVER uses innerHTML with untrusted content.
 *
 * @param {HTMLElement} el
 * @param {string} text
 */
function safeSetText(el, text) {
  if (!el) return;
  el.textContent = typeof text === 'string' ? text : String(text ?? '');
}

/**
 * Validates that a parsed summary object has the expected shape.
 * Returns a sanitized copy, or null if the object is unusable.
 *
 * @param {unknown} obj
 * @returns {{ tldr: string, keyPoints: string[], importantDetails: string[], fullSummary: string, actionItems: string[] } | null}
 */
function validateSummary(obj) {
  if (!obj || typeof obj !== 'object') return null;

  const tldr         = typeof obj.tldr         === 'string' ? obj.tldr.trim()         : '';
  const fullSummary  = typeof obj.fullSummary  === 'string' ? obj.fullSummary.trim()  : '';

  const keyPoints = Array.isArray(obj.keyPoints)
    ? obj.keyPoints.filter(p => typeof p === 'string').map(p => p.trim())
    : [];

  const importantDetails = Array.isArray(obj.importantDetails)
    ? obj.importantDetails.filter(p => typeof p === 'string').map(p => p.trim())
    : [];

  const actionItems = Array.isArray(obj.actionItems)
    ? obj.actionItems.filter(p => typeof p === 'string').map(p => p.trim())
    : [];

  // At minimum we need a tldr or a fullSummary to consider this valid
  if (!tldr && !fullSummary) return null;

  return { tldr, keyPoints, importantDetails, fullSummary, actionItems };
}
