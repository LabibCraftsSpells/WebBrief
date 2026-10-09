# WebBrief

> Understand any webpage instantly. AI-powered structured summaries in your browser.

WebBrief is a Chrome extension that extracts the meaningful content from any webpage and sends it to an AI model via [OpenRouter](https://openrouter.ai) to produce a clean, structured summary — so you don't have to read the entire page.

---

## Features

### Core (V1)
- **Structured summaries** — TL;DR, Key Points, Important Details, Full Summary, and actionable takeaways
- **Smart content extraction** — prefers semantic HTML (`<article>`, `<main>`) and removes nav/footer/ads/cookie banners
- **Long page support** — automatically splits very long pages into chunks, summarizes each, then combines
- **Configurable model** — use any model available on OpenRouter; defaults to `qwen/qwen-2.5-72b-instruct`
- **Summary length control** — Short / Standard / Detailed
- **No backend required** — runs entirely client-side; your API key stays in Chrome's local storage
- **Privacy-first** — no analytics, no accounts, no permanent storage of page content

### Freemium experiment (V2)
- **Daily free limit** — 3 summaries per calendar day; resets at local midnight
- **Usage indicator** — subtle dot indicator showing summaries used today
- **Paywall screen** — shown after 3 summaries; displays the WebBrief Pro concept at \$3/month
- **Early-access flow** — "Get WebBrief Pro" → honest interest-measurement screen (no real payment)
- **Safe increment** — usage is only counted after a valid summary is returned; errors/empty pages never consume a slot
- **Developer reset** — Settings → Developer Testing section has a reset button for local testing

---

## Project Structure

```
webbrief/
├── manifest.json               Chrome Manifest V3 config
├── README.md
├── .gitignore
│
├── src/
│   ├── config/
│   │   └── config.js           Central configuration (model, chunk sizes, etc.)
│   │
│   ├── content/
│   │   └── extractor.js        Injected into pages to extract meaningful text
│   │
│   ├── services/
│   │   └── openrouter.js       All OpenRouter API communication
│   │
│   ├── utils/
│   │   ├── chunker.js          Splits long text into processable chunks
│   │   ├── sanitizer.js        Sanitization helpers – prevents XSS
│   │   └── usage.js            Daily free-limit tracking (V2)
│   │
│   └── popup/
│       ├── popup.html          Extension popup UI
│       ├── popup.css           Styles
│       └── popup.js            Popup controller / orchestration
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## How to Install

No build step required. WebBrief is plain HTML/CSS/JavaScript.

### 1. Clone or download this repository

```bash
git clone https://github.com/yourusername/webbrief.git
# or download and unzip the project
```

### 2. Load the extension into Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the **`WebBrief`** folder (the one containing `manifest.json`)

The extension will appear in your toolbar. Pin it for easy access.

---

## Configuration

### Set your OpenRouter API key

1. Click the WebBrief icon in the Chrome toolbar
2. Click the **⚙ Settings** (gear) icon in the top-right
3. Paste your OpenRouter API key (get one at [openrouter.ai/keys](https://openrouter.ai/keys))
4. Optionally change the model name
5. Click **Save Settings**

Your API key is stored in Chrome's `chrome.storage.local` — it never leaves your browser except when making requests directly to `https://openrouter.ai`.

### Change the model

In Settings, replace the model name with any [OpenRouter-compatible model](https://openrouter.ai/models). Examples:

| Model | Notes |
|---|---|
| `qwen/qwen-2.5-72b-instruct` | Default – fast, accurate, affordable |
| `qwen/qwen3-235b-a22b` | Larger Qwen model |
| `google/gemini-flash-1.5` | Fast alternative |
| `anthropic/claude-3-haiku` | Good quality, slightly more expensive |

---

## How to Use

1. Navigate to any webpage you want to understand
2. Click the WebBrief extension icon
3. Select your preferred summary length (Short / Standard / Detailed)
4. Click **Summarize Page**
5. Read the structured summary

---

## Permissions Explained

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the URL and title of the current tab |
| `scripting` | Inject `extractor.js` into the page to extract text |
| `storage` | Save your API key and preferences locally |
| `host_permissions: openrouter.ai` | Make API calls to OpenRouter from the popup |

No other permissions are requested.

---

## Known Limitations

- **chrome:// pages** — Chrome does not allow extensions to read browser internal pages. WebBrief will show an appropriate error.
- **PDF pages** — PDF rendering is handled by Chrome's internal viewer, not the DOM. PDF support is planned for a future version.
- **Single-page apps** — Heavily JavaScript-rendered pages (e.g., Twitter/X feeds) may extract less content than expected because the extractor runs against the current DOM state.
- **Very dynamic content** — Content loaded after user interaction is not automatically captured.
- **Local files** — `file://` URLs require the user to manually enable "Allow access to file URLs" in `chrome://extensions`.
- **Long pages** — Pages exceeding ~60,000 characters are capped at 5 chunks. Content beyond the cap is not summarized. This prevents runaway API costs.
- **Max tokens** — The AI response is capped at 2,048 tokens. Extremely detailed summaries of very long pages may be truncated.

---

## Privacy

- Page text is sent to OpenRouter (and the selected AI model) **only when you click Summarize Page**.
- A disclosure is shown in the UI: _"Page content is sent to the selected AI model to generate the summary."_
- WebBrief does **not** collect analytics, create accounts, or store page content after the popup is closed.
- Your API key is stored in Chrome's local extension storage and is only transmitted to `openrouter.ai`.

---

## Future Improvements (not in V1)

- Context-menu "Explain this section" for selected text
- Summary history
- PDF summarization
- YouTube transcript summarization
- Multilingual summaries
- Improved article extraction (Readability.js integration)
- Reading time estimation
- Local model support (Ollama)
- Citation links from summary points back to page sections

---

## Development

No build tools, no npm install. Open the project folder, make changes, and reload the extension in `chrome://extensions`.

To see console output from the popup: right-click the extension icon → **Inspect popup**.

To see output from the content extractor: open DevTools on the page (`F12`) → Console.

---

## License

MIT
