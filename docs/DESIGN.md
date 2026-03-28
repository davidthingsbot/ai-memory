# AI-Memory v2: Repository-Centric Design

**Status:** Draft  
**Author:** DavidBot (design spec)  
**Date:** 2026-03-28

---

## Executive Summary

This document describes a complete UI redesign of ai-memory from a vertical "capsule" flow to a **repository-centric** interface. The current design requires users to scroll through sequential sections; the new design puts the repository browser front-and-center as the primary workspace, with supporting UI as overlays, drawers, and panels.

---

## Current State Analysis

### Existing Architecture

```
┌─────────────────────────────────────────┐
│           Current Capsule Flow          │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │ 1. Credentials (API keys)       │    │
│  └─────────────────────────────────┘    │
│               ↓                         │
│  ┌─────────────────────────────────┐    │
│  │ 2. Model Selection              │    │
│  └─────────────────────────────────┘    │
│               ↓                         │
│  ┌─────────────────────────────────┐    │
│  │ 3. Repository Selection         │    │
│  └─────────────────────────────────┘    │
│               ↓                         │
│  ┌─────────────────────────────────┐    │
│  │ 4. Repository Browser           │    │
│  │    - Tree view (compact)        │    │
│  │    - File preview               │    │
│  └─────────────────────────────────┘    │
│               ↓                         │
│  ┌─────────────────────────────────┐    │
│  │ 5. Content Editor               │    │
│  │    - Input stage                │    │
│  │    - Generation                 │    │
│  │    - Preview + revision         │    │
│  │    - Commit                     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Problems with Current Design

1. **Context switching:** Users scroll between browsing and editing
2. **Cramped browser:** Tree view limited to ~200px height
3. **Hidden state:** Can't see pending changes while browsing
4. **Linear workflow:** Forces step-by-step even when context is clear
5. **Setup overhead:** API keys always visible, taking up space

---

## New Design: Repository-Centric

### Core Philosophy

The repository IS the interface. Users should feel like they're inside their repo, not using a tool that connects to it.

### Three-Panel Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚙️ Setup Drawer (collapsed by default after first run)            │
├────────────────────────────────────────────────────────┬────────────┤
│                                                        │            │
│                   BROWSER PANEL                        │   COMMIT   │
│                   (main workspace)                     │   PANEL    │
│  ┌────────────────────────────────────────────────┐   │            │
│  │ 📁 Directory Listing                           │   │  Staged:   │
│  │ ├── 📁 docs/                                   │   │  - foo.md  │
│  │ │   ├── 📄 api.md                             │   │  - bar.md  │
│  │ │   └── 📄 guide.md                           │   │            │
│  │ ├── 📁 src/                                    │   │  [Commit]  │
│  │ └── 📄 README.md                   [🎤 Voice] │   │            │
│  ├────────────────────────────────────────────────┤   │            │
│  │ 📄 File Preview                    [📝][👁️]   │   │            │
│  │                                                │   │            │
│  │ # README                                       │   │            │
│  │                                                │   │            │
│  │ This is the project documentation...          │   │            │
│  │                                                │   │            │
│  │ [+ Insert Section] [✏️ Modify] [🖼️ Add Image] │   │            │
│  └────────────────────────────────────────────────┘   │            │
│                                                        │            │
└────────────────────────────────────────────────────────┴────────────┘

                    ┌─────────────────────┐
                    │    PROMPT MODAL     │
                    │ (triggered by ops)  │
                    │                     │
                    │  What do you want?  │
                    │  [🎤] [___________] │
                    │                     │
                    │  AI-generated plan: │
                    │  [editable]         │
                    │                     │
                    │  [Cancel] [Execute] │
                    └─────────────────────┘
```

---

## Panel Specifications

### 1. Setup Drawer

**Purpose:** One-time configuration, then hide.

**Behavior:**
- First visit: Drawer is open, prompts for API keys
- After keys saved: Drawer auto-collapses to icon/button
- Click gear icon to re-open
- Contains: OpenAI key, GitHub PAT, Brave key (optional), repo selector, model selector

