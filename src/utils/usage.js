// usage.js – Daily free-usage tracking for WebBrief.
//
// ─── ARCHITECTURE NOTE ──────────────────────────────────────────────────────
// This module manages usage limits entirely client-side using chrome.storage.local.
// This is intentional for V2 (prototype / experiment phase).
//
// PROTOTYPE LIMITATIONS – do NOT ship this as a real paid product:
//   1. Client-side limits are trivially bypassed by a technical user who can
//      inspect chrome.storage.local via DevTools and reset summariesUsed to 0.
//   2. There is no authentication – we cannot distinguish users.
//   3. There is no server-side enforcement – nothing stops a determined user.
//
// FUTURE PRODUCTION ARCHITECTURE:
//   Chrome Extension → POST /api/summarize → Your Backend → OpenRouter → AI Model
//   The backend holds the OpenRouter API key, authenticates the user (JWT / session),
//   tracks usage per user in a database, and enforces the rate limit server-side.
//   The extension would never talk to OpenRouter directly in the production version.
//
// For now, this module is sufficient to test the concept with real users who
// are not trying to circumvent it.
// ────────────────────────────────────────────────────────────────────────────

const USAGE_KEY   = 'wb_usage';   // chrome.storage.local key
const FREE_LIMIT  = 3;            // free summaries per calendar day

/**
 * Returns today's date as "YYYY-MM-DD" using local time.
 * We intentionally use local date so the reset happens at local midnight,
 * which feels natural to the user ("summaries reset tomorrow").
 *
 * @returns {string}
 */
function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Reads the stored usage record and returns a fresh, normalised object.
 * Automatically resets the count when the calendar date has changed.
 *
 * @returns {Promise<{ usageDate: string, summariesUsed: number }>}
 */
async function getUsage() {
  const stored = await chrome.storage.local.get(USAGE_KEY);
  const record = stored[USAGE_KEY];
  const today  = todayString();

  // If no record or it's from a previous day, return a fresh record.
  if (!record || record.usageDate !== today) {
    return { usageDate: today, summariesUsed: 0 };
  }

  return {
    usageDate:    record.usageDate,
    summariesUsed: typeof record.summariesUsed === 'number' ? record.summariesUsed : 0,
  };
}

/**
 * Saves the usage record to chrome.storage.local.
 *
 * @param {{ usageDate: string, summariesUsed: number }} record
 */
async function saveUsage(record) {
  await chrome.storage.local.set({ [USAGE_KEY]: record });
}

/**
 * Returns true if the user has remaining free summaries today.
 *
 * @returns {Promise<boolean>}
 */
async function hasRemainingUsage() {
  const { summariesUsed } = await getUsage();
  return summariesUsed < FREE_LIMIT;
}

/**
 * Increments the usage count by 1 for today.
 * Only call this AFTER a summary has been successfully generated.
 *
 * @returns {Promise<{ summariesUsed: number, limit: number }>}
 */
async function incrementUsage() {
  const record = await getUsage();
  record.summariesUsed = Math.min(record.summariesUsed + 1, FREE_LIMIT);
  await saveUsage(record);
  return { summariesUsed: record.summariesUsed, limit: FREE_LIMIT };
}

/**
 * Returns the current usage state for display purposes.
 *
 * @returns {Promise<{ summariesUsed: number, limit: number, remaining: number, atLimit: boolean }>}
 */
async function getUsageStatus() {
  const { summariesUsed } = await getUsage();
  return {
    summariesUsed,
    limit:     FREE_LIMIT,
    remaining: Math.max(0, FREE_LIMIT - summariesUsed),
    atLimit:   summariesUsed >= FREE_LIMIT,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVELOPER TESTING ONLY
// This function is intentionally not exposed in the normal UI.
// It is only accessible through the Settings panel under "Developer Testing".
// Do NOT surface this in a production release.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resets today's usage count to 0.
 * FOR DEVELOPMENT/TESTING ONLY.
 *
 * @returns {Promise<void>}
 */
async function devResetUsage() {
  const record = { usageDate: todayString(), summariesUsed: 0 };
  await saveUsage(record);
}
