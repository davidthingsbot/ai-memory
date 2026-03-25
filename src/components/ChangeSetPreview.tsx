import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  FilePlus, FileEdit, Trash2, ChevronDown, ChevronRight,
  Check, X, Eye, Code, ArrowRight
} from 'lucide-react'
import { diffLines, type Change } from 'diff'
import { MarkdownPreview } from './MarkdownPreview'
import type { FileChange, ChangeSet } from '@/lib/changeset-generator'

interface ChangeSetPreviewProps {
  changeSet: ChangeSet
  onAccept: () => void
  onCancel: () => void
  isCommitting?: boolean
}

export function ChangeSetPreview({ 
  changeSet, 
  onAccept, 
  onCancel,
  isCommitting = false 
}: ChangeSetPreviewProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<Record<string, 'diff' | 'preview'>>({})

  const toggleExpanded = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const toggleViewMode = (path: string) => {
    setViewMode(prev => ({
      ...prev,
      [path]: prev[path] === 'preview' ? 'diff' : 'preview'
    }))
  }

  const getActionIcon = (action: FileChange['action']) => {
    switch (action) {
      case 'create':
        return <FilePlus className="h-4 w-4 text-green-600" />
      case 'update':
        return <FileEdit className="h-4 w-4 text-blue-600" />
      case 'delete':
        return <Trash2 className="h-4 w-4 text-red-600" />
      case 'rename':
        return <ArrowRight className="h-4 w-4 text-purple-600" />
    }
  }

  const getActionColor = (action: FileChange['action']) => {
    switch (action) {
      case 'create':
        return 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
      case 'update':
        return 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30'
      case 'delete':
        return 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
      case 'rename':
        return 'border-purple-200 bg-purple-50 dark:border-purple-900 dark:bg-purple-950/30'
    }
  }

  const getActionLabel = (action: FileChange['action']) => {
    switch (action) {
      case 'create':
        return 'Create'
      case 'update':
        return 'Update'
      case 'delete':
        return 'Delete'
      case 'rename':
        return 'Rename'
    }
  }

  // Render unified diff
  const renderDiff = (oldText: string, newText: string) => {
    const changes = diffLines(oldText, newText)
    
    return (
      <div className="font-mono text-xs overflow-x-auto bg-gray-900 rounded-md p-3">
        {changes.map((change: Change, index: number) => {
          const lines = change.value.split('\n').filter((line, i, arr) => 
            // Keep all lines except trailing empty line
            i < arr.length - 1 || line !== ''
          )
          
          return lines.map((line, lineIndex) => {
            let className = 'text-gray-300'
            let prefix = ' '
            
            if (change.added) {
              className = 'text-green-400 bg-green-950/50'
              prefix = '+'
            } else if (change.removed) {
              className = 'text-red-400 bg-red-950/50'
              prefix = '-'
            }
            
            return (
              <div key={`${index}-${lineIndex}`} className={`${className} whitespace-pre-wrap`}>
                <span className="select-none opacity-50 mr-2">{prefix}</span>
                {line || ' '}
              </div>
            )
          })
        })}
      </div>
    )
  }

  // Group changes by action
  const creates = changeSet.changes.filter(c => c.action === 'create')
  const updates = changeSet.changes.filter(c => c.action === 'update')
  const deletes = changeSet.changes.filter(c => c.action === 'delete')
  const renames = changeSet.changes.filter(c => c.action === 'rename')

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border bg-muted/50 p-3">
        <p className="text-sm font-medium mb-1">Summary</p>
        <p className="text-sm text-muted-foreground">{changeSet.summary}</p>
        {changeSet.analysis && (
          <p className="text-xs text-muted-foreground mt-2 italic">{changeSet.analysis}</p>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-sm flex-wrap">
        {creates.length > 0 && (
          <span className="flex items-center gap-1 text-green-600">
            <FilePlus className="h-4 w-4" />
            {creates.length} new
          </span>
        )}
        {updates.length > 0 && (
          <span className="flex items-center gap-1 text-blue-600">
            <FileEdit className="h-4 w-4" />
            {updates.length} modified
          </span>
        )}
        {renames.length > 0 && (
          <span className="flex items-center gap-1 text-purple-600">
            <ArrowRight className="h-4 w-4" />
            {renames.length} renamed
          </span>
        )}
        {deletes.length > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <Trash2 className="h-4 w-4" />
            {deletes.length} deleted
          </span>
        )}
      </div>

      {/* Changes list */}
      <div className="space-y-2">
        {changeSet.changes.map((change, index) => {
          const isExpanded = expandedPaths.has(change.path)
          const mode = viewMode[change.path] || 'diff'
          const isMarkdown = change.path.endsWith('.md') || change.path.endsWith('.mdx')
          
          return (
            <div 
              key={`${change.path}-${index}`}
              className={`rounded-lg border ${getActionColor(change.action)}`}
            >
              {/* Header */}
              <button
                onClick={() => toggleExpanded(change.path)}
                className="w-full flex items-center gap-2 p-3 text-left hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                {getActionIcon(change.action)}
                <span className="text-xs font-medium uppercase tracking-wide opacity-70">
                  {getActionLabel(change.action)}
                </span>
                {change.action === 'rename' && change.previousPath ? (
                  <span className="text-sm flex-1 truncate flex items-center gap-1">
                    <code className="text-muted-foreground">{change.previousPath}</code>
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <code>{change.path}</code>
                  </span>
                ) : (
                  <code className="text-sm flex-1 truncate">{change.path}</code>
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {change.reason && (
                    <p className="text-xs text-muted-foreground italic">
                      {change.reason}
                    </p>
                  )}

                  {/* View mode toggle for markdown files */}
                  {isMarkdown && change.action !== 'delete' && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); toggleViewMode(change.path) }}
                        className="h-7 text-xs"
                      >
                        {mode === 'diff' ? (
                          <><Eye className="h-3 w-3 mr-1" /> Preview</>
                        ) : (
                          <><Code className="h-3 w-3 mr-1" /> Diff</>
                        )}
                      </Button>
                    </div>
                  )}
                  
                  {change.action === 'delete' ? (
                    <div className="rounded border bg-red-100 dark:bg-red-950/50 p-2">
                      <p className="text-xs text-red-700 dark:text-red-300 mb-2">
                        This file will be deleted.
                      </p>
                      {change.previousContent && (
                        <pre className="text-xs text-red-600 dark:text-red-400 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {change.previousContent.slice(0, 500)}
                          {change.previousContent.length > 500 && '...'}
                        </pre>
                      )}
                    </div>
                  ) : change.action === 'rename' ? (
                    <div className="space-y-2">
                      <div className="rounded border bg-purple-100 dark:bg-purple-950/50 p-2">
                        <p className="text-xs text-purple-700 dark:text-purple-300">
                          Moving from <code>{change.previousPath}</code> to <code>{change.path}</code>
                        </p>
                      </div>
                      {change.content && change.previousContent && change.content !== change.previousContent ? (
                        mode === 'preview' && isMarkdown ? (
                          <div className="rounded border bg-background p-4 max-h-96 overflow-y-auto">
                            <MarkdownPreview content={change.content} />
                          </div>
                        ) : (
                          <div className="max-h-80 overflow-y-auto">
                            {renderDiff(change.previousContent, change.content)}
                          </div>
                        )
                      ) : change.content ? (
                        mode === 'preview' && isMarkdown ? (
                          <div className="rounded border bg-background p-4 max-h-96 overflow-y-auto">
                            <MarkdownPreview content={change.content} />
                          </div>
                        ) : (
                          <div className="rounded border bg-background p-3 max-h-40 overflow-y-auto">
                            <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                              {change.content.slice(0, 500)}
                              {change.content.length > 500 && '...'}
                            </pre>
                          </div>
                        )
                      ) : null}
                    </div>
                  ) : change.action === 'update' && change.previousContent ? (
                    mode === 'preview' && isMarkdown ? (
                      <div className="rounded border bg-background p-4 max-h-96 overflow-y-auto">
                        <MarkdownPreview content={change.content || ''} />
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {renderDiff(change.previousContent, change.content || '')}
                      </div>
                    )
                  ) : change.action === 'create' ? (
                    mode === 'preview' && isMarkdown ? (
                      <div className="rounded border bg-background p-4 max-h-96 overflow-y-auto">
                        <MarkdownPreview content={change.content || ''} />
                      </div>
                    ) : (
                      <div className="rounded border bg-background p-3 max-h-80 overflow-y-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {change.content?.slice(0, 2000)}
                          {(change.content?.length || 0) > 2000 && '\n\n... (truncated)'}
                        </pre>
                      </div>
                    )
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Commit message */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Commit message</p>
        <p className="text-sm font-mono">{changeSet.commitMessage}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button 
          variant="outline" 
          onClick={onCancel}
          disabled={isCommitting}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button 
          onClick={onAccept} 
          className="flex-1"
          disabled={isCommitting}
        >
          <Check className="h-4 w-4 mr-2" />
          {isCommitting ? 'Committing...' : 'Commit Changes'}
        </Button>
      </div>
    </div>
  )
}