**State Persistence:**
- Keys in localStorage (existing behavior)
- Drawer collapsed state in localStorage

**Component:** `SetupDrawer`
```tsx
interface SetupDrawerProps {
  isOpen: boolean
  onToggle: () => void
  onReady: () => void // called when all required fields present
}
```

**Wire-frame:**
```
┌──────────────────────────────────────────┐
│ ⚙️ Setup                           [✕]  │
├──────────────────────────────────────────┤
│ OpenAI API Key                           │
│ [••••••••••••••••••••••] ✓              │
│                                          │
│ GitHub PAT                               │
│ [••••••••••••••••••••••] ✓              │
│                                          │
│ Brave Search (optional)                  │
│ [________________________]               │
│                                          │
│ Repository                               │
│ [▾ davidthings/ai-memory          ]     │
│                                          │
│ Model                                    │
│ ( ) GPT-5.2  (•) GPT-5  ( ) GPT-4o      │
└──────────────────────────────────────────┘
```

---

### 2. Browser Panel

**Purpose:** Primary workspace. Navigate, view, and initiate operations.

**Sub-components:**

#### 2.1 Directory Listing

**Layout:** Dense, multi-column for wide screens
- Truncate long filenames with ellipsis
- Folders first, alphabetical
- Current path as clickable breadcrumb
- Click folder → expand/navigate
- Click file → preview below

**Features:**
- Search bar (existing, improved)
- Voice navigation button
- Keyboard navigation (↑↓ arrows, Enter to open)

**Wire-frame:**
```
┌─────────────────────────────────────────────────────────┐
│ 🏠 > src > components >                    [🔍 Search] │
├─────────────────────────────────────────────────────────┤
│ 📁 ui/          📄 App.tsx        📄 MicButton.tsx     │
│ 📄 Browser.tsx  📄 Content.tsx    📄 Preview.tsx       │
│ 📄 Commit.tsx   📄 Modal.tsx      📄 Setup.tsx         │
│ 📄 Voice.tsx    📄 Working.tsx                         │
└─────────────────────────────────────────────────────────┘
```

#### 2.2 File Preview

**Layout:** Below directory listing, takes remaining space
- Starts with README.md if present
- Mode toggle: Rendered / Raw / Edit
- Markdown: react-markdown rendering
- Code: Syntax highlighting (Shiki or Prism)
- Mermaid: Rendered diagrams
- ASCII art: Monospace preservation

**Contextual Operations (toolbar or right-click):**
- **New Folder** - create directory
- **New File** - create file (triggers prompt modal)
- **Insert Section** - add content at cursor/end
- **Modify Selection** - change selected text
- **Add Image** - upload and insert image

**Wire-frame:**
```
┌─────────────────────────────────────────────────────────┐
│ 📄 README.md                   [Rendered ▾] [📝 Edit]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ # ai-memory                                             │
│                                                         │
│ An experiment in AI-assisted knowledge capture.         │
│                                                         │
│ ## What This Is                                         │
│                                                         │
│ This is an **experimental app** exploring several       │
│ ideas at once...                                        │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│ [+ Insert] [✏️ Modify Selection] [🖼️ Image] [🗑️ Delete]│
└─────────────────────────────────────────────────────────┘
```

---

### 3. Commit Panel

**Purpose:** Stage, review, and push changes.

**Behavior:**
- Shows when there are pending changes
- Can be slide-in from right or always visible on wide screens
- Displays diffs in unified format
- Auto-generated commit message (editable)
- Push button

**Wire-frame:**
```
┌────────────────────────┐
│ 📤 Changes        (2)  │
├────────────────────────┤
│ ✓ docs/api.md          │
│   +15 -3 lines         │
│                        │
│ ✓ README.md            │
│   +5 -0 lines          │
├────────────────────────┤
│ Commit message:        │
│ ┌────────────────────┐ │
│ │ Add API docs for   │ │
│ │ authentication     │ │
│ └────────────────────┘ │
│                        │
│ [ Discard ] [ Commit ] │
└────────────────────────┘
```

