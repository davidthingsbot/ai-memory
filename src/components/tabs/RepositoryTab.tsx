import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listDirectory, readFile, getFileAsDataUrl, searchRepo, type DirectoryEntry, type SearchResult } from '@/lib/github-tools'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { MicButton } from '@/components/MicButton'
import { BlinkingCursor } from '@/components/BlinkingCursor'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import { getSelectedRepo } from '@/components/RepoSelection'
import { findSelectionInRaw, findImageMarkdown, findCodeFenceBounds, findTableBounds, expandToBlockBoundaries } from '@/lib/selection-helpers'
import { getChangedLineNumbers, computeLineDiff } from '@/lib/line-diff'
import {
  FolderOpen, FileText, ChevronRight, Home,
  Loader2, Eye, Code, Edit3, Search, X,
  Plus, Pencil, Image, Save, FilePlus, FolderPlus, RotateCcw, GitBranch
} from 'lucide-react'

// Get character offset of a DOM position within a container's text nodes
function getTextOffsetInContainer(container: Node, targetNode: Node, offsetInTarget: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let offset = 0
  let node = walker.nextNode()
  while (node) {
    if (node === targetNode) return offset + offsetInTarget
    offset += (node.textContent || '').length
    node = walker.nextNode()
  }
  return offset
}

// Find raw-text offset from a preview-mode click.
// Uses Range.toString() to get visible text before cursor — works for both
// text-node and element-node cursors, which is critical in rendered markdown.
function getPreviewCursorOffset(sel: Selection, fileContent: string, container: Element): number | null {
  const range = sel.getRangeAt(0)

  // Build a range from the start of the container to the cursor position
  try {
    const preRange = document.createRange()
    preRange.setStart(container, 0)
    preRange.setEnd(range.startContainer, range.startOffset)
    const textBefore = preRange.toString()

    // Take the last few words as a search key
    const words = textBefore.trim().split(/\s+/).filter(w => w.length > 0)

    // Search for decreasing word chunks in fileContent
    for (let n = Math.min(words.length, 6); n >= 1; n--) {
      const search = words.slice(-n).join(' ')
      if (search.length < 3) continue
      const idx = fileContent.indexOf(search)
      if (idx >= 0) return idx + search.length
    }

    // Fallback: get text after cursor and search for that
    const postRange = document.createRange()
    postRange.setStart(range.startContainer, range.startOffset)
    postRange.setEnd(container, container.childNodes.length)
    const textAfter = postRange.toString()
    const afterWords = textAfter.trim().split(/\s+/).filter(w => w.length > 0)
    for (let n = Math.min(afterWords.length, 4); n >= 1; n--) {
      const search = afterWords.slice(0, n).join(' ')
      if (search.length < 3) continue
      const idx = fileContent.indexOf(search)
      if (idx >= 0) return idx
    }
  } catch {
    // Range operations can throw if nodes aren't in the same tree
  }

  return null
}


// Set DOM selection on a pre element from character offsets
function applySelectionToPre(pre: HTMLElement, start: number, end: number) {
  const sel = window.getSelection()
  if (!sel) return

  const range = document.createRange()
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
  let charCount = 0
  let startSet = false
  let node = walker.nextNode()

  while (node) {
    const len = (node.textContent || '').length
    if (!startSet && charCount + len >= start) {
      range.setStart(node, Math.min(start - charCount, len))
      startSet = true
    }
    if (startSet && charCount + len >= end) {
      range.setEnd(node, Math.min(end - charCount, len))
      sel.removeAllRanges()
      sel.addRange(range)
      scrollSelectionIntoView()
      return
    }
    charCount += len
    node = walker.nextNode()
  }
}

// Find a text string inside a DOM tree's text nodes
function findTextInDOM(container: Element, search: string): { node: Text; index: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const idx = (node.textContent || '').indexOf(search)
    if (idx >= 0) return { node: node as Text, index: idx }
    node = walker.nextNode()
  }
  return null
}

// Scroll the current browser selection into the visible area
function scrollSelectionIntoView() {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (rect.height === 0 && rect.width === 0) {
    // Collapsed caret — use getClientRects
    const rects = range.getClientRects()
    if (rects.length > 0) {
      const el = range.startContainer.parentElement
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return
    }
  }
  // Create a temporary span at the range to scroll to
  const span = document.createElement('span')
  range.insertNode(span)
  span.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  span.remove()
  // Restore selection (insertNode can split it)
  sel.removeAllRanges()
  sel.addRange(range)
}

// Apply a cursor offset to rendered preview DOM by searching for surrounding text
function applyOffsetToPreviewDOM(container: Element, fileContent: string, offset: number): boolean {
  const before = fileContent.slice(Math.max(0, offset - 60), offset)
  const after = fileContent.slice(offset, offset + 40)

  const words = before.trim().split(/\s+/)
  for (let n = Math.min(words.length, 5); n >= 1; n--) {
    const search = words.slice(-n).join(' ')
    if (search.length < 3) continue
    const found = findTextInDOM(container, search)
    if (found) {
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.setStart(found.node, Math.min(found.index + search.length, (found.node.textContent || '').length))
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        scrollSelectionIntoView()
      }
      return true
    }
  }

  const afterWords = after.trim().split(/\s+/)
  for (let n = Math.min(afterWords.length, 3); n >= 1; n--) {
    const search = afterWords.slice(0, n).join(' ')
    if (search.length < 3) continue
    const found = findTextInDOM(container, search)
    if (found) {
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.setStart(found.node, found.index)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        scrollSelectionIntoView()
      }
      return true
    }
  }
  return false
}

