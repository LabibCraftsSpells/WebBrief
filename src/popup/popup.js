// popup.js – Orchestrates the WebBrief popup UI.
// Depends on (loaded before this file in popup.html):
//   config.js, sanitizer.js, chunker.js, usage.js, openrouter.js
//
// V2 additions:
//   - Daily usage tracking (getUsageStatus, incrementUsage, hasRemainingUsage)
//   - Usage indicator bar (usageBar, usageDots, usageText)
//   - Paywall panel (shown when daily limit is reached)
//   - Early-access panel (measures purchase intent – no real payment)
//   - Developer reset button in Settings (clearly dev-only)
//
// The usage check gates the AI request. Increment only happens AFTER a
// valid summary is returned, so failed/invalid requests don't cost the user
// a daily summary.

'use strict';

// ─────────────────────────────────────────────
// DOM refs – V1 (unchanged)
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const settingsBtn              = $('settingsBtn');
const settingsPanel            = $('settingsPanel');
const mainPanel                = $('mainPanel');

const apiKeyInput              = $('apiKeyInput');
const revealApiKey             = $('revealApiKey');
const modelInput               = $('modelInput');
const saveSettingsBtn          = $('saveSettingsBtn');
const cancelSettingsBtn        = $('cancelSettingsBtn');
const saveMsg                  = $('saveMsg');

const noKeyNotice              = $('noKeyNotice');
const openSettingsFromNotice   = $('openSettingsFromNotice');

const pills                    = document.querySelectorAll('.pill');
const summarizeBtn             = $('summarizeBtn');

const loadingState             = $('loadingState');
const loadingText              = $('loadingText');
const errorState               = $('errorState');
const errorText                = $('errorText');
const retryBtn                 = $('retryBtn');
const resultState              = $('resultState');

const tldrText                 = $('tldrText');
const keyPointsCard            = $('keyPointsCard');
const keyPointsList            = $('keyPointsList');
const detailsCard              = $('detailsCard');
const detailsList              = $('detailsList');
const fullSummaryCard          = $('fullSummaryCard');
const fullSummaryText          = $('fullSummaryText');
const actionCard               = $('actionCard');
const actionList               = $('actionList');
const resultMeta               = $('resultMeta');

// ─────────────────────────────────────────────
// DOM refs – V2 additions
// ─────────────────────────────────────────────

const usageBar                 = $('usageBar');
const usageDots                = $('usageDots');
const usageText                = $('usageText');

const paywallPanel             = $('paywallPanel');
const upgradeBtn               = $('upgradeBtn');

const earlyAccessPanel         = $('earlyAccessPanel');
const earlyAccessBody          = $('earlyAccessBody');
const earlyAccessConfirmed     = $('earlyAccessConfirmed');
const backFromEarlyAccess      = $('backFromEarlyAccess');
const interestedBtn            = $('interestedBtn');

const devResetBtn              = $('devResetBtn');
const devResetMsg              = $('devResetMsg');

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
let currentLength = CONFIG.DEFAULT_SUMMARY_LENGTH;
let lastPageData  = null;   // Cache for retry

// ─────────────────────────────────────────────
// Panel visibility helpers
// ─────────────────────────────────────────────

/**
 * All top-level panels we switch between.
 * The header is always visible.
 */
const ALL_PANELS = [mainPanel, settingsPanel, paywallPanel, earlyAccessPanel];

function showPanel(panel) {
  ALL_PANELS.forEach(p => p.classList.add('hidden'));
  panel.classList.remove('hidden');
}

/**
 * Within the main panel, show only the specified content states.
 * Resets: loadingState, errorState, resultState, noKeyNotice.
 */
function showOnly(...elements) {
  [loadingState, errorState, resultState, noKeyNotice].forEach(el => {
    el.classList.add('hidden');
  });
  elements.forEach(el => el && el.classList.remove('hidden'));
}

function setLoading(message) {
  showOnly(loadingState);
  safeSetText(loadingText, message || 'Analyzing page…');
  summarizeBtn.disabled = true;
}

function setError(message) {
  showOnly(errorState);
  safeSetText(errorText, message || 'An unexpected error occurred.');
  summarizeBtn.disabled = false;
}

function setIdle() {
  showOnly();
  summarizeBtn.disabled = false;
}

// ─────────────────────────────────────────────
// Usage indicator
// ─────────────────────────────────────────────

/**
 * Renders the usage bar based on the current usage status.
 * Uses dot indicators (filled = used, empty = remaining).
 *
 * @param {{ summariesUsed: number, limit: number, remaining: number, atLimit: boolean }} status
 */
