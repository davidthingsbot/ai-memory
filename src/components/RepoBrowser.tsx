import { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listDirectory, readFile, type DirectoryEntry } from '@/lib/github-tools'
import { MarkdownPreview } from './MarkdownPreview'
import { 
  FolderOpen, FileText, ChevronRight, ChevronDown, 
  Loader2, Check, X, Eye, Code
} from 'lucide-react'

interface RepoBrowserProps {
  repoName?: string
  onScopeSelect?: (scope: BrowseScope | null) => void
  onScopeChange?: () => void
}

export interface BrowseScope {
  type: 'directory' | 'file' | 'selection'
  path: string
  selectedText?: string
  fileContent?: string
}

interface TreeNode extends DirectoryEntry {
  children?: TreeNode[]
  expanded?: boolean
  loading?: boolean
}

export function RepoBrowser({ onScopeSelect, onScopeChange }: RepoBrowserProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [scope, setScope] = useState<BrowseScope | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  
  // Refs for scrolling folders to top
  const treeContainerRef = useRef<HTMLDivElement>(null)
  const folderRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  useEffect(() => {
    loadDirectory('')
  }, [])

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

  // Handle navigation from markdown links
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
      const newScope: BrowseScope = { type: 'directory', path }
      setScope(newScope)
      onScopeSelect?.(newScope)
      onScopeChange?.()
      await loadDirectory(path)
    }
  }, [tree, onScopeSelect, onScopeChange])

  const handleSetScope = useCallback((type: BrowseScope['type'], path: string) => {
    const newScope: BrowseScope = { type, path }
    if (type === 'file' && fileContent) {
      newScope.fileContent = fileContent
    }
    setScope(newScope)
    onScopeSelect?.(newScope)
  }, [fileContent, onScopeSelect])

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim() && selectedPath) {
      const newScope: BrowseScope = {
        type: 'selection',
        path: selectedPath,
        selectedText: selection.toString().trim(),
        fileContent: fileContent || undefined,
      }
      setScope(newScope)
      onScopeSelect?.(newScope)
      onScopeChange?.()
    }
  }, [selectedPath, fileContent, onScopeSelect, onScopeChange])

  const clearScope = useCallback(() => {
    setScope(null)
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
          Browse and select context for your content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current scope indicator */}
        {scope && (
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-2 text-sm">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <Check className="h-4 w-4" />
              <span className="font-medium">
                {scope.type === 'directory' ? 'Directory' : scope.type === 'file' ? 'File' : 'Selection'}:
              </span>
              <code className="text-xs">{scope.path}</code>
            </div>
            {scope.selectedText && (
              <p className="text-xs mt-1 text-green-600 dark:text-green-400 italic truncate">
                "{scope.selectedText.slice(0, 100)}{scope.selectedText.length > 100 ? '...' : ''}"
              </p>
            )}
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
                  <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{fileContent}</pre>
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
