import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listDirectory, readFile, searchRepo, type DirectoryEntry, type SearchResult } from '@/lib/github-tools'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { MicButton } from '@/components/MicButton'
import { BlinkingCursor } from '@/components/BlinkingCursor'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import { 
  FolderOpen, FileText, ChevronRight, Home,
  Loader2, Eye, Code, Edit3, Search, X,
  Plus, Pencil, Image, Save
} from 'lucide-react'

export function RepositoryTab() {
  const { 
    selectedRepoFullName,
    currentPath, setCurrentPath,
    selectedFile, fileContent, selectFile, clearSelectedFile, setFileContent,
    viewMode, setViewMode,
    openPromptModal,
    setActiveTab,
    addPendingChange,
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
  
  // Text selection and cursor state for action buttons
  const [hasSelection, setHasSelection] = useState(false)
  const [hasCursor, setHasCursor] = useState(false)
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  
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
      // Sort: folders first, then alphabetically
      results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      setEntries(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }, [])
  
  // Initial load and path changes
  useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath, loadDirectory])
  
  // Load README.md on initial mount if no file selected
  useEffect(() => {
    if (!selectedFile && entries.length > 0) {
      const readme = entries.find(e => e.name.toLowerCase() === 'readme.md')
      if (readme) {
        handleSelectFile(readme.path)
      }
    }
    // Note: intentionally not including handleSelectFile to avoid re-triggering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, selectedFile])
  
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
    setCurrentPath(path)
    clearSelectedFile()
    setEditorDirty(false)
    setOriginalContent(null)
  }, [setCurrentPath, clearSelectedFile, editorDirty])
  
  // Select file
  const handleSelectFile = useCallback(async (path: string) => {
    // Warn if there are unsaved changes
    if (editorDirty && selectedFile !== path) {
      const discard = confirm('You have unsaved changes. Discard them?')
      if (!discard) return
    }
    
    try {
      const file = await readFile(path)
      if (file) {
        selectFile(path, file.content)
        setOriginalContent(file.content)
        setEditorDirty(false)
      }
    } catch (err) {
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
  
  // Handle Monaco editor mount - track selection and cursor
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    // Monaco always has a cursor when mounted
    setHasCursor(true)
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection()
      const hasText = selection ? !selection.isEmpty() : false
      setHasSelection(hasText)
    })
  }, [])
  
  // Track selection in preview/raw mode
  const handleTextMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const hasText = selection ? selection.toString().trim().length > 0 : false
    setHasSelection(hasText)
    // In preview/raw mode, selection also implies an insert point (after selection)
    setHasCursor(hasText)
  }, [])
  
  // Reset selection/cursor state when switching view modes
  useEffect(() => {
    setHasSelection(false)
    // Edit mode (Monaco) will set hasCursor true on mount
    // Preview/Raw modes start with no cursor until user selects
    if (viewMode !== 'edit') {
      setHasCursor(false)
    }
  }, [viewMode])
  
  // Check if file is markdown
  const isMarkdown = selectedFile?.endsWith('.md') || selectedFile?.endsWith('.mdx')
  
  // Get base path for resolving relative links
  const basePath = selectedFile ? selectedFile.split('/').slice(0, -1).join('/') : ''
  
  // Handle operations
  const handleInsert = useCallback(() => {
    if (selectedFile) {
      openPromptModal({ type: 'insert', path: selectedFile })
    }
  }, [selectedFile, openPromptModal])
  
  const handleModify = useCallback(() => {
    if (selectedFile) {
      openPromptModal({ type: 'modify', path: selectedFile })
    }
  }, [selectedFile, openPromptModal])
  
  const handleAddImage = useCallback(() => {
    if (selectedFile) {
      openPromptModal({ type: 'add-image', path: selectedFile })
    }
  }, [selectedFile, openPromptModal])
  
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
  
  return (
    <div className="flex flex-col h-full">
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
          />
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search repository..."
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleSearch} disabled={!searchQuery.trim() || isSearching}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>
        
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
                    handleSelectFile(result.path)
                    setSearchResults([])
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
            {/* File header */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 gap-2">
              <code className="text-xs truncate">{selectedFile}</code>
              
              {/* Action buttons - now in header */}
              <div className="flex gap-1 items-center">
                {editorDirty && (
                  <Button variant="default" size="sm" onClick={handleSave} className="gap-1 h-7">
                    <Save className="h-3.5 w-3.5" />
                    Stage
                  </Button>
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
                  disabled={!hasSelection}
                  title={hasSelection ? "Modify selected text" : "Select text first to modify"}
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
              
              <div className="flex gap-1 items-center">
                {/* View mode toggle */}
                <div className="flex rounded-md border overflow-hidden">
                  <Button
                    variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="rounded-none h-7 px-2"
                    onClick={() => setViewMode('preview')}
                    disabled={!isMarkdown}
                    title="Preview"
                  >
                    <Eye className="h-3.5 w-3.5" />
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
                  <Button
                    variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="rounded-none h-7 px-2"
                    onClick={() => setViewMode('raw')}
                    title="Raw"
                  >
                    <Code className="h-3.5 w-3.5" />
                  </Button>
                </div>
                
                {editorDirty && (
                  <span className="text-xs text-amber-600 ml-1">Modified</span>
                )}
              </div>
            </div>
            
            {/* File content */}
            <div className="flex-1 min-h-0 flex flex-col relative">
              {/* Blinking cursor for preview/raw modes */}
              {viewMode !== 'edit' && (
                <BlinkingCursor visible={hasCursor} />
              )}
              
              {viewMode === 'preview' && isMarkdown && fileContent ? (
                <div 
                  className="p-4 overflow-auto flex-1"
                  onMouseUp={handleTextMouseUp}
                >
                  <MarkdownPreview 
                    content={fileContent}
                    basePath={basePath}
                    onNavigate={handleSelectFile}
                  />
                </div>
              ) : viewMode === 'edit' ? (
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    language={selectedFile.endsWith('.md') ? 'markdown' : selectedFile.endsWith('.ts') || selectedFile.endsWith('.tsx') ? 'typescript' : 'plaintext'}
                    value={fileContent || ''}
                    onChange={handleEditorChange}
                    onMount={handleEditorMount}
                    theme="vs-dark"
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
                <pre 
                  className="p-4 text-xs font-mono whitespace-pre-wrap overflow-auto flex-1"
                  onMouseUp={handleTextMouseUp}
                >
                  {fileContent}
                </pre>
              )}
            </div>
            

          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Select a file to preview</p>
          </div>
        )}
      </div>
    </div>
  )
}
