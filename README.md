# ai-memory

A browser-based app for capturing knowledge and storing it in your GitHub repository — with AI assistance for research, formatting, and organization.

## Concept

You have thoughts worth keeping. This app lets you speak or type rough notes, then uses AI to research, expand, and format them properly before committing to your personal knowledge repository.

Your memories live in *your* GitHub repo. Plain markdown. Version-controlled forever.

---

## User Flow

The interface is a **vertical scroll** of discrete sections ("capsules"). Each section builds on the previous, guiding you from setup through content capture to final commit.

### 1. 🔑 Credentials (Setup)

*Top of the scroll. One-time configuration.*

| Field | Purpose |
|-------|---------|
| OpenAI API Key | Powers AI research and writing |
| GitHub PAT | Read/write access to your repository |

- Keys are stored in browser local storage (encrypted with optional password)
- Once entered, keys are masked — you can't read them back, only replace them
- No backend server; API calls go directly from browser to OpenAI/GitHub

### 2. 📁 Repository Selection

*Which repo holds your knowledge?*

- Voice or text input: "my-notes" or "davidthings/brain"
- Dropdown of accessible repos (fetched via GitHub API)
- Once selected, persists across sessions

### 3. 📂 Scope (Optional)

*Narrow down to a specific area of the repository.*

- Can skip (work at repo root) or specify a subfolder
- Voice/text: "electronics/arduino" or "recipes/baking"
- AI can suggest likely locations based on your topic
- User confirms or adjusts

**Why scope?** A large repo might have hundreds of folders. Scoping tells the AI where to focus, making topic matching faster and more accurate.

### 4. 💬 Topic

*What do you want to document?*

- Voice or text: "I want to add a note about sourdough starters"
- AI scans the scoped area (or full repo if unscoped) to find:
  - Existing file that matches → will append/update
  - Related folder → will create new file there
  - No match → suggests where to create it
- User confirms the target location

### 5. 📝 Content

*Say what you know.*

- Voice and/or text input — ramble, dictate, type fragments
- No structure required; just get the information out
- Capture a paragraph or several
- **"Do it"** button when ready

### 6. ⚙️ Processing

*AI takes over.*

The AI:
1. Reads any style instructions in parent directories (like AGENTS.md or STYLE.md)
2. Researches the topic for supporting context
3. Structures and formats the content
4. Adds relevant details, diagrams (ASCII), or image suggestions
5. Produces clean markdown matching the repo's conventions

**Progress shown** — intermediate steps visible so you know what's happening.

### 7. 📄 Result

*Review what AI wrote.*

- Nicely formatted markdown preview
- Either a new document or a section to insert
- Fully covers your input, sharpened and expanded
- Possibly editable inline (future feature)

### 8. ✅ Action

*Accept, modify, or reject.*

| Action | Result |
|--------|--------|
| **Accept** | Commits to repo, returns to Topic (step 4) for next entry |
| **Modify** | Edit the result, resubmit for refinement |
| **Reject** | Returns to Content (step 5) to revise your input |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser App                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Credentials│→│  Repo   │→│  Scope  │→│  Topic  │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│                                              ↓              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Action  │←│ Result  │←│Processing│←│ Content │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│       ↓                                                     │
│   [commit]                                                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Local Storage: encrypted keys, repo settings, preferences  │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  ┌─────────────┐                ┌─────────────┐
  │   OpenAI    │                │   GitHub    │
  │     API     │                │     API     │
  └─────────────┘                └─────────────┘
```

---

## Voice Interface

Voice is a first-class input method. Two modes are supported, both using the same OpenAI API key.

### Mode 1: Turn-Taking (Pipeline)

Traditional request-response: you speak, AI responds, you speak again.

```
User speaks → STT → text → LLM → text → TTS → AI speaks
```

**Architecture:**
- **STT:** OpenAI Whisper (`gpt-4o-mini-transcribe`) or Deepgram
- **LLM:** GPT-4o-mini or similar (chat completions API)
- **TTS:** OpenAI TTS (`gpt-4o-mini-tts`) or ElevenLabs

**Pros:** Flexible (swap providers), inspectable (text in the middle), works with any LLM.
**Cons:** Higher latency (~1-2s), loses prosody between stages.

**Best for:** Form-filling steps (repo selection, scope, topic) where you want clear turn boundaries.

### Mode 2: Conversational (Realtime API)

Continuous bidirectional speech via OpenAI Realtime API. Native speech-to-speech with no intermediate text conversion.

```
User speaks ←──── WebSocket ────→ AI speaks
         (PCM audio both directions)
```

**Architecture:**
- Single WebSocket connection to `wss://api.openai.com/v1/realtime`
- Audio streamed as PCM16 at 24kHz
- Semantic VAD detects when you've finished speaking (not just silence)
- Barge-in supported: interrupt the AI mid-response

**Pros:** Sub-second latency, preserves prosody, natural conversation flow.
**Cons:** OpenAI-only, harder to debug (no text in the middle).

**Best for:** The rambling content capture step where you're thinking out loud.

### Implementation Source