function renderUsageBar(status) {
  const { summariesUsed, limit, remaining, atLimit } = status;

  // Build dots
  usageDots.innerHTML = '';
  for (let i = 0; i < limit; i++) {
    const dot = document.createElement('span');
    dot.className = 'usage-dot';
    if (i < summariesUsed) {
      dot.classList.add(atLimit ? 'exhausted' : 'used');
    }
    dot.setAttribute('aria-hidden', 'true');
    usageDots.appendChild(dot);
  }

  // Set text
  let text;
  if (atLimit) {
    text = `All ${limit} free summaries used today`;
  } else if (remaining === 1) {
    text = `1 free summary remaining today`;
  } else if (summariesUsed === 0) {
    text = `${limit} free summaries today`;
  } else {
    text = `${summariesUsed} / ${limit} free summaries used today`;
  }

  usageText.textContent = text;
  usageText.className   = `usage-text${atLimit ? ' at-limit' : ''}`;
  usageBar.classList.remove('hidden');
}

/**
 * Refreshes the usage bar from storage. Call after any usage change.
 */
async function refreshUsageBar() {
  const status = await getUsageStatus();
  renderUsageBar(status);
}

// ─────────────────────────────────────────────
// Settings panel
// ─────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get(['apiKey', 'model']);
  apiKeyInput.value = data.apiKey || '';
  modelInput.value  = data.model  || CONFIG.DEFAULT_MODEL;
}

async function saveSettings() {
  const key   = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || CONFIG.DEFAULT_MODEL;

  if (!key) {
    showSaveMsg('API key cannot be empty.', 'error');
    return;
  }

  await chrome.storage.local.set({ apiKey: key, model });
  showSaveMsg('Settings saved.', 'success');

  // After a short delay, return to main panel
  setTimeout(() => {
    closeSettings();
  }, 900);
}

function showSaveMsg(text, type) {
  saveMsg.textContent = text;
  saveMsg.className   = `save-msg ${type}`;
  saveMsg.classList.remove('hidden');
}

function openSettings() {
  showPanel(settingsPanel);
  saveMsg.classList.add('hidden');
  devResetMsg.classList.add('hidden');
  loadSettings();
}

function closeSettings() {
  showPanel(mainPanel);
  checkApiKey();
}

// ─────────────────────────────────────────────
// API key guard
// ─────────────────────────────────────────────

/**
 * Checks whether an API key is configured and updates the UI accordingly.
 * Also refreshes the usage bar.
 */
async function checkApiKey() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    noKeyNotice.classList.remove('hidden');
    usageBar.classList.add('hidden');
    summarizeBtn.disabled = true;
  } else {
    noKeyNotice.classList.add('hidden');
    summarizeBtn.disabled = false;
    await refreshUsageBar();
  }
}

// ─────────────────────────────────────────────
// Length pills
// ─────────────────────────────────────────────

pills.forEach(pill => {
  pill.addEventListener('click', () => {
    pills.forEach(p => {
      p.classList.remove('active');
      p.setAttribute('aria-pressed', 'false');
    });
    pill.classList.add('active');
    pill.setAttribute('aria-pressed', 'true');
    currentLength = pill.dataset.length;
  });
});

// ─────────────────────────────────────────────
// Reveal API key toggle
// ─────────────────────────────────────────────

revealApiKey.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
});

// ─────────────────────────────────────────────
// Content extraction via scripting API (V1 – unchanged)
// ─────────────────────────────────────────────

async function extractPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) throw new Error('Could not identify the active tab.');

  // Guard: chrome:// and similar are inaccessible
  const url = tab.url || '';
  if (/^(chrome|chrome-extension|edge|about|data):/.test(url)) {
    throw new Error("Chrome doesn't allow extensions to read this page.");
  }

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['src/content/extractor.js'],
    });
  } catch (err) {
    if (err.message?.includes('Cannot access') || err.message?.includes('chrome://')) {
      throw new Error("Chrome doesn't allow extensions to read this page.");
    }
    throw err;
  }

  const result = results?.[0]?.result;
  if (!result) throw new Error('Content extraction returned no data.');
  return result;
}

// ─────────────────────────────────────────────
// Render summary (V1 – unchanged)
// ─────────────────────────────────────────────

function renderSummary(summary, meta) {
  // TL;DR (always shown)
  safeSetText(tldrText, summary.tldr || 'No summary available.');

  // Key Points
  if (summary.keyPoints?.length > 0) {
    keyPointsList.innerHTML = '';   // safe – we append textContent nodes below
    summary.keyPoints.forEach(point => {
      const li = document.createElement('li');
      li.textContent = point;
      keyPointsList.appendChild(li);
    });
    keyPointsCard.classList.remove('hidden');
  } else {
    keyPointsCard.classList.add('hidden');
  }

  // Important Details
  if (summary.importantDetails?.length > 0) {
    detailsList.innerHTML = '';
    summary.importantDetails.forEach(detail => {
      const li = document.createElement('li');
      li.textContent = detail;
      detailsList.appendChild(li);
    });
    detailsCard.classList.remove('hidden');
  } else {
    detailsCard.classList.add('hidden');
  }

  // Full Summary
  if (summary.fullSummary) {
    safeSetText(fullSummaryText, summary.fullSummary);
    fullSummaryCard.classList.remove('hidden');
  } else {
    fullSummaryCard.classList.add('hidden');
  }

  // Action Items
  if (summary.actionItems?.length > 0) {
    actionList.innerHTML = '';
    summary.actionItems.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      actionList.appendChild(li);
    });
    actionCard.classList.remove('hidden');
  } else {
    actionCard.classList.add('hidden');
  }

  // Metadata
  if (meta) {
    safeSetText(resultMeta, meta);
  }

  showOnly(resultState);
  summarizeBtn.disabled = false;
}

