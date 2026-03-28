import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { commitFiles } from '@/lib/github-commit'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import {
  GitCommit, Trash2, Upload, Loader2, Check,
  ChevronDown, ChevronRight, FileText, ExternalLink,
  Undo2, Eye, Code
} from 'lucide-react'

type FileViewMode = 'preview' | 'raw'

export function CommitTab() {
  const {
    pendingChanges,
    removePendingChange,
    clearPendingChanges,
    commitMessage,
    setCommitMessage,
    setActiveTab,
    darkMode,
  } = useAppStore()

  const [isCommitting, setIsCommitting] = useState(false)
  const [isPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [commitUrl, setCommitUrl] = useState<string | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [fileViewModes, setFileViewModes] = useState<Record<string, FileViewMode>>({})

  // Auto-generate commit message when changes update
  useEffect(() => {
    if (pendingChanges.length > 0 && !commitMessage) {
      const summary = pendingChanges.length === 1
        ? `${pendingChanges[0].action} ${pendingChanges[0].path}`
        : `Update ${pendingChanges.length} files`
      setCommitMessage(summary)
    }
  }, [pendingChanges, commitMessage, setCommitMessage])

  // Toggle file expansion
  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // Get view mode for a file (default: preview for markdown, raw for others)
  const getFileViewMode = useCallback((path: string): FileViewMode => {
    if (fileViewModes[path]) return fileViewModes[path]
    const isMarkdown = /\.mdx?$/i.test(path)
    return isMarkdown ? 'preview' : 'raw'
  }, [fileViewModes])

  // Set view mode for a file
  const setFileViewMode = useCallback((path: string, mode: FileViewMode) => {
    setFileViewModes(prev => ({ ...prev, [path]: mode }))
  }, [])

  // Handle commit
  const handleCommit = useCallback(async () => {
    if (pendingChanges.length === 0 || !commitMessage.trim()) return

    setIsCommitting(true)
    setError(null)

    try {
      const result = await commitFiles(pendingChanges, commitMessage)

      if (result.success) {
        setCommitUrl(result.url || null)
      } else {
        throw new Error(result.error || 'Commit failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
    } finally {
      setIsCommitting(false)
    }
  }, [pendingChanges, commitMessage])

  // Handle push (commit is already pushed in our implementation)
  const handlePush = useCallback(async () => {
    await handleCommit()
  }, [handleCommit])

  // Handle discard all
  const handleDiscardAll = useCallback(() => {
    if (confirm('Discard all pending changes?')) {
      clearPendingChanges()
      setCommitUrl(null)
    }
  }, [clearPendingChanges])

  // Handle done (go back to repository)
  const handleDone = useCallback(() => {
    clearPendingChanges()
    setCommitUrl(null)
    setActiveTab('repository')
  }, [clearPendingChanges, setActiveTab])

  // Count additions/deletions
  const countChanges = (oldContent: string | undefined, newContent: string | undefined) => {
    const oldLines = (oldContent || '').split('\n').length
    const newLines = (newContent || '').split('\n').length
    const added = Math.max(0, newLines - oldLines)
    const removed = Math.max(0, oldLines - newLines)
    return { added, removed }
  }

  if (commitUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-4 mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Changes Committed!</h2>
        <p className="text-muted-foreground mb-4">
          Your changes have been pushed to GitHub.
        </p>
        <a
          href={commitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline mb-6"
        >
          View commit on GitHub <ExternalLink className="h-4 w-4" />
        </a>
        <Button onClick={handleDone}>
          Return to Repository
        </Button>
      </div>
    )
  }

  if (pendingChanges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <GitCommit className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Pending Changes</h2>
        <p className="text-muted-foreground mb-4">
          Make changes in the Repository tab and they'll appear here for review.
        </p>
        <Button variant="outline" onClick={() => setActiveTab('repository')}>
          Go to Repository
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            Staged Changes
            <span className="text-sm font-normal text-muted-foreground">
              ({pendingChanges.length} file{pendingChanges.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <Button variant="ghost" size="sm" onClick={handleDiscardAll}>
            <Trash2 className="h-4 w-4 mr-1" />
            Discard All
          </Button>
        </div>
      </div>

      {/* Changes list */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {pendingChanges.map(change => {
          const { added, removed } = countChanges(change.oldContent, change.content)
          const isExpanded = expandedFiles.has(change.path)
          const viewMode = getFileViewMode(change.path)
          const isMarkdown = /\.mdx?$/i.test(change.path)
          const hasDiff = change.action === 'modify' && change.oldContent != null

          return (
            <div key={change.path} className="border rounded-lg overflow-hidden">
              {/* File header */}
              <button
                onClick={() => toggleFile(change.path)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-muted/50 hover:bg-muted/70"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left truncate font-mono">{change.path}</span>
                <span className={`text-xs ${
                  change.action === 'create' ? 'text-green-600' :
                  change.action === 'delete' ? 'text-red-600' : 'text-amber-600'
                }`}>
                  {change.action}
                </span>
                {added > 0 && <span className="text-xs text-green-600">+{added}</span>}
                {removed > 0 && <span className="text-xs text-red-600">-{removed}</span>}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    removePendingChange(change.path)
                  }}
                  title="Remove from staged"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div>
                  {/* View mode toggle */}
                  <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30">
                    <div className="flex rounded-md border overflow-hidden">
                      <Button
                        variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="rounded-none h-6 px-2 text-xs"
                        onClick={(e) => { e.stopPropagation(); setFileViewMode(change.path, 'preview') }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant={viewMode === 'raw' ? 'secondary' : 'ghost'}
                        size="sm"
                        className="rounded-none h-6 px-2 text-xs"
                        onClick={(e) => { e.stopPropagation(); setFileViewMode(change.path, 'raw') }}
                      >
                        <Code className="h-3 w-3 mr-1" />
                        Raw
                      </Button>
                    </div>
                    {hasDiff && (
                      <span className="text-xs text-muted-foreground ml-2">diff</span>
                    )}
                  </div>

                  {/* File content */}
                  <div className="max-h-96 overflow-auto">
                    {viewMode === 'raw' ? (
                      /* Raw mode */
                      hasDiff ? (
                        <ReactDiffViewer
                          oldValue={change.oldContent || ''}
                          newValue={change.content || ''}
                          splitView={false}
                          compareMethod={DiffMethod.WORDS}
                          useDarkTheme={darkMode}
                          hideLineNumbers
                          styles={{
                            contentText: { fontSize: '11px', fontFamily: 'monospace' }
                          }}
                        />
                      ) : change.action === 'delete' ? (
                        <pre className="p-3 text-xs font-mono whitespace-pre-wrap bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200">
                          {change.oldContent}
                        </pre>
                      ) : (
                        <pre className="p-3 text-xs font-mono whitespace-pre-wrap bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-200">
                          {change.content}
                        </pre>
                      )
                    ) : (
                      /* Preview mode */
                      hasDiff ? (
                        <div className="grid grid-cols-2 divide-x">
                          <div className="p-3 overflow-auto">
                            <div className="text-xs font-medium text-muted-foreground mb-2">Before</div>
                            {isMarkdown ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                                <MarkdownPreview content={change.oldContent || ''} darkMode={darkMode} />
                              </div>
                            ) : (
                              <pre className="text-xs font-mono whitespace-pre-wrap">{change.oldContent}</pre>
                            )}
                          </div>
                          <div className="p-3 overflow-auto">
                            <div className="text-xs font-medium text-muted-foreground mb-2">After</div>
                            {isMarkdown ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                                <MarkdownPreview content={change.content || ''} darkMode={darkMode} />
                              </div>
                            ) : (
                              <pre className="text-xs font-mono whitespace-pre-wrap">{change.content}</pre>
                            )}
                          </div>
                        </div>
                      ) : change.action === 'delete' ? (
                        <div className="p-3 opacity-60">
                          {isMarkdown ? (
                            <MarkdownPreview content={change.oldContent || ''} darkMode={darkMode} />
                          ) : (
                            <pre className="text-xs font-mono whitespace-pre-wrap">{change.oldContent}</pre>
                          )}
                        </div>
                      ) : (
                        <div className="p-3">
                          {isMarkdown ? (
                            <MarkdownPreview content={change.content || ''} darkMode={darkMode} />
                          ) : (
                            <pre className="text-xs font-mono whitespace-pre-wrap">{change.content}</pre>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Commit section */}
      <div className="border-t p-4 space-y-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Commit Message</label>
          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Describe your changes..."
            className="font-mono text-sm"
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <Button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isCommitting || isPushing}
          >
            {isCommitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <GitCommit className="h-4 w-4 mr-2" />
            )}
            Commit
          </Button>
          <Button
            variant="default"
            onClick={handlePush}
            disabled={!commitMessage.trim() || isCommitting || isPushing}
          >
            {isPushing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Commit & Push
          </Button>
        </div>
      </div>
    </div>
  )
}