Working implementations exist in the [whiteboard](https://github.com/davidthingsbot/whiteboard) project:

```
whiteboard/implementation/studies/inf-canvas/
├── src/items/
│   ├── VoiceAgent.jsx           ← Turn-taking (pipeline mode)
│   ├── ConversationAgent.jsx    ← Continuous (Realtime API)
│   └── lib/
│       ├── audio-capture.js     ← Mic capture + resampling
│       ├── audio-playback.js    ← Gapless audio queue
│       ├── pcm-audio.js         ← PCM16 ↔ Float32 conversion
│       ├── realtime-session.js  ← WebSocket lifecycle for Realtime API
│       ├── stt-providers.js     ← Whisper, Deepgram adapters
│       └── tts-providers.js     ← OpenAI TTS, ElevenLabs adapters
└── doc/items/
    ├── voice-agent.md           ← Pipeline architecture docs
    └── conversation-agent.md    ← Realtime API architecture docs
```

### Integration Steps

1. **Copy shared libraries** from `whiteboard/inf-canvas/src/items/lib/`:
   - `audio-capture.js`, `audio-playback.js`, `pcm-audio.js`
   - `realtime-session.js` (for conversational mode)
   - `stt-providers.js`, `tts-providers.js` (for pipeline mode)

2. **Copy UI components**:
   - `TranscriptPanel.jsx` — scrolling message list
   - `InputBar.jsx` — text + mic input with mode toggle

3. **For Realtime API** (conversational mode):
   - Need a server endpoint to proxy ephemeral token requests
   - Browser calls `POST /api/realtime/session`
   - Server calls `POST https://api.openai.com/v1/realtime/client_secrets`
   - Returns `{ value, expires_at }` ephemeral token
   - Browser opens WebSocket with token in subprotocol

4. **For pipeline mode** (turn-taking):
   - Direct browser → OpenAI calls work fine
   - No server proxy needed (API key in localStorage)

### Audio Pipeline Details

**Capture (browser → API):**
```
Mic (48kHz Float32) → downsample to 24kHz → PCM16 → base64 → WebSocket
```

**Playback (API → browser):**
```
WebSocket → base64 → PCM16 → Float32 → AudioBuffer → speaker
```

**Critical:** AudioContext must use browser's native sample rate (usually 48kHz). Forcing 24kHz causes silent buffers in Chrome. Use `downsample()` to convert to the API's 24kHz rate.

---

## Technical Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix primitives)
- **Octokit** — GitHub API client (browser-compatible)
- **Web Speech API** — voice input (browser-native)
- **OpenAI API** — direct fetch calls

No backend required. Static hosting (GitHub Pages, Vercel, Netlify) works fine.

---

## Repo Style Instructions

When writing content, AI checks for instruction files in parent directories:

- `AGENTS.md` — agent behavior, tone, formatting rules
- `STYLE.md` — writing style guide
- `README.md` — context about the folder's purpose

This ensures generated content matches the conventions of that part of the repository.

---

## Setup Guide

### For People New to GitHub

<details>
<summary><strong>Step 1: Create a GitHub Account</strong></summary>

1. Go to [github.com](https://github.com)
2. Click "Sign up"
3. Choose a username, enter your email, create a password
4. Verify your email address

</details>

<details>
<summary><strong>Step 2: Create a Repository</strong></summary>

1. Log into GitHub
2. Click **+** → "New repository"
3. Name it (e.g., `notes`, `brain`, `knowledge`)
4. Choose **Private**
5. Check "Add a README file"
6. Click "Create repository"

</details>

<details>
<summary><strong>Step 3: Create a Personal Access Token</strong></summary>

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Fine-grained token"
3. Name: "ai-memory"
4. Repository access: select your notes repo
5. Permissions: Contents (read/write)
6. Generate and **copy immediately**

</details>

### For People New to OpenAI

<details>
<summary><strong>Getting an API Key</strong></summary>

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to API Keys → "Create new secret key"
4. Copy immediately

**Cost:** Pay-per-use. Memory capture typically costs pennies per session.

</details>

---

## Development

```bash
cd ai-memory
npm install
npm run dev
```

Dev server: http://localhost:3075 (also accessible on LAN)

---

## Status

| Component | Status |
|-----------|--------|
| Project scaffold | ✅ Done |
| Voice interface design | ✅ Done (port from whiteboard) |
| Credentials UI | 🔲 Todo |
| Repository selection | 🔲 Todo |
| Scope selection | 🔲 Todo |
| Topic matching | 🔲 Todo |
| Voice input (pipeline) | 🔲 Todo — port `VoiceAgent` |
| Voice input (realtime) | 🔲 Todo — port `ConversationAgent` |
| Content capture | 🔲 Todo |
| AI processing | 🔲 Todo |
| Result preview | 🔲 Todo |
| GitHub commit | 🔲 Todo |

---

## Why This Exists

Most note apps lock your data in proprietary formats. Most AI assistants keep conversations on their servers. This gives you:

- **Your data in your repo** — plain markdown, forever yours
- **Version history** — git tracks every change
- **AI assistance** — without giving up ownership
- **No vendor lock-in** — switch providers anytime
