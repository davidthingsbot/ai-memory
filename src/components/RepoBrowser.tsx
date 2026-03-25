import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listDirectory, readFile, type DirectoryEntry } from '@/lib/github-tools'
import { 
  FolderOpen, FileText, ChevronRight, ChevronDown, 
  Loader2, Check, X
} from 'lucide-react'

interface RepoBrowserProps {
  repoName?: string // For future use
  onScopeSelect?: (scope: BrowseScope | null) => void
  onScopeChange?: () => void // Called when scope changes, to clear downstream state
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

  // Load root directory
  useEffect(() => {
    loadDirectory('')
  }, [])

  const loadDirectory = async (path: string) => {
    try {
      setLoading(path === '')
      const entries = await listDirectory(path)
      
      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      if (path === '') {
        setTree(entries)
      } else {
        // Update tree with children
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
    
    // Auto-set scope to this directory
    const newScope: BrowseScope = { type: 'directory', path: node.path || '/' }
    setScope(newScope)
    onScopeSelect?.(newScope)
    onScopeChange?.() // Clear downstream state
    
    if (node.expanded) {
      // Collapse
      setTree(prev => collapseNode(prev, node.path))
    } else {
      // Expand - load children if needed
      setTree(prev => setNodeLoading(prev, node.path, true))
      await loadDirectory(node.path)
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

  const setNodeLoading = (nodes: TreeNode[], path: string, loading: boolean): TreeNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, loading }
      }
      if (node.children) {
        return { ...node, children: setNodeLoading(node.children, path, loading) }
      }
      return node
    })
  }

  const selectFile = async (path: string) => {
    setSelectedPath(path)
    setFileLoading(true)
    setFileContent(null)
    
    try {
      const file = await readFile(path)
      if (file) {
        setFileContent(file.content)
        // Auto-set scope to this file
        const newScope: BrowseScope = { 
          type: 'file', 
          path, 
          fileContent: file.content 
        }
        setScope(newScope)
        onScopeSelect?.(newScope)
        onScopeChange?.() // Clear downstream state
      }
    } catch (err) {
      setError('Failed to load file')
    } finally {
      setFileLoading(false)
    }
  }

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
      onScopeChange?.() // Clear downstream state
    }
  }, [selectedPath, fileContent, onScopeSelect, onScopeChange])

  const clearScope = useCallback(() => {
    setScope(null)
    onScopeSelect?.(null)
  }, [onScopeSelect])

  const renderTree = (nodes: TreeNode[], depth = 0) => {
    return nodes.map(node => (
      <div key={node.path}>
        <button
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
            Browse Repository
          </span>
          {scope && (
            <Button variant="ghost" size="sm" onClick={clearScope}>
              <X className="h-4 w-4 mr-1" />
              Clear scope
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Select a folder, file, or passage to focus your topic search.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current scope indicator */}
        {scope && (
          <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-2 text-sm">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <Check className="h-4 w-4" />
              <span className="font-medium">
                Scope: {scope.type === 'directory' ? 'Directory' : scope.type === 'file' ? 'File' : 'Selection'}
              </span>
            </div>
            <code className="text-xs text-green-600 dark:text-green-400">{scope.path}</code>
            {scope.selectedText && (
              <p className="text-xs mt-1 text-green-600 dark:text-green-400 italic truncate">
                "{scope.selectedText.slice(0, 100)}..."
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 h-64">
          {/* Tree view */}
          <div className="w-1/3 border rounded-lg overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive p-2">{error}</p>
            ) : (
              renderTree(tree)
            )}
          </div>

          {/* File preview */}
          <div className="w-2/3 border rounded-lg overflow-hidden flex flex-col">
            {selectedPath ? (
              <>
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                  <code className="text-xs truncate">{selectedPath}</code>
                  <div className="flex gap-1">
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
                <div 
                  className="flex-1 overflow-y-auto p-3 text-sm"
                  onMouseUp={handleTextSelection}
                >
                  {fileLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : fileContent ? (
                    <pre className="whitespace-pre-wrap font-mono text-xs">{fileContent}</pre>
                  ) : (
                    <p className="text-muted-foreground italic">
                      {selectedPath.endsWith('/') || !selectedPath.includes('.') 
                        ? 'Directory selected' 
                        : 'Select a file to preview'}
                    </p>
                  )}
                </div>
                {fileContent && (
                  <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
                    Select text to use a specific passage as scope
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Select a file or folder to preview
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
