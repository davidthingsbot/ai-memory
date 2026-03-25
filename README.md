# ai-memory

An experiment in AI-assisted knowledge capture.

## What This Is

This is an **experimental app** exploring several ideas at once:

1. **AI as a collaborator inside the app** — not a chatbot you talk to, but an AI that works alongside you: exploring your repository, figuring out where content belongs, researching topics, and turning rough notes into polished documentation.

2. **Voice as a primary input method** — speak your thoughts instead of typing. Tap-to-toggle or hold-to-record. The app transcribes and works with whatever you say.

3. **A scrolling, linear task flow** — discrete sections ("capsules") that stack vertically. Each step builds on the previous. No hidden menus or modal dialogs — everything visible, everything in sequence.

4. **Repository research** — point the AI at a GitHub repo and let it explore: reading files, understanding structure, finding where new content fits. If the AI is good enough, it figures out not just *what* to write but *where* to put it.

5. **Your data stays yours** — plain markdown in your own GitHub repository. Version-controlled. No proprietary formats. No cloud lock-in.

The hypothesis: if you lower the friction enough (voice input, AI formatting, automatic commits), capturing knowledge becomes almost effortless.

---

## How It Works

The interface is a vertical scroll of sections. You work through them top to bottom.

### 1. 🔑 Credentials

Enter your API keys:

| Key | Purpose |
|-----|---------|
| **OpenAI API Key** | Powers transcription, AI research, and content generation |
| **GitHub PAT** | Read/write access to your repository |
| **Brave Search API Key** | *(optional)* Enables web research during content generation |

Keys are stored in your browser's localStorage. They never leave your device except to call the respective APIs directly. Once saved, keys are masked — you can clear and re-enter, but not read them back.

### 2. 🤖 Model Selection

Choose which OpenAI model to use:

- **GPT-5.2** — latest and most capable
- **GPT-5** — previous generation flagship
- **GPT-4o** — fast and capable
- **GPT-4o Mini** — cheapest option

Selection persists across sessions. All AI operations (transcription, topic finding, content generation) use this model.

### 3. 📁 Repository Selection

Pick which GitHub repository holds your knowledge. The app fetches your accessible repos via GitHub API. Selection persists — you don't re-pick every session.

### 4. 📂 Repository Browser

A tree view of your repository's structure. Click directories to expand them. Click files to preview their contents.

**Scope selection:** When you click a directory or file, it becomes your current "scope" — the AI will focus its search there. A green indicator shows your active scope.

**Text selection:** Select text within a file preview to scope even tighter — useful for saying "add content near this section."

Scope is optional. Skip it to let the AI search the whole repo.

### 5. 💬 Topic Finder

Describe what you want to document. Voice or text.

> "I want to add notes about sourdough starters"
> "Document the API authentication flow"
> "Add a section on error handling"

The AI explores your repository (within scope if set) using tools:

- **get_repo_structure** — understand the overall layout
- **list_directory** — see what's in a folder
- **read_file** — examine file contents
- **search_files** — find files by content
- **web_search** — research the topic online (if Brave key configured)

A **Working** box shows each step: what the AI is doing, which tools it's calling, what it's finding. You see the research happen in real time.

The AI returns:
- **Action:** Create new file, or update existing file
- **Path:** Where the content should go
- **Reasoning:** Why this location makes sense

Confirm, or describe a different topic to search again.

### 6. 📝 Content Editor

Once a location is confirmed, capture your content. Three stages:

**Input stage:**
- Speak or type your notes — rough, rambling, incomplete is fine
- Multiple recordings append together
- Or skip notes entirely if the topic itself is enough context

**Generation stage:**
- AI takes your notes (or just the topic) and generates polished markdown
- For existing files: analyzes document structure, decides where to insert
- Shows analysis, placement strategy, and location in a blue info box
- Working box shows token usage and generation progress

**Preview stage:**
- See the generated markdown
- Edit inline if needed
- Provide voice/text feedback for revisions ("add more examples", "make it shorter")
- Revise as many times as needed

### 7. ✅ Commit

When satisfied, commit directly to GitHub:
- AI generates an appropriate commit message
- Content is committed via GitHub API
- App resets to Topic Finder for your next entry

---

## The Working Box

A key feature: you see what the AI is doing. Every step is logged:

```
01  Starting topic analysis...
02  Scope: file → docs/api.md
03  Using cached repository structure
04  Thinking... (iteration 1/10)
05  AI requested 2 tool call(s)
06  📄 Reading file: docs/api.md
07  🌐 Web search: "REST API best practices"
08  Thinking... (iteration 2/10)
09  ✓ Found location: docs/api.md (update)
```

For content generation:
```
01  Target: docs/api.md
02  Action: Updating existing file
03  Loaded 2847 characters from existing file
04  Sending to AI (gpt-5.2)...
05  Tokens: 1247 in → 892 out
06  📊 Analysis: Document has Auth, Endpoints sections...
07  Strategy: expand_section
08  Location: "Endpoints"
```

This transparency helps you understand (and trust) what the AI is doing with your content.

---

## Voice Interface

All text inputs support voice. Red microphone buttons with two modes:

- **Tap to toggle** — tap once to start recording, tap again to stop
- **Hold to record** — hold the button while speaking, release when done

Status text shows current state: "Recording... tap to stop" or "Transcribing..."

Voice input uses OpenAI's Whisper for transcription. Same API key as everything else.

---

## Technical Stack

- **Vite** + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix primitives)
- **Octokit** — GitHub API client
- **OpenAI API** — transcription, chat completions with function calling

No backend. Static hosting works (GitHub Pages, Vercel, Netlify). All API calls go directly from your browser.

---

## Development

```bash
npm install
npm run dev
```

Dev server runs on port 3075 with HTTPS (required for microphone access on LAN).

Access locally: https://localhost:3075
Access from network: https://[your-ip]:3075

---

## Status

This is a working prototype. Current state:

| Feature | Status |
|---------|--------|
| Credentials management | ✅ Working |
| Model selection | ✅ Working |
| Repository selection | ✅ Working |
| Repository browser + scope | ✅ Working |
| Topic finding with AI tools | ✅ Working |
| Voice input (all fields) | ✅ Working |
| Content generation | ✅ Working |
| Update analysis + placement | ✅ Working |
| Preview + inline editing | ✅ Working |
| Feedback + revision loop | ✅ Working |
| GitHub commit | ✅ Working |
| Working box progress display | ✅ Working |
| Web search (Brave) | ✅ Working |

**Not yet implemented:**
- Realtime API voice (continuous conversation)
- Password encryption for stored keys
- Offline support

---

## Why This Exists

Note-taking apps trap your data. AI assistants keep your conversations on their servers. This experiment asks: what if you could have AI assistance while keeping full ownership?

Your memories live in *your* GitHub repo. Plain markdown. Version-controlled forever. The AI helps you write — but the words belong to you.
