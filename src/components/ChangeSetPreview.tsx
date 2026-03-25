import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  FilePlus, FileEdit, Trash2, ChevronDown, ChevronRight,
  Check, X
} from 'lucide-react'
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

  const getActionIcon = (action: FileChange['action']) => {
    switch (action) {
      case 'create':
        return <FilePlus className="h-4 w-4 text-green-600" />
      case 'update':
        return <FileEdit className="h-4 w-4 text-blue-600" />
      case 'delete':
        return <Trash2 className="h-4 w-4 text-red-600" />
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
    }
  }

  // Group changes by action
  const creates = changeSet.changes.filter(c => c.action === 'create')
  const updates = changeSet.changes.filter(c => c.action === 'update')
  const deletes = changeSet.changes.filter(c => c.action === 'delete')

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
      <div className="flex gap-4 text-sm">
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
                <code className="text-sm flex-1 truncate">{change.path}</code>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {change.reason && (
                    <p className="text-xs text-muted-foreground italic">
                      {change.reason}
                    </p>
                  )}
                  
                  {change.action === 'delete' ? (
                    <div className="rounded border bg-red-100 dark:bg-red-950/50 p-2">
                      <p className="text-xs text-red-700 dark:text-red-300">
                        This file will be deleted.
                      </p>
                      {change.previousContent && (
                        <pre className="mt-2 text-xs text-red-600 dark:text-red-400 overflow-x-auto max-h-40 overflow-y-auto">
                          {change.previousContent.slice(0, 500)}
                          {change.previousContent.length > 500 && '...'}
                        </pre>
                      )}
                    </div>
                  ) : change.action === 'update' && change.previousContent ? (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Changes:</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded border bg-red-50 dark:bg-red-950/30 p-2">
                          <div className="font-medium text-red-700 dark:text-red-300 mb-1">Before</div>
                          <pre className="text-red-600 dark:text-red-400 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                            {change.previousContent.slice(0, 300)}
                            {change.previousContent.length > 300 && '...'}
                          </pre>
                        </div>
                        <div className="rounded border bg-green-50 dark:bg-green-950/30 p-2">
                          <div className="font-medium text-green-700 dark:text-green-300 mb-1">After</div>
                          <pre className="text-green-600 dark:text-green-400 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                            {change.content?.slice(0, 300)}
                            {(change.content?.length || 0) > 300 && '...'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded border bg-background p-2">
                      <pre className="text-xs overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                        {change.content?.slice(0, 1000)}
                        {(change.content?.length || 0) > 1000 && '...'}
                      </pre>
                    </div>
                  )}
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
