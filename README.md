# ai-memory

A small standalone browser application for capturing memories and storing them in a GitHub repository — with AI assistance for research and writing.

## What It Does

You have thoughts, knowledge, and memories worth keeping. This app helps you capture them properly:

1. **Name a topic** — "How to prune apple trees" or "Bernard's contact info" or "That restaurant in Portland"
2. **Say what you know** — speak or type your rough notes
3. **AI researches and writes it up** — expands your notes with relevant context, formats it cleanly
4. **Stored in your GitHub repo** — in the right place, properly organized, version-controlled forever

Your memories live in *your* repository. Not someone else's cloud. Not a proprietary format. Just markdown files in git.

## How It Works (Browser-Based)

The entire app runs in your browser. No server required. Two APIs are called directly:

- **OpenAI API** — for the AI that helps research and write
- **GitHub API** — for reading/writing your memory repository

### JavaScript Libraries

GitHub provides official browser-compatible libraries:
- [`octokit`](https://github.com/octokit/octokit.js) — full GitHub API client, works in browsers
- Can create files, read directories, commit changes — all from JavaScript

For OpenAI:
- Direct `fetch()` calls to `api.openai.com` work fine from browsers
- Or use the [`openai`](https://github.com/openai/openai-node) library (browser-compatible builds available)

## Credentials Needed

You'll need two tokens:

| Token | Purpose | Where to Get It |
|-------|---------|-----------------|
| **OpenAI API Key** | Powers the AI assistant | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **GitHub PAT** | Read/write access to your memory repo | [github.com/settings/tokens](https://github.com/settings/tokens) |

### Are My Keys Safe?

**Yes, with a few important points:**

- Your keys are stored **only in your browser's local storage** — they never leave your machine except to call the respective APIs directly
- The app has **no backend server** — there's nowhere for keys to be sent
- API calls go directly from your browser to OpenAI/GitHub (HTTPS encrypted)
- You can verify this: the app is open source, and browser dev tools show exactly what network requests are made

**Optional protection:** A local password can encrypt your stored tokens. Even if someone accesses your browser, they'd need the password to decrypt the keys.

## Setup Guide

### For People New to GitHub

<details>
<summary><strong>Step 1: Create a GitHub Account</strong></summary>

1. Go to [github.com](https://github.com)
2. Click "Sign up"
3. Choose a username, enter your email, create a password
4. Verify your email address
5. Done — you have a GitHub account

</details>

<details>
<summary><strong>Step 2: Create a Repository for Your Memories</strong></summary>

1. Log into GitHub
2. Click the **+** in the top right → "New repository"
3. Name it something like `memories` or `notes` or `brain`
4. Choose **Private** (unless you want your memories public)
5. Check "Add a README file"
6. Click "Create repository"

You now have a place for your memories to live.

</details>

<details>
<summary><strong>Step 3: Create a Personal Access Token (PAT)</strong></summary>

This token lets the app read/write to your repository.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name like "ai-memory app"
4. Set expiration (90 days is fine, you can always make a new one)
5. Check these scopes:
   - `repo` (full control of private repositories)
6. Click "Generate token"
7. **Copy the token immediately** — you won't see it again

Keep this token secret. Anyone with it can access your repositories.

</details>

### For People New to OpenAI

<details>
<summary><strong>Getting an OpenAI API Key</strong></summary>

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to [API Keys](https://platform.openai.com/api-keys)
4. Click "Create new secret key"
5. Give it a name like "ai-memory"
6. **Copy the key immediately** — you won't see it again

**Cost:** OpenAI charges per use. For memory capture, costs are minimal — typically pennies per session. You can set spending limits in your OpenAI account settings.

**Safety:** Your API key is like a password. Don't share it. This app stores it only in your browser and calls OpenAI directly — no middleman.

</details>

## Workflow Example

```
You: "Let's add something about sourdough starters"

App: "Got it — I'll put this under food/baking/sourdough.md. What do you know?"

You: "Feeding ratio is 1:1:1 by weight. Feed every 24 hours at room temp,
      or weekly if refrigerated. Smells like acetone if hungry. 
      Can use discard for pancakes."

App: "Nice. Want me to research and expand this, or save as-is?"

You: "Research it — add stuff about hydration levels and troubleshooting"

App: [researches, writes it up properly, commits to repo]

"Done. Created food/baking/sourdough.md with sections on feeding,
 storage, hydration, troubleshooting, and discard recipes."
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Your Browser                      │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Voice     │  │     AI      │  │   GitHub    │  │
│  │   Input     │→ │  Research   │→ │   Commit    │  │
│  │  (Web API)  │  │  (OpenAI)   │  │  (Octokit)  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                         │                 │          │
│                         ▼                 ▼          │
│              ┌─────────────────────────────────┐    │
│              │   Local Storage (encrypted)     │    │
│              │   - OpenAI key                  │    │
│              │   - GitHub PAT                  │    │
│              │   - Repo settings               │    │
│              └─────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
   ┌─────────────┐                ┌─────────────┐
   │   OpenAI    │                │   GitHub    │
   │     API     │                │     API     │
   └─────────────┘                └─────────────┘
```

## Status

**Proof of concept exists** for voice interface, AI research, and content generation.

**TODO:**
- [ ] Browser-based GitHub integration (octokit)
- [ ] Token management UI with optional password protection
- [ ] Setup wizard for new users
- [ ] Topic → file path mapping logic
- [ ] Voice input (Web Speech API)
- [ ] Mobile-friendly UI

## Why This Exists

Most note-taking apps lock your data in proprietary formats. Most AI assistants keep your conversations on their servers. This approach gives you:

- **Your data in your repo** — plain markdown, forever accessible
- **Version history** — git tracks every change
- **AI assistance** — without giving up ownership
- **No vendor lock-in** — switch AI providers anytime, your notes stay put
