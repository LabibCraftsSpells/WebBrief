// openrouter.js – Sole module responsible for communicating with OpenRouter.
// All API calls must go through this file; nothing else should fetch from OpenRouter.

// ─────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are WebBrief, a precise webpage summarizer.

Your task is to read the supplied webpage text and produce a structured summary in valid JSON.

Rules you MUST follow:
- Only include information that is actually present in the supplied text.
- Never fabricate facts, dates, numbers, names, or links.
- Preserve important numbers, dates, prices, deadlines, requirements, and qualifications exactly.
- Distinguish facts from opinions when the text contains opinions (e.g. "the author argues that…").
- Remove repetition. Say each thing once.
- Avoid filler phrases like "in conclusion", "it is worth noting", "this article discusses".
- Prioritize actionable information the reader needs to act on.
- Write clearly and directly.

Output format – respond with ONLY a valid JSON object, no markdown fences, no extra text:

{
  "tldr": "One to four sentences explaining what this page is about.",
  "keyPoints": [
    "Important point 1",
    "Important point 2"
  ],
  "importantDetails": [
    "📅 Date: ...",
    "📍 Location: ...",
    "💰 Cost: ...",
    "📝 Requirement: ..."
  ],
  "fullSummary": "A readable multi-paragraph summary covering the important information.",
  "actionItems": [
    "What the reader should do or pay attention to"
  ]
}

Only include fields that have meaningful content.
importantDetails should only list items that actually appear in the text (dates, prices, deadlines, locations, requirements, names, numbers, conditions).
actionItems should only be included when the page contains something the reader should act on.
If a section has nothing useful, use an empty array [] for arrays or omit the field.`;

// ─────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────

function buildSinglePagePrompt(pageTitle, pageText, lengthInstruction) {
  return `${lengthInstruction ? lengthInstruction + '\n\n' : ''}Page title: ${pageTitle}

Webpage content:
---
${pageText}
---

Produce the JSON summary now.`;
}

function buildChunkPrompt(chunkIndex, totalChunks, pageTitle, chunkText) {
  return `You are summarizing chunk ${chunkIndex + 1} of ${totalChunks} from a webpage.

Page title: ${pageTitle}

Chunk content:
---
${chunkText}
---

Extract the key information from this chunk only. Return a plain JSON object:
{
  "keyFacts": ["fact 1", "fact 2", ...],
  "importantDetails": ["detail 1", ...],
  "summary": "A concise summary of this chunk."
}`;
}

function buildCombinedSummaryPrompt(pageTitle, combinedChunkSummaries, lengthInstruction) {
  return `${lengthInstruction ? lengthInstruction + '\n\n' : ''}Page title: ${pageTitle}

Below are summaries of sections of the full webpage. Combine them into one coherent structured summary. Do not repeat information. Produce the final JSON summary now.

Section summaries:
---
${combinedChunkSummaries}
---`;
}

// ─────────────────────────────────────────────
// API call
// ─────────────────────────────────────────────

/**
 * Calls the OpenRouter chat completions API.
 *
 * @param {string} apiKey
 * @param {string} model
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>} - Raw text content from the model
 */
async function callOpenRouter(apiKey, model, messages) {
  const response = await fetch(CONFIG.OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/webbrief-extension',
      'X-Title': 'WebBrief',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.3,   // Low temperature for factual accuracy
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new ApiError(response.status, errorBody);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('The AI returned an empty response.');
  }

  return content;
}

// ─────────────────────────────────────────────
// JSON parsing with fallback
// ─────────────────────────────────────────────

/**
 * Attempts to parse a JSON summary from the model's text response.
 * If JSON parsing fails, produces a safe plain-text fallback summary.
 *
 * @param {string} rawText
 * @returns {object}
 */
function parseModelResponse(rawText) {
  // Strip potential markdown code fences the model might add despite instructions
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/,            '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Fallback: wrap the raw text as a plain summary
    console.warn('[WebBrief] JSON parse failed, using plain-text fallback');
    return {
      tldr: 'Summary generated (plain text – structured format unavailable).',
      keyPoints: [],
      importantDetails: [],
      fullSummary: rawText.slice(0, 2000),
      actionItems: [],
    };
  }
}

// ─────────────────────────────────────────────
// Custom error class
// ─────────────────────────────────────────────

class ApiError extends Error {
  constructor(status, body) {
    super(`OpenRouter API error ${status}`);
    this.status = status;
    this.body   = body;
    this.name   = 'ApiError';
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Summarizes the given page text, handling chunking if needed.
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.pageTitle
 * @param {string} opts.pageText
 * @param {string} opts.summaryLength   - 'short' | 'standard' | 'detailed'
 * @param {function} [opts.onProgress]  - Called with a progress message string
 * @returns {Promise<object>}            - Validated summary object
 */
async function summarizePage({ apiKey, model, pageTitle, pageText, summaryLength, onProgress }) {
  const lengthInstruction = CONFIG.SUMMARY_LENGTHS[summaryLength] || CONFIG.SUMMARY_LENGTHS.standard;
  const notify = typeof onProgress === 'function' ? onProgress : () => {};

  if (!needsChunking(pageText, CONFIG.CHUNK_THRESHOLD)) {
    // ── Single-pass summarization ──
    notify('Analyzing page…');

    const messages = [
      { role: 'system',  content: SYSTEM_PROMPT },
      { role: 'user',    content: buildSinglePagePrompt(pageTitle, pageText, lengthInstruction) },
    ];

    const raw = await callOpenRouter(apiKey, model, messages);
    return validateSummary(parseModelResponse(raw));

  } else {
    // ── Multi-chunk summarization ──
    const chunks = splitIntoChunks(pageText, CONFIG.MAX_CHARS_PER_CHUNK, CONFIG.MAX_CHUNKS);
    notify(`Page is long — processing in ${chunks.length} section${chunks.length > 1 ? 's' : ''}…`);

    const chunkSummaries = [];

    for (let i = 0; i < chunks.length; i++) {
      notify(`Analyzing section ${i + 1} of ${chunks.length}…`);
      const messages = [
        { role: 'system',  content: 'You are a precise content extractor. Extract key facts from the supplied text chunk.' },
        { role: 'user',    content: buildChunkPrompt(i, chunks.length, pageTitle, chunks[i]) },
      ];
      const raw = await callOpenRouter(apiKey, model, messages);
      chunkSummaries.push(raw);
    }

    // Combine chunk summaries into final structured summary
    notify('Combining sections into final summary…');
    const combined = chunkSummaries.join('\n\n---\n\n');

    const finalMessages = [
      { role: 'system',  content: SYSTEM_PROMPT },
      { role: 'user',    content: buildCombinedSummaryPrompt(pageTitle, combined, lengthInstruction) },
    ];

    const finalRaw = await callOpenRouter(apiKey, model, finalMessages);
    return validateSummary(parseModelResponse(finalRaw));
  }
}

/**
 * Maps an API error to a user-friendly message.
 *
 * @param {Error} err
 * @returns {string}
 */
function friendlyError(err) {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401: return 'Invalid API key. Please check your OpenRouter API key in Settings.';
      case 402: return 'Your OpenRouter account has insufficient credits.';
      case 429: return 'The AI provider is rate-limiting requests. Please wait a moment and try again.';
      case 500:
      case 502:
      case 503: return 'OpenRouter is temporarily unavailable. Please try again shortly.';
      default:  return `API error (${err.status}). Please try again.`;
    }
  }
  if (err.name === 'TypeError' && err.message.includes('fetch')) {
    return 'Network error. Check your internet connection and try again.';
  }
  return err.message || 'An unexpected error occurred.';
}