---

### 4. Prompt Modal

**Purpose:** Two-stage prompt flow for AI operations.

**Trigger:** Any operation button (Insert, Modify, New File, etc.)

**Stage 1: Describe Intent**
- "What do you want to add/change?"
- Voice or text input
- Simple, natural language

**Stage 2: AI Plan**
- AI generates structured prompt/plan
- User can edit before execution
- Shows: action, location, approach

**Stage 3: Execution**
- AI makes changes
- Progress in WorkingBox style
- Returns to browser with changes highlighted
- Changes are staged (not committed yet)

**Wire-frame:**
```
┌───────────────────────────────────────────────────────┐
│ Insert Section in README.md                     [✕]   │
├───────────────────────────────────────────────────────┤
│                                                       │
│ Step 1: What do you want to add?                      │
│                                                       │
│ [🎤] [Add a section about error handling and_____]   │
│      [common debugging patterns                  ]   │
│                                                       │
│                               [Skip] [Generate Plan]  │
├───────────────────────────────────────────────────────┤
│                                                       │
│ Step 2: AI-Generated Plan                             │
│                                                       │
│ ┌───────────────────────────────────────────────────┐ │
│ │ **Action:** Insert new section                    │ │
│ │ **Location:** After "Technical Stack" section     │ │
│ │ **Content outline:**                              │ │
│ │ - Error handling overview                         │ │
│ │ - Common error types                              │ │
│ │ - Debugging workflow                              │ │
│ │ - Example error scenarios                         │ │
│ └───────────────────────────────────────────────────┘ │
│                                                       │
│ Edit the plan above or accept as-is.                  │
│                                                       │
│                         [Back] [Cancel] [⚡ Execute]  │
└───────────────────────────────────────────────────────┘
```

---

## Voice Interface

### Voice Navigation (Browser Panel)

**Trigger:** Voice button in directory header or wake word (optional)

**Commands:**
- "Open src folder" → expand and navigate to src/
- "Show package.json" → select and preview file
- "Go back" / "Go up" → navigate to parent
- "New file called utils.ts" → trigger new file modal
- "Search for authentication" → run search
- "Edit this file" → switch to edit mode

**Implementation:** 
- Whisper transcription (existing)
- Simple intent parser or small LLM call for command extraction
- Visual feedback: command recognized → action taken

### Voice Input (Prompt Modal)

**Reuse existing:** MicButton + real-time transcription hook
- Already supports tap-to-toggle and continuous transcription
- Insert at cursor position

---

## Multi-Format Support

### Markdown

**View modes:**
1. **Rendered** (default) - react-markdown with GFM
2. **Raw** - Monospace, syntax highlighted
3. **Edit** - Monaco editor or textarea with preview

**Features:**
- Live preview while editing
- WYSIWYG optional (future)
- LaTeX support via KaTeX plugin

### Code Files

**Syntax highlighting:** Shiki (more languages, better themes) or Prism
- Theme matching app light/dark mode
- Line numbers optional
- Copy button

**Edit mode:** Monaco editor recommended
- IntelliSense-lite (bracket matching, auto-indent)
- Vim keybindings optional (future)

### Diagrams

**Mermaid:**
- Detect ```mermaid code blocks
- Render inline preview
- Click to expand fullscreen
- Edit source in raw mode

**ASCII Art:**
- Detect by context (code blocks in certain locations)
- Preserve monospace formatting
- No attempt to "interpret"

---

## Component Architecture

```
App
├── SetupDrawer
│   ├── CredentialsForm
│   ├── RepoSelector
│   └── ModelSelector
│
├── BrowserPanel
│   ├── DirectoryListing
│   │   ├── Breadcrumb
│   │   ├── SearchBar
│   │   ├── VoiceNavButton
│   │   └── FileGrid / FileTree
│   │
│   ├── FilePreviewer
│   │   ├── PreviewHeader (filename, mode toggle)
│   │   ├── MarkdownRenderer
│   │   ├── CodeRenderer
│   │   ├── MermaidRenderer
│   │   └── OperationsToolbar
│   │
│   └── VoiceNavigator (handles commands)
│
├── CommitPanel
│   ├── StagedFilesList
│   ├── DiffViewer
│   ├── CommitMessageInput
│   └── CommitActions
│
├── PromptModal
│   ├── IntentInput (voice + text)
│   ├── PlanPreview (editable)
│   ├── ExecutionProgress (WorkingBox)
│   └── ModalActions
│
└── Shared
    ├── MicButton (existing)
    ├── WorkingBox (existing)
    └── Dialog (existing shadcn)