// ─────────────────────────────────────────────
// Paywall / upgrade flow
// ─────────────────────────────────────────────

function showPaywall() {
  showPanel(paywallPanel);
}

function showEarlyAccess() {
  // Reset the early-access panel to its initial state
  earlyAccessBody.classList.remove('hidden');
  earlyAccessConfirmed.classList.add('hidden');
  showPanel(earlyAccessPanel);
}

// ─────────────────────────────────────────────
// Main summarize flow – V2 with usage gate
// ─────────────────────────────────────────────

async function runSummarize() {
  // ── Usage gate (V2) ──────────────────────────────
  // Check BEFORE doing any work. If the user is at their daily limit,
  // show the paywall immediately without making any API request.
  const usageStatus = await getUsageStatus();
  if (usageStatus.atLimit) {
    showPaywall();
    return;
  }

  // ── Proceed with summarization ───────────────────
  showPanel(mainPanel);   // Make sure main panel is visible
  setLoading('Extracting page content…');

  try {
    // 1. Get settings
    const { apiKey, model } = await chrome.storage.local.get(['apiKey', 'model']);

    if (!apiKey) {
      setIdle();
      noKeyNotice.classList.remove('hidden');
      return;
    }

    const resolvedModel = model || CONFIG.DEFAULT_MODEL;

    // 2. Extract page content
    let pageData;
    try {
      pageData = await extractPageContent();
    } catch (err) {
      // Extraction failure does NOT count against the user's daily limit
      setError(err.message);
      return;
    }

    lastPageData = pageData;

    if (!pageData.text || pageData.text.trim().length < 50) {
      // Empty/sparse pages do NOT count against the daily limit
      setError("Couldn't find meaningful text on this page.");
      return;
    }

    // 3. Run summarization (API call)
    const summary = await summarizePage({
      apiKey:        apiKey,
      model:         resolvedModel,
      pageTitle:     pageData.title,
      pageText:      pageData.text,
      summaryLength: currentLength,
      onProgress:    msg => setLoading(msg),
    });

    if (!summary) {
      // Unusable AI response does NOT count against the daily limit
      setError('The AI returned an unusable response. Please try again.');
      return;
    }

    // 4. Increment usage ONLY after a valid summary is returned
    await incrementUsage();
    await refreshUsageBar();

    // 5. Render
    const charCount = pageData.text.length.toLocaleString();
    const meta = `Summarized ${charCount} characters via ${resolvedModel}`;
    renderSummary(summary, meta);

  } catch (err) {
    // Any unexpected error (API error, network, etc.) does NOT count
    console.error('[WebBrief]', err);
    setError(friendlyError(err));
  }
}

// ─────────────────────────────────────────────
// Event listeners – V1
// ─────────────────────────────────────────────

settingsBtn.addEventListener('click', openSettings);
cancelSettingsBtn.addEventListener('click', closeSettings);
saveSettingsBtn.addEventListener('click', saveSettings);
openSettingsFromNotice.addEventListener('click', openSettings);
summarizeBtn.addEventListener('click', runSummarize);
retryBtn.addEventListener('click', runSummarize);

// Enter key in settings inputs
[apiKeyInput, modelInput].forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveSettings();
  });
});

// ─────────────────────────────────────────────
// Event listeners – V2
// ─────────────────────────────────────────────

upgradeBtn.addEventListener('click', showEarlyAccess);

backFromEarlyAccess.addEventListener('click', () => {
  showPaywall();
});

interestedBtn.addEventListener('click', () => {
  // No payment taken. This is a local signal of interest only.
  // In a production version, you would POST to your backend here
  // and store the user's interest against their account.
  earlyAccessBody.classList.add('hidden');
  earlyAccessConfirmed.classList.remove('hidden');
});

// Developer reset – clears today's usage count.
// Clearly not user-facing; lives under the dashed separator in Settings.
devResetBtn.addEventListener('click', async () => {
  await devResetUsage();
  await refreshUsageBar();

  devResetMsg.textContent = 'Usage reset to 0.';
  devResetMsg.classList.remove('hidden');

  // Clear the message after a few seconds
  setTimeout(() => devResetMsg.classList.add('hidden'), 3000);
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Start on the main panel (settings panel starts hidden via HTML)
  showPanel(mainPanel);
  await checkApiKey();
});
