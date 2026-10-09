// chunker.js – Splits long text into processable chunks.
// Designed so the chunking strategy can be improved independently.

/**
 * Splits text into chunks of approximately maxChars characters,
 * breaking at paragraph boundaries where possible.
 *
 * @param {string} text       - Full extracted page text
 * @param {number} maxChars   - Maximum characters per chunk
 * @param {number} maxChunks  - Hard cap on number of chunks
 * @returns {string[]}         - Array of text chunks
 */
function splitIntoChunks(text, maxChars, maxChunks) {
  if (!text || text.length <= maxChars) {
    return [text];
  }

  const chunks = [];
  // Split on double-newlines (paragraph breaks) first
  const paragraphs = text.split(/\n{2,}/);
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      // Current chunk is full – save it
      if (current.trim()) {
        chunks.push(current.trim());
        if (chunks.length >= maxChunks) break;
      }

      // If the paragraph itself is longer than maxChars, hard-split it
      if (para.length > maxChars) {
        const sentences = para.split(/(?<=[.!?])\s+/);
        let sentBuf = '';
        for (const sentence of sentences) {
          const sentCandidate = sentBuf ? `${sentBuf} ${sentence}` : sentence;
          if (sentCandidate.length <= maxChars) {
            sentBuf = sentCandidate;
          } else {
            if (sentBuf.trim()) {
              chunks.push(sentBuf.trim());
              if (chunks.length >= maxChunks) break;
            }
            sentBuf = sentence;
          }
        }
        if (sentBuf.trim() && chunks.length < maxChunks) {
          current = sentBuf.trim();
        } else {
          current = '';
        }
      } else {
        current = para;
      }
    }
  }

  // Don't forget the last buffer
  if (current.trim() && chunks.length < maxChunks) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}

/**
 * Returns true if the text needs to be chunked.
 *
 * @param {string} text
 * @param {number} threshold
 * @returns {boolean}
 */
function needsChunking(text, threshold) {
  return text.length > threshold;
}