```

---

## State Management

### Current State (v1)

Local state with `useState` in App.tsx, props drilling.

### Recommended for v2

**Option A: Zustand (recommended)**
- Minimal boilerplate
- Good TypeScript support
- Persistent middleware for localStorage

**Option B: React Context + useReducer**
- No external deps
- More verbose
- Fine for this scale

### Store Structure

```typescript
interface AppStore {
  // Setup
  credentials: {
    openai: string | null
    github: string | null
    brave: string | null
  }
  selectedRepo: Repository | null
  selectedModel: string
  setupComplete: boolean
  
  // Browser
  currentPath: string
  selectedFile: string | null
  fileContent: string | null
  viewMode: 'rendered' | 'raw' | 'edit'
  searchQuery: string
  
  // Changes
  pendingChanges: ChangeSet | null
  stagedFiles: string[]
  
  // UI
  setupDrawerOpen: boolean
  commitPanelOpen: boolean
  promptModalOpen: boolean
  promptModalOperation: Operation | null
  
  // Actions
  navigateTo: (path: string) => void
  selectFile: (path: string) => void
  stageChanges: (changes: ChangeSet) => void
  commit: () => Promise<void>
  // ... etc
}
```

---

## User Flows

### Flow 1: First Visit

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐
│  Land   │ ──▶ │ Setup Open  │ ──▶ │ Enter Keys   │
│         │     │ (mandatory) │     │ Pick Repo    │
└─────────┘     └─────────────┘     └──────────────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │ Setup Closes │
                                    │ Browser Shows│
                                    │ README.md    │
                                    └──────────────┘
```