// Apply a text selection to rendered preview DOM
function applySelectionToPreviewDOM(container: Element, selText: string): boolean {
  const trimmed = selText.trim()
  if (!trimmed) return false

  const full = findTextInDOM(container, trimmed)
  if (full) {
    const sel = window.getSelection()
    if (sel) {
      const range = document.createRange()
      range.setStart(full.node, full.index)
      range.setEnd(full.node, full.index + trimmed.length)
      sel.removeAllRanges()
      sel.addRange(range)
      scrollSelectionIntoView()
    }
    return true
  }

  const words = trimmed.split(/\s+/)
  for (let n = Math.min(words.length, 4); n >= 1; n--) {
    const chunk = words.slice(0, n).join(' ')
    if (chunk.length < 3) continue
    const found = findTextInDOM(container, chunk)
    if (found) {
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.setStart(found.node, found.index)
        range.setEnd(found.node, Math.min(found.index + trimmed.length, (found.node.textContent || '').length))
        sel.removeAllRanges()
        sel.addRange(range)
        scrollSelectionIntoView()
      }
      return true
    }
  }
  return false
}

export function RepositoryTab() {
  const {
    selectedRepoFullName,
    currentPath, setCurrentPath,
    selectedFile, fileContent, selectFile, clearSelectedFile, setFileContent,
    viewMode, setViewMode,
    openPromptModal,
    setActiveTab,
    addPendingChange,
    darkMode,
    selectedBranch,
    fileRefreshCounter,
  } = useAppStore()
  
  // Guard: redirect to setup if no repo selected
  if (!selectedRepoFullName) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Repository Selected</h2>
        <p className="text-muted-foreground mb-4">
          Please complete the setup first.
        </p>
        <Button onClick={() => setActiveTab('setup')}>
          Go to Setup
        </Button>
      </div>
    )
  }
  
  // Directory state
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchBaseTextRef = useRef<string>('')
  
  // Editor dirty state
  const [editorDirty, setEditorDirty] = useState(false)
  const [originalContent, setOriginalContent] = useState<string | null>(null)

  // Image preview state (for binary image files)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)

  // Track file SHA to detect remote changes
  const fileShaRef = useRef<string | null>(null)

  // Remember last-viewed file per directory
  const dirFileHistory = useRef<Map<string, string>>(new Map())
  const suppressAutoSelect = useRef(false)
  
  // Cursor/selection as raw-text offsets — shared across view modes
  const [cursorOffset, setCursorOffset] = useState<number | null>(null)
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number; text: string } | null>(null)
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const rawPreRef = useRef<HTMLElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const selectedMediaRef = useRef<HTMLElement | null>(null)

  // Ref always holds latest position — avoids stale closures in onMount/effects
  const positionRef = useRef({ cursor: cursorOffset, selection: selectionRange })
  positionRef.current = { cursor: cursorOffset, selection: selectionRange }

  // Derive button states
  const hasSelection = selectionRange !== null
  const hasCursor = cursorOffset !== null || hasSelection
  
  // Voice transcription for search
  const searchTranscription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      const base = searchBaseTextRef.current
      const before = base.slice(0, insertPos)
      const after = base.slice(insertPos)
      setSearchQuery(before + newText + after)
    },
  })
  
  // Load directory
  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const results = await listDirectory(path)
      results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(results)

      // Check if the currently viewed file has changed remotely
      if (selectedFile && fileShaRef.current && !editorDirty) {
        const entry = results.find(e => e.path === selectedFile)
        if (entry?.sha && entry.sha !== fileShaRef.current) {
          // File changed remotely — silently reload
          const isBinary = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|pdf)$/i.test(selectedFile)
          if (isBinary) {
            const dataUrl = await getFileAsDataUrl(selectedFile)
            selectFile(selectedFile, '')
            setImageDataUrl(dataUrl)
          } else {
            const file = await readFile(selectedFile)
            if (file) {
              selectFile(selectedFile, file.content)
              setOriginalContent(file.content)
              fileShaRef.current = file.sha
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }, [selectedFile, editorDirty, selectFile])

  // Keep a stable ref so the effect doesn't re-fire when loadDirectory's deps change
  const loadDirectoryRef = useRef(loadDirectory)
  loadDirectoryRef.current = loadDirectory

  // Load directory only when the path actually changes
  useEffect(() => {
    loadDirectoryRef.current(currentPath)
  }, [currentPath])
  
  // Reload file content if we have a selectedFile but no content (e.g., after page refresh)
  useEffect(() => {
    if (selectedFile && !fileContent && !imageDataUrl) {
      handleSelectFile(selectedFile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, fileContent])

  // Re-read current file after a commit (fileRefreshCounter bumps)
  useEffect(() => {
    if (fileRefreshCounter > 0 && selectedFile && !editorDirty) {
      const isBinary = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|pdf)$/i.test(selectedFile)
      if (isBinary) {
        getFileAsDataUrl(selectedFile).then(dataUrl => {
          if (dataUrl) { selectFile(selectedFile, ''); setImageDataUrl(dataUrl) }
        }).catch(() => {})
      } else {
        readFile(selectedFile).then(file => {
          if (file) {
            selectFile(selectedFile, file.content)
            setOriginalContent(file.content)
            fileShaRef.current = file.sha
            setEditorDirty(false)
          }
        }).catch(() => {})
      }
      // Also refresh directory listing
      loadDirectoryRef.current(currentPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileRefreshCounter])

  // Poll for remote changes every 30s — directory listing + current file
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Refresh directory listing
        loadDirectoryRef.current(currentPath)

        // Refresh current file if not dirty
        if (selectedFile && !editorDirty) {
          const isBinary = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|pdf)$/i.test(selectedFile)
          if (!isBinary) {
            const file = await readFile(selectedFile)
            if (file && fileShaRef.current && file.sha !== fileShaRef.current) {
              console.log(`[poll] File changed remotely: ${selectedFile}`)
              selectFile(selectedFile, file.content)
              setOriginalContent(file.content)
              fileShaRef.current = file.sha
            }
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, selectedFile, editorDirty])

  // Auto-select file when entering a directory:
  // 1. Last-viewed file in this directory
  // 2. README.md
  // 3. File matching directory name (e.g. docs/ → docs.md)
  // 4. First file in the listing
  useEffect(() => {
    if (suppressAutoSelect.current) return
    if (selectedFile || entries.length === 0) return
    const files = entries.filter(e => e.type === 'file')
    if (files.length === 0) return

    // 1. Previously viewed file
    const remembered = dirFileHistory.current.get(currentPath)
    if (remembered) {
      const found = files.find(e => e.path === remembered)
      if (found) { handleSelectFile(found.path); return }
    }

    // 2. README
    const readme = files.find(e => e.name.toLowerCase() === 'readme.md')
    if (readme) { handleSelectFile(readme.path); return }

    // 3. File matching directory name
    const dirName = currentPath.split('/').filter(Boolean).pop()
    if (dirName) {
      const match = files.find(e => {
        const base = e.name.replace(/\.[^.]+$/, '').toLowerCase()
        return base === dirName.toLowerCase()
      })
      if (match) { handleSelectFile(match.path); return }
    }

    // 4. First file
    handleSelectFile(files[0].path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, selectedFile, currentPath])
  
  // Handle search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    try {
      const results = await searchRepo(searchQuery.trim())
      setSearchResults(results)
    } catch {
      setSearchResults([])
    }
    setIsSearching(false)
  }, [searchQuery])
  
  // Navigate to directory
  const handleNavigateDir = useCallback((path: string) => {
    // Warn if there are unsaved changes
    if (editorDirty) {
      const discard = confirm('You have unsaved changes. Discard them?')
      if (!discard) return
    }
    // Remember current file for this directory
    if (selectedFile) {
      dirFileHistory.current.set(currentPath, selectedFile)
    }
    clearSelectedFile()
    setEditorDirty(false)
    setOriginalContent(null)
    setImageDataUrl(null)
    fileShaRef.current = null
    setCursorOffset(null)
    setSelectionRange(null)
    if (path !== currentPath) {
      suppressAutoSelect.current = false
      setEntries([])
      setCurrentPath(path)
    } else {
      // Same directory — suppress auto-select but refetch entries for updates
      suppressAutoSelect.current = true
      loadDirectory(path)
    }
  }, [setCurrentPath, clearSelectedFile, editorDirty, selectedFile, currentPath])
  
  // Select file — always fetches fresh; detects remote changes via SHA
  const handleSelectFile = useCallback(async (path: string) => {
    suppressAutoSelect.current = false
    if (editorDirty && selectedFile !== path) {
      const discard = confirm('You have unsaved changes. Discard them?')
      if (!discard) return
    }

    const isBinary = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|pdf)$/i.test(path)

    try {
      if (isBinary) {
        const dataUrl = await getFileAsDataUrl(path)
        selectFile(path, '')
        setOriginalContent(null)
        setImageDataUrl(dataUrl)
        fileShaRef.current = null
      } else {
        const file = await readFile(path)
        if (file) {
          // If re-selecting the same file, check if it changed remotely
          if (path === selectedFile && fileShaRef.current && fileShaRef.current !== file.sha && editorDirty) {
            const reload = confirm('This file has been updated remotely. Reload and lose local changes?')
            if (!reload) return
          }
          selectFile(path, file.content)
          setOriginalContent(file.content)
          setImageDataUrl(null)
          fileShaRef.current = file.sha
        }
      }
      setEditorDirty(false)
      setCursorOffset(null)
      setSelectionRange(null)
    } catch {
      setError('Failed to load file')
    }
  }, [selectFile, editorDirty, selectedFile])
  
  // Breadcrumb navigation
  const pathSegments = currentPath ? currentPath.split('/') : []
  
  // Build breadcrumb items
  const breadcrumbs = [
    { label: selectedRepoFullName?.split('/')[1] || 'root', path: '' },
    ...pathSegments.map((segment, i) => ({
      label: segment,
      path: pathSegments.slice(0, i + 1).join('/')
    }))
  ]
  
  // Handle editor content change
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setFileContent(value)
      setEditorDirty(value !== originalContent)
    }
  }, [setFileContent, originalContent])
  
  // Monaco decoration IDs for margin indicators
  const decorationsRef = useRef<string[]>([])

  // Update margin indicators when content changes in edit mode
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || viewMode !== 'edit' || !originalContent || !fileContent) {
      return
    }
    if (fileContent === originalContent) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [])
      return
    }
    const { added, removed } = getChangedLineNumbers(originalContent, fileContent)
    const decorations: import('monaco-editor').editor.IModelDeltaDecoration[] = []
    for (const lineNum of added) {
      decorations.push({
        range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: 1 },
        options: { isWholeLine: true, linesDecorationsClassName: 'line-added-margin' },
      })
    }
    for (const lineNum of removed) {
      decorations.push({
        range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: 1 },
        options: { isWholeLine: true, linesDecorationsClassName: 'line-removed-margin' },
      })
    }
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations)
  }, [fileContent, originalContent, viewMode])

  // Suppress cursor events during programmatic position changes
  const suppressCursorRef = useRef(false)

  // Handle Monaco editor mount — set ref, focus, and track cursor
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    editor.focus()

    editor.onDidChangeCursorSelection(() => {
      if (suppressCursorRef.current) return
      const sel = editor.getSelection()
      const m = editor.getModel()
      if (!sel || !m) return
      if (!sel.isEmpty()) {
        setSelectionRange({
          start: m.getOffsetAt(sel.getStartPosition()),
          end: m.getOffsetAt(sel.getEndPosition()),
          text: m.getValueInRange(sel),
        })
        setCursorOffset(null)
      } else {
        setCursorOffset(m.getOffsetAt(sel.getStartPosition()))
        setSelectionRange(null)
      }
    })
  }, [])
  
  // Track selection in preview/raw mode — capture as raw-text offsets
  const handleTextMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      setSelectionRange(null)
      setCursorOffset(null)
      return
    }

    const selectedText = sel.toString()
    const hasText = selectedText.trim().length > 0
    const range = sel.getRangeAt(0)

    if (viewMode === 'raw' && rawPreRef.current) {
      // Raw mode: offsets map directly to fileContent
      if (hasText) {
        const start = getTextOffsetInContainer(rawPreRef.current, range.startContainer, range.startOffset)
        const end = getTextOffsetInContainer(rawPreRef.current, range.endContainer, range.endOffset)
        setSelectionRange({ start, end, text: selectedText })
        setCursorOffset(null)
      } else {
        setCursorOffset(getTextOffsetInContainer(rawPreRef.current, range.startContainer, range.startOffset))
        setSelectionRange(null)
      }
    } else if (viewMode === 'preview' && fileContent) {
      // Preview mode: heuristic mapping to raw content
      if (hasText) {
        const mapped = findSelectionInRaw(selectedText, fileContent)
        if (mapped && mapped.start >= 0) {
          // Expand to include block framing (code fences, tables)
          const expanded = expandToBlockBoundaries(mapped.start, mapped.end, fileContent)
          setSelectionRange({ start: expanded.start, end: expanded.end, text: fileContent.slice(expanded.start, expanded.end) })
        } else if (mapped) {
          setSelectionRange({ start: mapped.start, end: mapped.end, text: selectedText.trim() })
        } else {
          setSelectionRange({ start: -1, end: -1, text: selectedText.trim() })
        }
        setCursorOffset(null)
      } else {
        setCursorOffset(getPreviewCursorOffset(sel, fileContent, previewContainerRef.current!))
        setSelectionRange(null)
      }
    }
  }, [viewMode, fileContent])

  // Highlight a media/block element with the selection indicator
  const highlightMediaEl = useCallback((el: HTMLElement) => {
    if (selectedMediaRef.current) selectedMediaRef.current.classList.remove('media-selected')
    el.classList.add('media-selected')
    selectedMediaRef.current = el
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  // Preview-specific mouseup: image clicks select whole tag; text selection
  // in code blocks / tables expands to include framing when selection covers most of the block
  const handlePreviewMouseUp = useCallback((e: React.MouseEvent) => {
    // Clear previous media highlight
    if (selectedMediaRef.current) {
      selectedMediaRef.current.classList.remove('media-selected')
      selectedMediaRef.current = null
    }

    if (!fileContent) { handleTextMouseUp(); return }

    const target = e.target as HTMLElement

    // Image click — select whole markdown tag
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement
      const originalSrc = img.getAttribute('data-original-src') || ''
      const alt = img.alt || ''
      const found = findImageMarkdown(originalSrc, alt, fileContent)
      if (found) {
        setSelectionRange({ start: found.start, end: found.end, text: fileContent.slice(found.start, found.end) })
        setCursorOffset(null)
        highlightMediaEl(target)
        return
      }
    }

    // Regular text handling (clicks, selections)
    handleTextMouseUp()

    // After text handler runs, check if expansion selected a whole table or code block.
    // If so, replace the text selection with a block highlight AND recalculate selectionRange
    // using the block element's content (the word-chunk search in handleTextMouseUp can
    // match earlier occurrences, e.g. "Chip" matching "Chips" in a preceding paragraph).
    if (fileContent) {
      const sel = window.getSelection()
      if (sel && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0)

        // Check if selection covers an entire table
        const tableEl = range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer.closest?.('table')
          : range.commonAncestorContainer.parentElement?.closest('table')
        if (tableEl) {
          const tableText = (tableEl.textContent || '').trim()
          const selText = sel.toString().trim()
          if (selText.length >= tableText.length * 0.7) {
            // Find table in raw content using a unique cell value
            const firstCell = tableEl.querySelector('th, td')
            const cellText = (firstCell?.textContent || '').trim()
            if (cellText) {
              // Search for this cell text only within pipe-delimited lines
              const lines = fileContent.split('\n')
              let offset = 0
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].trimStart().startsWith('|') && lines[i].includes(cellText)) {
                  const bounds = findTableBounds(offset, offset + lines[i].length, fileContent)
                  if (bounds) {
                    setSelectionRange({ start: bounds.start, end: bounds.end, text: fileContent.slice(bounds.start, bounds.end) })
                    setCursorOffset(null)
                  }
                  break
                }
                offset += lines[i].length + 1
              }
            }
            sel.removeAllRanges()
            highlightMediaEl((tableEl.closest('.overflow-x-auto') || tableEl) as HTMLElement)
            return
          }
        }

        // Check if selection covers an entire code block
        const ancestor = range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement
        const codeBlock = ancestor?.closest?.('pre, div.rounded-lg') as HTMLElement | null
        if (codeBlock && codeBlock.querySelector('code')) {
          const codeText = (codeBlock.textContent || '').trim()
          const selText = sel.toString().trim()
          if (selText.length >= codeText.length * 0.7) {
            // Find in raw content and expand to fences
            const idx = fileContent.indexOf(codeText)
            if (idx >= 0) {
              const bounds = findCodeFenceBounds(idx, idx + codeText.length, fileContent)
              if (bounds) {
                setSelectionRange({ start: bounds.start, end: bounds.end, text: fileContent.slice(bounds.start, bounds.end) })
                setCursorOffset(null)
              }
            }
            sel.removeAllRanges()
            highlightMediaEl(codeBlock)
            return
          }
        }
      }
    }
  }, [handleTextMouseUp, fileContent])
  
  // Apply stored position when switching view modes
  useEffect(() => {
    const { cursor, selection } = positionRef.current
    if (cursor === null && !selection) return

    if (viewMode === 'raw') {
      requestAnimationFrame(() => {
        if (rawPreRef.current) {
          const start = selection?.start ?? cursor
          const end = selection?.end ?? cursor
          if (start !== null && end !== null && start >= 0) {
            applySelectionToPre(rawPreRef.current, start, end)
          }
        }
      })
    } else if (viewMode === 'edit') {
      // Capture position NOW — Monaco init will fire cursor events that
      // overwrite positionRef before our retry can read it
      const savedCursor = cursor
      const savedSelection = selection
      // Suppress immediately so Monaco's default (1,1) doesn't clobber state
      suppressCursorRef.current = true
      let attempts = 0
      const tryApply = () => {
        const editor = editorRef.current
        const model = editor?.getModel()
        if (!editor || !model) {
          if (++attempts < 20) setTimeout(tryApply, 50)
          return
        }
        if (savedSelection && savedSelection.start >= 0) {
          const startPos = model.getPositionAt(savedSelection.start)
          const endPos = model.getPositionAt(savedSelection.end)
          editor.setSelection({
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          })
          editor.revealPositionInCenter(startPos)
        } else if (savedCursor !== null) {
          const pos = model.getPositionAt(savedCursor)
          editor.setPosition(pos)
          editor.revealPositionInCenter(pos)
        }
        editor.focus()
        suppressCursorRef.current = false
      }
      setTimeout(tryApply, 50)
    } else if (viewMode === 'preview') {
      setTimeout(() => {
        const container = previewContainerRef.current
        if (!container || !fileContent) return

        if (selection && selection.text) {
          const text = selection.text

          // Image markdown → highlight <img>
          if (/^!\[/.test(text)) {
            const srcMatch = text.match(/\]\(([^)]+)\)/)
            if (srcMatch) {
              const img = container.querySelector(`img[data-original-src="${CSS.escape(srcMatch[1])}"]`) as HTMLElement
              if (img) {
                highlightMediaEl(img)
                return
              }
            }
          }

          // Code fence → highlight code block container
          if (/^```/.test(text)) {
            // Extract code content between fences
            const codeMatch = text.match(/^```[^\n]*\n([\s\S]*?)\n?```$/)
            const codeContent = codeMatch ? codeMatch[1].trim() : text.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '').trim()
            if (codeContent) {
              // Find matching code block by searching text nodes in code elements
              const codeEls = container.querySelectorAll('code')
              for (const el of codeEls) {
                if ((el.textContent || '').trim() === codeContent) {
                  const wrapper = el.closest('div.rounded-lg') || el.closest('pre') || el.parentElement
                  if (wrapper) { highlightMediaEl(wrapper as HTMLElement); return }
                }
              }
            }
          }

          // Table markdown → highlight table wrapper
          if (/^\|/.test(text.trim())) {
            // Extract first cell content from the markdown table
            const cellMatch = text.match(/\|\s*([^|\n]+?)\s*\|/)
            if (cellMatch) {
              const cellText = cellMatch[1].trim()
              const cells = container.querySelectorAll('th, td')
              for (const cell of cells) {
                if ((cell.textContent || '').trim() === cellText) {
                  const tableWrapper = cell.closest('.overflow-x-auto') || cell.closest('table')
                  if (tableWrapper) { highlightMediaEl(tableWrapper as HTMLElement); return }
                }
              }
            }
          }

          // Regular text selection
          applySelectionToPreviewDOM(container, text)
        } else if (cursor !== null && cursor >= 0) {
          applyOffsetToPreviewDOM(container, fileContent, cursor)
        }
      }, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])
  
  // File type detection
  const isMarkdown = selectedFile?.endsWith('.md') || selectedFile?.endsWith('.mdx')
  const isImage = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif)$/i.test(selectedFile || '')
  const isPdf = /\.pdf$/i.test(selectedFile || '')
  const isBinaryPreview = isImage || isPdf

  // Map file extension to Monaco language
  const editorLanguage = (() => {
    const ext = selectedFile?.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      md: 'markdown', mdx: 'markdown',
      ts: 'typescript', tsx: 'typescript', mts: 'typescript',
      js: 'javascript', jsx: 'javascript', mjs: 'javascript',
      json: 'json', jsonc: 'json',
      css: 'css', scss: 'scss', less: 'less',
      html: 'html', htm: 'html', svg: 'xml', xml: 'xml',
      py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
      java: 'java', kt: 'kotlin', swift: 'swift',
      c: 'c', cpp: 'cpp', h: 'cpp', hpp: 'cpp',
      cs: 'csharp', php: 'php', sh: 'shell', bash: 'shell',
      sql: 'sql', yaml: 'yaml', yml: 'yaml', toml: 'ini',
      dockerfile: 'dockerfile', graphql: 'graphql',
    }
    return map[ext || ''] || 'plaintext'
  })()
  
  // Get base path for resolving relative links
  const basePath = selectedFile ? selectedFile.split('/').slice(0, -1).join('/') : ''

  // Compute AI context description
  const aiContext = (() => {
    const dir = currentPath || '/'
    if (!selectedFile) {
      return dir
    }
    if (selectionRange && selectionRange.text) {
      const preview = selectionRange.text.length > 60
        ? selectionRange.text.slice(0, 57) + '...'
        : selectionRange.text
      return `${selectedFile} selection: "${preview.replace(/\n/g, ' ')}"`
    }
    if (cursorOffset !== null && fileContent) {
      const line = fileContent.slice(0, cursorOffset).split('\n').length
      return `${selectedFile} line ${line}`
    }
    return selectedFile
  })()
  
  // Handle operations — pass position/selection to modal
  const handleInsert = useCallback(() => {
    if (selectedFile) {
      openPromptModal({
        type: 'insert',
        path: selectedFile,
        position: cursorOffset ?? selectionRange?.end ?? undefined,
      })
    }
  }, [selectedFile, openPromptModal, cursorOffset, selectionRange])

  const handleModify = useCallback(() => {
    if (selectedFile) {
      openPromptModal({
        type: 'modify',
        path: selectedFile,
        selection: selectionRange || undefined,
      })
    }
  }, [selectedFile, openPromptModal, selectionRange])

  const handleAddImage = useCallback(() => {
    if (selectedFile) {
      openPromptModal({
        type: 'add-image',
        path: selectedFile,
        position: cursorOffset ?? selectionRange?.end ?? undefined,
      })
    }
  }, [selectedFile, openPromptModal, cursorOffset, selectionRange])
  
  // Save edited content as pending change
  const handleSave = useCallback(() => {
    if (selectedFile && fileContent && editorDirty) {
      addPendingChange({
        path: selectedFile,
        action: 'modify',
        content: fileContent,
        oldContent: originalContent || undefined,
      })
      setOriginalContent(fileContent)
      setEditorDirty(false)
    }
  }, [selectedFile, fileContent, editorDirty, originalContent, addPendingChange])

  // Revert file to original content from repo
  const handleRevert = useCallback(() => {
    if (selectedFile && originalContent !== null && editorDirty) {
      setFileContent(originalContent)
      setEditorDirty(false)
    }
  }, [selectedFile, originalContent, editorDirty, setFileContent])

  // Repo info for breadcrumb
  const repoInfo = getSelectedRepo()
  const branchName = selectedBranch || repoInfo?.default_branch || 'main'

  // Clear selection/cursor when clicking outside the file content area
  const handleOutsideClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Don't clear if clicking inside the file content area or its toolbar
    if (target.closest('[data-file-content]') || target.closest('[data-file-toolbar]')) return
    // Don't clear if clicking buttons/inputs
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) return
    // Clear selection and cursor
    if (cursorOffset !== null || selectionRange !== null) {
      setCursorOffset(null)
      setSelectionRange(null)
      window.getSelection()?.removeAllRanges()
      if (selectedMediaRef.current) {
        selectedMediaRef.current.classList.remove('media-selected')
        selectedMediaRef.current = null
      }
    }
  }, [cursorOffset, selectionRange])

  return (
    <div className="flex flex-col h-full" onMouseDown={handleOutsideClick}>
      {/* Directory Section */}
      <div className="border-b p-4 space-y-3">
        {/* Search */}
        <div className="flex gap-2 items-center">
          <MicButton
            recording={searchTranscription.isRecording}
            transcribing={searchTranscription.isConnecting}
            onRecordingChange={(recording) => {
              if (recording) {
                searchBaseTextRef.current = searchQuery
                searchTranscription.startRecording(searchQuery.length)
              } else {
                searchTranscription.stopRecording()
              }
            }}
            size="sm"
            showStatus={false}
          />
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search repository..."
              className="pl-8 pr-8 h-9 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={handleSearch} disabled={!searchQuery.trim() || isSearching}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>
        {searchTranscription.error && (
          <p className="text-xs text-destructive">{searchTranscription.error}</p>
        )}
        
        {/* Search results */}
        {searchResults.length > 0 && (
          <div className="border rounded-lg p-2 max-h-32 overflow-y-auto bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                {searchResults.length} results
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setSearchResults([])}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              {searchResults.slice(0, 10).map((result, i) => (
                <button
                  key={i}
                  onClick={() => {
                    // Navigate to the file's parent directory so it appears in the listing
                    const dir = result.path.split('/').slice(0, -1).join('/')
                    if (dir !== currentPath) {
                      setCurrentPath(dir)
                    }
                    handleSelectFile(result.path)
                    setSearchResults([])
                    setSearchQuery('')
                  }}
                  className="w-full text-left p-1.5 rounded hover:bg-muted text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{result.path}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground overflow-x-auto">
          <span className="inline-flex items-center gap-1.5 shrink-0 text-xs px-2 py-1 rounded-md border bg-muted/50">
            <span className="font-bold text-foreground">{selectedRepoFullName}</span>
            <GitBranch className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{branchName}</span>
          </span>
          <ChevronRight className="h-3 w-3 shrink-0" />
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <button
                onClick={() => handleNavigateDir(crumb.path)}
                className={`hover:text-foreground ${i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}`}
              >
                {i === 0 ? <Home className="h-4 w-4" /> : crumb.label}
              </button>
            </span>
          ))}
        </div>
        
        {/* Directory listing - dense grid */}
        <div className="border rounded-lg p-2 max-h-40 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive p-2">{error}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
              {entries.map(entry => (
                <button
                  key={entry.path}
                  onClick={() => entry.type === 'dir' 
                    ? handleNavigateDir(entry.path)
                    : handleSelectFile(entry.path)
                  }
                  className={`
                    flex items-center gap-1.5 px-2 py-1 text-xs rounded
                    hover:bg-muted text-left truncate
                    ${selectedFile === entry.path ? 'bg-muted ring-1 ring-primary' : ''}
                  `}
                  title={entry.name}
                >
                  {entry.type === 'dir' ? (
                    <FolderOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{entry.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* File Preview/Editor Section */}
      <div className="flex-1 flex flex-col min-h-0">
        {selectedFile ? (
          <>
            {/* File header: filename | view-mode | actions */}
            <div data-file-toolbar className="flex items-center px-4 py-2 border-b bg-muted/30 gap-2">
              <span className="flex items-center gap-2 text-base font-bold shrink min-w-0 px-3 py-1 rounded bg-muted ring-1 ring-primary">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="truncate">{selectedFile?.split('/').pop()}</span>
              </span>

              <div className="flex-1 min-w-0" />

              {/* View mode toggle: preview | raw | edit */}
              {!isBinaryPreview && (
                <div className="flex gap-1 items-center shrink-0">
                  <div className="flex rounded-md border overflow-hidden">
                    <Button
                      variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="rounded-none h-7 px-2"
                      onClick={() => setViewMode('preview')}
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="rounded-none h-7 px-2"
                      onClick={() => setViewMode('raw')}
                      title="Raw"
                    >
                      <Code className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={viewMode === 'edit' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="rounded-none h-7 px-2"
                      onClick={() => setViewMode('edit')}
                      title="Edit"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {editorDirty && (
                    <span className="text-xs text-amber-600 ml-1">Modified</span>
                  )}
                </div>
              )}

              <div className="flex-1 min-w-0" />

              {/* Action buttons */}
              {!isBinaryPreview && (
                <div className="flex gap-1 items-center shrink-0">
                  {editorDirty && (
                    <>
                      <Button variant="default" size="sm" onClick={handleSave} className="gap-1 h-7">
                        <Save className="h-3.5 w-3.5" />
                        Stage
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleRevert} className="gap-1 h-7" title="Revert to original">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Revert
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleInsert}
                    className="gap-1 h-7"
                    disabled={!hasCursor}
                    title={hasCursor ? "Insert at cursor" : "Place cursor or select text first"}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Insert
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleModify}
                    className="gap-1 h-7"
                    disabled={!selectedFile}
                    title="Modify file or selection"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Modify
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddImage}
                    className="gap-1 h-7"
                    disabled={!hasCursor}
                    title={hasCursor ? "Add image at cursor" : "Place cursor or select text first"}
                  >
                    <Image className="h-3.5 w-3.5" />
                    Image
                  </Button>
                </div>
              )}
            </div>

            {/* AI context capsule */}
            <div className="px-4 py-1 border-b bg-muted/20">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-0.5 rounded bg-muted ring-1 ring-border">
                <span className="font-medium shrink-0">AI context:</span>
                <span className="truncate">{aiContext}</span>
              </span>
            </div>

            {/* File content */}
            <div data-file-content className="flex-1 min-h-0 flex flex-col relative">
              {/* Blinking cursor for preview/raw modes */}
              {viewMode !== 'edit' && !isImage && (
                <BlinkingCursor visible={cursorOffset !== null && selectionRange === null} />
              )}

              {isBinaryPreview && imageDataUrl ? (
                isPdf ? (
                  <iframe
                    src={imageDataUrl}
                    className="flex-1 w-full border-0"
                    title={selectedFile}
                  />
                ) : (
                  <div className="p-4 overflow-auto flex-1 flex items-center justify-center">
                    <img
                      src={imageDataUrl}
                      alt={selectedFile}
                      className="max-w-full max-h-full object-contain rounded"
                    />
                  </div>
                )
              ) : isBinaryPreview ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : viewMode === 'preview' ? (
                isMarkdown && fileContent ? (
                  <div
                    ref={previewContainerRef}
                    className="p-4 overflow-auto flex-1"
                    onMouseUp={handlePreviewMouseUp}
                  >
                    {editorDirty && originalContent ? (() => {
                      const diffs = computeLineDiff(originalContent, fileContent)
                      const blocks: { type: 'added' | 'removed' | 'unchanged'; text: string }[] = []
                      let cur: typeof blocks[0] | null = null
                      for (const line of diffs) {
                        if (!cur || cur.type !== line.type) { if (cur) blocks.push(cur); cur = { type: line.type, text: line.text } }
                        else cur.text += '\n' + line.text
                      }
                      if (cur) blocks.push(cur)
                      return blocks.map((block, i) => (
                        <div key={i} className={`border-l-4 ${
                          block.type === 'added' ? 'border-green-500 bg-green-50/30 dark:bg-green-950/10' :
                          block.type === 'removed' ? 'border-red-500 bg-red-50/30 dark:bg-red-950/10' :
                          'border-transparent'
                        }`}>
                          {block.type === 'removed' ? (
                            <div className="opacity-50 line-through"><MarkdownPreview content={block.text} basePath={basePath} onNavigate={handleSelectFile} darkMode={darkMode} /></div>
                          ) : (
                            <MarkdownPreview content={block.text} basePath={basePath} onNavigate={handleSelectFile} darkMode={darkMode} />
                          )}
                        </div>
                      ))
                    })() : (
                      <MarkdownPreview
                        content={fileContent}
                        basePath={basePath}
                        onNavigate={handleSelectFile}
                        darkMode={darkMode}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex-1 min-h-0">
                    <Editor
                      key="preview-readonly"
                      height="100%"
                      language={editorLanguage}
                      value={fileContent || ''}
                      onMount={(editor) => {
                        // Apply margin decorations to read-only preview too
                        if (originalContent && fileContent && fileContent !== originalContent) {
                          const { added, removed } = getChangedLineNumbers(originalContent, fileContent)
                          const decos: import('monaco-editor').editor.IModelDeltaDecoration[] = []
                          for (const ln of added) decos.push({ range: { startLineNumber: ln, startColumn: 1, endLineNumber: ln, endColumn: 1 }, options: { isWholeLine: true, linesDecorationsClassName: 'line-added-margin' } })
                          for (const ln of removed) decos.push({ range: { startLineNumber: ln, startColumn: 1, endLineNumber: ln, endColumn: 1 }, options: { isWholeLine: true, linesDecorationsClassName: 'line-removed-margin' } })
                          editor.deltaDecorations([], decos)
                        }
                      }}
                      theme={darkMode ? 'vs-dark' : 'vs'}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        renderValidationDecorations: 'off',
                      }}
                    />
                  </div>
                )
              ) : viewMode === 'edit' ? (
                <div className="flex-1 min-h-0">
                  <Editor
                    key="edit"
                    height="100%"
                    language={editorLanguage}
                    value={fileContent || ''}
                    onChange={handleEditorChange}
                    onMount={handleEditorMount}
                    theme={darkMode ? 'vs-dark' : 'vs'}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>
              ) : (
                editorDirty && originalContent && fileContent && fileContent !== originalContent ? (
                  <div
                    ref={rawPreRef as React.RefObject<HTMLDivElement>}
                    className="text-xs font-mono overflow-auto flex-1"
                    onMouseUp={handleTextMouseUp}
                  >
                    {computeLineDiff(originalContent, fileContent).map((line, i) => (
                      <div key={i} className={`flex ${
                        line.type === 'added' ? 'bg-green-50 dark:bg-green-950/20' :
                        line.type === 'removed' ? 'bg-red-50 dark:bg-red-950/20' : ''
                      }`}>
                        <div className="w-5 shrink-0 flex items-center justify-center">
                          {line.type === 'added' && <div className="w-1 h-full bg-green-500 rounded-full" />}
                          {line.type === 'removed' && <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
                        </div>
                        <pre className={`flex-1 whitespace-pre-wrap px-2 py-px ${
                          line.type === 'removed' ? 'line-through text-red-600 dark:text-red-400 opacity-50' : ''
                        }`}>{line.text}</pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre
                    ref={rawPreRef as React.RefObject<HTMLPreElement>}
                    className="p-4 text-xs font-mono whitespace-pre-wrap overflow-auto flex-1"
                    onMouseUp={handleTextMouseUp}
                  >
                    {fileContent}
                  </pre>
                )
              )}
            </div>

          </>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* No file selected — show new-file button in header area */}
            <div className="flex items-center px-4 py-2 border-b bg-muted/30 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-7"
                onClick={() => openPromptModal({ type: 'new-file', path: currentPath })}
              >
                <FilePlus className="h-3.5 w-3.5" />
                New File
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 h-7"
                onClick={() => openPromptModal({ type: 'new-folder', path: currentPath })}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New Directory
              </Button>
            </div>
            {/* AI context capsule */}
            <div className="px-4 py-1 border-b bg-muted/20">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-0.5 rounded bg-muted ring-1 ring-border">
                <span className="font-medium shrink-0">AI context:</span>
                <span className="truncate">{aiContext}</span>
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>Select a file to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
