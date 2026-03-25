import { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listDirectory, readFile, searchRepo, type DirectoryEntry, type SearchResult } from '@/lib/github-tools'
import { MarkdownPreview } from './MarkdownPreview'
import { MicButton } from './MicButton'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { 
  FolderOpen, FileText, ChevronRight, ChevronDown, 
  Loader2, Check, X, Eye, Code, Search
} from 'lucide-react'

interface RepoBrowserProps {
  repoName?: string
  onScopeSelect?: (scope: BrowseScope | null) => void
  onScopeChange?: () => void
  refreshPending?: boolean
}

export interface BrowseScope {
  type: 'directory' | 'file' | 'selection' | 'cursor'
  path: string
  selectedText?: string
  fileContent?: string
  // For cursor/selection: character positions in the file
  cursorPosition?: number
  selectionStart?: number
  selectionEnd?: number
}

interface TreeNode extends DirectoryEntry {
  children?: TreeNode[]
  expanded?: boolean
  loading?: boolean
}

export function RepoBrowser({ onScopeSelect, onScopeChange, refreshPending }: RepoBrowserProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [scope, setScope] = useState<BrowseScope | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchBaseTextRef = useRef<string>('')
  const searchInsertPosRef = useRef<number>(0)
  
  // Persistent selection/cursor in file preview
  const [fileSelection, setFileSelection] = useState<{
    start: number
    end: number
  } | null>(null)
  const previewContentRef = useRef<HTMLDivElement>(null)
  
  // Refs for scrolling folders to top
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const folderRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  useEffect(() => {
    loadDirectory('')
  }, [])

  // Voice transcription for search
  const searchTranscription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      const base = searchBaseTextRef.current
      const before = base.slice(0, insertPos)
      const after = base.slice(insertPos)
      setSearchQuery(before + newText + after)
    },
  })

  // Handle search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    try {
      const results = await searchRepo(searchQuery.trim())
      setSearchResults(results)
    } catch (err) {
      console.error('Search failed:', err)
      setSearchResults([])
    }
    setIsSearching(false)
  }, [searchQuery])

  // Search on Enter key
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }, [handleSearch])

  // Handle search recording
  const handleSearchRecordingChange = useCallback((recording: boolean) => {
    if (recording) {
      const currentText = searchInputRef.current?.value ?? searchQuery
      const cursorPos = searchInputRef.current?.selectionStart ?? currentText.length
      searchBaseTextRef.current = currentText
      searchInsertPosRef.current = cursorPos
      searchTranscription.startRecording(cursorPos)
    } else {
      searchTranscription.stopRecording()
    }
  }, [searchTranscription, searchQuery])

  const loadDirectory = async (path: string) => {
    try {
      setLoading(path === '')
      const entries = await listDirectory(path)
      
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      if (path === '') {
        setTree(entries)
      } else {
        setTree(prev => updateTreeNode(prev, path, entries))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }

  const updateTreeNode = (nodes: TreeNode[], path: string, children: DirectoryEntry[]): TreeNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, children, expanded: true, loading: false }
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, path, children) }
      }
      return node
    })
  }

  const toggleDirectory = async (node: TreeNode) => {
    setSelectedPath(node.path)
    setFileContent(null)
    setFileSelection(null)
    
    const newScope: BrowseScope = { type: 'directory', path: node.path || '/' }
    setScope(newScope)
    onScopeSelect?.(newScope)
    onScopeChange?.()
    
    if (node.expanded) {
      setTree(prev => collapseNode(prev, node.path))
    } else {
      setTree(prev => setNodeLoading(prev, node.path, true))
      await loadDirectory(node.path)
      
      // Scroll the folder to top of container after expansion
      requestAnimationFrame(() => {
        const folderEl = folderRefs.current.get(node.path)
        const container = treeContainerRef.current
        if (folderEl && container) {
          const containerRect = container.getBoundingClientRect()
          const folderRect = folderEl.getBoundingClientRect()
          const scrollOffset = folderRect.top - containerRect.top + container.scrollTop
          container.scrollTo({ top: scrollOffset, behavior: 'smooth' })
        }
      })
    }
  }

  const collapseNode = (nodes: TreeNode[], path: string): TreeNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, expanded: false }
      }
      if (node.children) {
        return { ...node, children: collapseNode(node.children, path) }
      }
      return node
    })
  }

  const setNodeLoading = (nodes: TreeNode[], path: string, loadingState: boolean): TreeNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, loading: loadingState }
      }
      if (node.children) {
        return { ...node, children: setNodeLoading(node.children, path, loadingState) }
      }
      return node
    })
  }

  // Expand tree to a specific path
  const expandToPath = async (targetPath: string) => {
    const segments = targetPath.split('/').filter(Boolean)
    let currentPath = ''
    
    for (let i = 0; i < segments.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${segments[i]}` : segments[i]
      
      // Check if this directory is already expanded
      const findNode = (nodes: TreeNode[], path: string): TreeNode | null => {
        for (const node of nodes) {
          if (node.path === path) return node
          if (node.children) {
            const found = findNode(node.children, path)
            if (found) return found
          }
        }
        return null
      }
      
      const node = findNode(tree, currentPath)
      if (node && !node.expanded) {
        await loadDirectory(currentPath)
      }
    }
  }

  const selectFile = async (path: string) => {
    setSelectedPath(path)
    setFileLoading(true)
    setFileContent(null)
    setFileSelection(null)
    
    try {
      const file = await readFile(path)
      if (file) {
        setFileContent(file.content)
        const newScope: BrowseScope = { 
          type: 'file', 
          path, 
          fileContent: file.content 
        }
        setScope(newScope)
        onScopeSelect?.(newScope)
        onScopeChange?.()
      }
    } catch (err) {
      setError('Failed to load file')
    } finally {
      setFileLoading(false)
    }
  }

  // Handle navigation from markdown links or search results
  const handleNavigate = useCallback(async (path: string) => {
    // Expand tree to show the path
    await expandToPath(path)
    
    // Check if it's a file or directory by looking at tree or just try to load
    if (path.includes('.')) {
      // Likely a file
      await selectFile(path)
    } else {
      // Could be directory, try to load it
      setSelectedPath(path)
      setFileContent(null)
      setFileSelection(null)
      const newScope: BrowseScope = { type: 'directory', path }
      setScope(newScope)
      onScopeSelect?.(newScope)
    }
    
    // Scroll to the selected item after DOM updates
    requestAnimationFrame(() => {
      setTimeout(() => {
        const container = treeContainerRef.current
        if (!container) return
        
        // Find the selected item in the tree
        const selectedEl = container.querySelector(`[data-path="${path}"]`)
        if (selectedEl) {
          const containerRect = container.getBoundingClientRect()
          const itemRect = selectedEl.getBoundingClientRect()
          const scrollOffset = itemRect.top - containerRect.top + container.scrollTop
          container.scrollTo({ top: scrollOffset, behavior: 'smooth' })
        }
      }, 100) // Small delay for tree to render
    })
  }, [tree, onScopeSelect, onScopeChange])

  const handleSetScope = useCallback((type: BrowseScope['type'], path: string) => {
    const newScope: BrowseScope = { type, path }
    if (type === 'file' && fileContent) {
      newScope.fileContent = fileContent
    }
    setScope(newScope)
    onScopeSelect?.(newScope)
  }, [fileContent, onScopeSelect])

  // Handle text selection in raw view - calculates character positions
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || !selectedPath || !fileContent) return
    
    const selectedText = selection.toString()
    if (!selectedText.trim()) {
      // Click without selection - set cursor position
      // Try to get position from the raw content container
      if (previewContentRef.current && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const preContent = previewContentRef.current.querySelector('pre')
        if (preContent && preContent.contains(range.startContainer)) {
          // Calculate offset within the text
          const treeWalker = document.createTreeWalker(
            preContent,
            NodeFilter.SHOW_TEXT,
            null
          )
          let charCount = 0
          let node: Node | null
          while ((node = treeWalker.nextNode())) {
            if (node === range.startContainer) {
              charCount += range.startOffset
              break
            }
            charCount += node.textContent?.length || 0
          }
          
          setFileSelection({ start: charCount, end: charCount })
          const newScope: BrowseScope = {
            type: 'cursor',
            path: selectedPath,
            fileContent: fileContent,
            cursorPosition: charCount,
          }
          setScope(newScope)
          onScopeSelect?.(newScope)
          onScopeChange?.()
        }
      }
      return
    }
    
    // Has selection - calculate start and end positions
    if (previewContentRef.current && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const preContent = previewContentRef.current.querySelector('pre')
      if (preContent && preContent.contains(range.startContainer)) {
        const treeWalker = document.createTreeWalker(
          preContent,
          NodeFilter.SHOW_TEXT,
          null
        )
        let charCount = 0
        let startOffset = 0
        let endOffset = 0
        let foundStart = false
        let foundEnd = false
        let node: Node | null
        
        while ((node = treeWalker.nextNode())) {
          if (node === range.startContainer && !foundStart) {
            startOffset = charCount + range.startOffset
            foundStart = true
          }
          if (node === range.endContainer && !foundEnd) {
            endOffset = charCount + range.endOffset
            foundEnd = true
          }
          if (foundStart && foundEnd) break
          charCount += node.textContent?.length || 0
        }
        
        if (foundStart && foundEnd) {
          setFileSelection({ start: startOffset, end: endOffset })
          const newScope: BrowseScope = {
            type: 'selection',
            path: selectedPath,
            selectedText: selectedText.trim(),
            fileContent: fileContent,
            selectionStart: startOffset,
            selectionEnd: endOffset,
          }
          setScope(newScope)
          onScopeSelect?.(newScope)
          onScopeChange?.()
        }
      }
    }
  }, [selectedPath, fileContent, onScopeSelect, onScopeChange])

  const clearScope = useCallback(() => {
    setScope(null)
    setFileSelection(null)
    onScopeSelect?.(null)
  }, [onScopeSelect])

  // Check if file is markdown
  const isMarkdown = selectedPath?.endsWith('.md') || selectedPath?.endsWith('.mdx')
  
  // Get base path for resolving relative links
  const basePath = selectedPath ? selectedPath.split('/').slice(0, -1).join('/') : ''

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map(node => (
      <div key={node.path}>
        <button
          ref={node.type === 'dir' ? (el) => {
            if (el) folderRefs.current.set(node.path, el)
            else folderRefs.current.delete(node.path)
          } : undefined}
          data-path={node.path}
          onClick={() => node.type === 'dir' ? toggleDirectory(node) : selectFile(node.path)}
          className={`w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded text-left ${
            selectedPath === node.path ? 'bg-muted' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {node.type === 'dir' ? (
            <>
              {node.loading ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : node.expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
            </>
          ) : (
            <>
              <span className="w-4" />
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {node.expanded && node.children && renderTree(node.children, depth + 1)}
      </div>
    ))
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Context
          </span>
          {scope && (
            <Button variant="ghost" size="sm" onClick={clearScope}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          {refreshPending ? (
            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Update pending — refreshing in a few seconds...
            </span>
          ) : (
            'Browse and select context for your content.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current scope indicator */}
        {scope && (
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-2 text-sm">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <Check className="h-4 w-4" />
              <span className="font-medium">
                {scope.type === 'directory' ? 'Directory' : 
                 scope.type === 'file' ? 'File' : 
                 scope.type === 'cursor' ? 'Cursor' : 'Selection'}:
              </span>
              <code className="text-xs">{scope.path}</code>
              {scope.type === 'cursor' && scope.cursorPosition !== undefined && (
                <span className="text-xs text-green-600">@ char {scope.cursorPosition}</span>
              )}
            </div>
            {scope.selectedText && (
              <p className="text-xs mt-1 text-green-600 dark:text-green-400 italic truncate">
                "{scope.selectedText.slice(0, 100)}{scope.selectedText.length > 100 ? '...' : ''}"
              </p>
            )}
          </div>
        )}

        {/* Search */}
        <div className="flex gap-2 items-center">
          <MicButton
            recording={searchTranscription.isRecording}
            transcribing={searchTranscription.isConnecting}
            onRecordingChange={handleSearchRecordingChange}
            size="sm"
          />
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search repository..."
              className="pl-8 h-9 text-sm"
              disabled={isSearching || searchTranscription.isRecording}
            />
          </div>
          <Button
            size="sm"
            onClick={handleSearch}
            disabled={!searchQuery.trim() || isSearching}
          >
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
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setSearchResults([])}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
            <div className="space-y-1">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => handleNavigate(result.path)}
                  className="w-full text-left p-1.5 rounded hover:bg-muted text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{result.path}</span>
                  </div>
                  {result.matches[0] && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-1">
                      ...{result.matches[0].fragment.slice(0, 80)}...
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tree view - compact */}
        <div ref={treeContainerRef} className="border rounded-lg overflow-y-auto p-1 max-h-48">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive p-2">{error}</p>
          ) : (
            renderTree(tree)
          )}
        </div>

        {/* File preview - full width below */}
        {selectedPath && (
          <div className="border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
              <code className="text-xs truncate flex-1">{selectedPath}</code>
              <div className="flex gap-1 ml-2">
                {isMarkdown && fileContent && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowRaw(!showRaw)}
                    title={showRaw ? 'Show rendered' : 'Show raw'}
                  >
                    {showRaw ? <Eye className="h-4 w-4" /> : <Code className="h-4 w-4" />}
                  </Button>
                )}
                {selectedPath.includes('/') && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleSetScope('directory', selectedPath.split('/').slice(0, -1).join('/') || '/')}
                  >
                    Use folder
                  </Button>
                )}
                {fileContent && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleSetScope('file', selectedPath)}
                  >
                    Use file
                  </Button>
                )}
              </div>
            </div>
            
            {/* Content */}
            <div 
              ref={previewContentRef}
              className="overflow-y-auto p-4 max-h-96"
              onMouseUp={handleTextSelection}
            >
              {fileLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : fileContent ? (
                isMarkdown && !showRaw ? (
                  <MarkdownPreview 
                    content={fileContent} 
                    basePath={basePath}
                    onNavigate={handleNavigate}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground select-text cursor-text">
                    {fileSelection && fileSelection.start !== fileSelection.end ? (
                      // Render with selection highlight
                      <>
                        {fileContent.slice(0, fileSelection.start)}
                        <span className="bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100">
                          {fileContent.slice(fileSelection.start, fileSelection.end)}
                        </span>
                        {fileContent.slice(fileSelection.end)}
                      </>
                    ) : fileSelection && fileSelection.start === fileSelection.end ? (
                      // Render with cursor indicator
                      <>
                        {fileContent.slice(0, fileSelection.start)}
                        <span className="border-l-2 border-blue-500 animate-pulse" />
                        {fileContent.slice(fileSelection.start)}
                      </>
                    ) : (
                      fileContent
                    )}
                  </pre>
                )
              ) : (
                <p className="text-muted-foreground italic text-center py-8">
                  {selectedPath.endsWith('/') || !selectedPath.includes('.') 
                    ? 'Directory selected' 
                    : 'Select a file to preview'}
                </p>
              )}
            </div>
            
            {/* Footer hint */}
            {fileContent && (
              <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                Select text to use a specific passage as context
              </div>
            )}
          </div>
        )}

        {!selectedPath && (
          <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
            Select a file or folder above to preview
          </div>
        )}
      </CardContent>
    </Card>
  )
}