### Flow 2: Add Content to Existing File

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Browse Repo  │ ──▶ │ Click File   │ ──▶ │ Preview File │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Click Insert │ ──▶ │ Prompt Modal │ ──▶ │ Describe     │
│ Section      │     │ Opens        │     │ Intent       │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ AI Generates │ ──▶ │ Review/Edit  │ ──▶ │ Execute      │
│ Plan         │     │ Plan         │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Changes      │ ──▶ │ Commit Panel │ ──▶ │ Write Msg    │
│ Staged       │     │ Shows Diff   │     │ Push         │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Flow 3: Voice Navigation

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Click Voice  │ ──▶ │ Say "Open    │ ──▶ │ src/ folder  │
│ Button       │     │ src folder"  │     │ expands      │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────────────────────────┐
│ Say "Show    │ ──▶ │ App.tsx selected and previewed  │
│ App.tsx"     │     └──────────────────────────────────┘
└──────────────┘
```

---

## Technical Considerations

### Libraries

| Purpose | Current | Recommended |
|---------|---------|-------------|
| UI Components | shadcn/ui | Keep (excellent) |
| Markdown | react-markdown | Keep, add plugins |
| Syntax Highlighting | None | **Shiki** or Prism |
| Code Editor | None | **Monaco** (VS Code) |
| Diagrams | None | **mermaid** |
| State | useState | **Zustand** |
| File Icons | lucide | Keep, maybe add file-icons |
| Diff View | None | **react-diff-viewer-continued** |

### New Dependencies

```bash
npm install zustand shiki mermaid @monaco-editor/react react-diff-viewer-continued
```

### Performance Considerations

1. **Large repos:** Virtualize directory listing (react-window)
2. **Big files:** Lazy load content, pagination for huge files
3. **Monaco:** Load async, show lightweight fallback first
4. **Mermaid:** Render in web worker if complex

### Responsive Design

**Breakpoints:**
- **Mobile (<768px):** Stack panels, swipe between views
- **Tablet (768-1024px):** Browser full width, panels as drawers
- **Desktop (>1024px):** Side-by-side layout as shown

---

## Migration Strategy

### Phase 1: Restructure Layout (Week 1)

1. Create new `SetupDrawer` component
2. Refactor `RepoBrowser` into `BrowserPanel` + `DirectoryListing` + `FilePreviewer`
3. Create `CommitPanel` shell
4. New top-level layout with panels

### Phase 2: Operations & Modal (Week 2)

1. Create `PromptModal` with two-stage flow
2. Move generation logic from ContentEditor
3. Wire operations to modal
4. Staged changes state management

### Phase 3: Enhanced Rendering (Week 3)

1. Add Shiki for syntax highlighting
2. Add Mermaid rendering
3. Monaco editor for edit mode
4. Diff viewer for commit panel

### Phase 4: Voice Navigation (Week 4)

1. Voice command parser
2. Navigation actions
3. Visual feedback

### Phase 5: Polish (Week 5)

1. Responsive design
2. Keyboard shortcuts
3. Performance optimization
4. Error handling

---

## Open Questions / Decisions Needed

### UX Decisions

1. **Commit panel visibility:**
   - Always visible (GitHub Desktop style)?
   - Slide-in when changes exist?
   - Route to separate page?

2. **Edit mode:**
   - Inline in preview (WYSIWYG-ish)?
   - Dedicated editor panel?
   - Replace preview entirely?

3. **Multi-file operations:**
   - Generate content for multiple files at once?
   - Batch commits or one at a time?

4. **Keyboard shortcuts:**
   - `Cmd+K` for command palette?
   - `Cmd+S` to stage?
   - Vim-style navigation?

### Technical Decisions

1. **Monaco vs lightweight:**
   - Monaco is ~5MB bundle
   - Could use CodeMirror 6 (lighter) or simple textarea
   - Decision: Start with textarea + syntax display, add Monaco later

2. **State management:**
   - Zustand is recommended but adds dependency
   - Could stick with Context for now
   - Decision: Start with Context, migrate to Zustand if complex

3. **Voice command parsing:**
   - Simple regex matching?
   - Small LLM call for NLU?
   - Decision: Start with regex, upgrade if needed

---

## Appendix: Component Signatures

### SetupDrawer

```tsx
interface SetupDrawerProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

function SetupDrawer({ isOpen, onOpenChange }: SetupDrawerProps) {
  // Credentials, repo selector, model selector
  // Calls onOpenChange(false) when all required fields filled
}
```

### BrowserPanel

```tsx
interface BrowserPanelProps {
  repoName: string
  onOperationTrigger: (op: Operation) => void
  onFileSelect: (path: string) => void
}

type Operation = 
  | { type: 'insert'; path: string; position?: number }
  | { type: 'modify'; path: string; selection: { start: number; end: number; text: string } }
  | { type: 'new-file'; directory: string }
  | { type: 'new-folder'; directory: string }
  | { type: 'add-image'; path: string }
```

### CommitPanel

```tsx
interface CommitPanelProps {
  changes: ChangeSet | null
  onCommit: (message: string) => void
  onDiscard: () => void
}
```

### PromptModal

```tsx
interface PromptModalProps {
  isOpen: boolean
  operation: Operation | null
  onComplete: (changes: ChangeSet) => void
  onCancel: () => void
}
```

---

## Conclusion

This redesign fundamentally reorients the app around the repository browser as the primary workspace. Users spend most of their time in the browser, with AI operations triggered contextually through a streamlined prompt modal. The commit panel makes staging and pushing feel natural, similar to desktop Git clients.

The phased migration approach allows incremental delivery while maintaining a working app throughout development.

**Next Steps:**
1. Review and approve design
2. Create GitHub issues for each phase
3. Begin Phase 1 restructure
