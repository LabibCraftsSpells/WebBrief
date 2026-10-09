// config.js – Central configuration for WebBrief
// All tuneable constants live here so they can be changed in one place.

const CONFIG = {
  // Default model to use via OpenRouter.
  // Users can override this in Settings.
  DEFAULT_MODEL: 'qwen/qwen-2.5-72b-instruct',

  // OpenRouter API endpoint
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',

  // Maximum characters to send in a single LLM request.
  // OpenRouter/Qwen-72B context window is large, but we stay conservative
  // to keep costs low and responses fast.
  MAX_CHARS_PER_CHUNK: 12000,

  // If the total extracted text is below this threshold, skip chunking.
  CHUNK_THRESHOLD: 12000,

  // Maximum number of chunks to process (avoid runaway costs).
  MAX_CHUNKS: 5,

  // Summary length presets – injected into the system prompt.
  SUMMARY_LENGTHS: {
    short:    'Keep the summary brief. TL;DR in 1–2 sentences, key points max 4, full summary max 100 words.',
    standard: 'Use a balanced length. TL;DR in 2–3 sentences, key points 5–7, full summary 150–250 words.',
    detailed: 'Be thorough. TL;DR in 3–4 sentences, key points up to 8, full summary up to 400 words.',
  },

  DEFAULT_SUMMARY_LENGTH: 'standard',
};

// Freeze so nothing accidentally mutates the config at runtime.
Object.freeze(CONFIG);
Object.freeze(CONFIG.SUMMARY_LENGTHS);
