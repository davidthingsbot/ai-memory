import { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { generateChangeSet, reviseChangeSet, type ChangeSet } from '@/lib/changeset-generator'
import { tidyText, improveText } from '@/lib/text-tools'
import { commitChangeSet } from '@/lib/github-commit'
import { clearContext, prefetchRepoStructure } from '@/lib/topic-finder'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { 
  Sparkles, RotateCcw, Check, 
  ExternalLink, MessageSquare, FileEdit,
  Undo2, Redo2
} from 'lucide-react'
import { MicButton } from './MicButton'
import { WorkingBox } from './WorkingBox'
import { ChangeSetPreview } from './ChangeSetPreview'
import type { BrowseScope } from './RepoBrowser'

interface ContentEditorProps {
  scope: BrowseScope | null
  repoName: string
  onComplete?: (wasCommit?: boolean) => void
}

type Stage = 'input' | 'generating' | 'preview' | 'committing' | 'done'

export function ContentEditor({ scope, repoName, onComplete }: ContentEditorProps) {
  // Input stage
  const [rawContent, setRawContent] = useState('')

  // Changeset result
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(null)
  const [feedback, setFeedback] = useState('')
  
  // UI state
  const [stage, setStage] = useState<Stage>('input')
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [workStartTime, setWorkStartTime] = useState<number | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  // Commit result
  const [commitUrl, setCommitUrl] = useState<string | null>(null)
  const [filesChanged, setFilesChanged] = useState(0)

  // Undo/redo stacks for content
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [redoStack, setRedoStack] = useState<string[]>([])
  
  // Push current content to undo stack (call before making changes)
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev, rawContent])
    setRedoStack([]) // Clear redo when new change happens
  }, [rawContent])
  
  // Undo - restore previous content
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, rawContent])
    setRawContent(previous)
  }, [undoStack, rawContent])
  
  // Redo - restore undone content
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, rawContent])
    setRawContent(next)
  }, [redoStack, rawContent])

  // Refs for textarea cursor position
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const feedbackInputRef = useRef<HTMLInputElement>(null)
  
  // Track the base text and insert position for content
  const contentBaseTextRef = useRef<string>('')
  const contentInsertPosRef = useRef<number>(0)
  // Track selection range continuously (updated on every selection change)
  const lastContentSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })
  
  // Track the base text and insert position for feedback
  const feedbackBaseTextRef = useRef<string>('')
  const feedbackInsertPosRef = useRef<number>(0)
  const lastFeedbackSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  // Real-time transcription for content input
  const contentTranscription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      // Insert new text at the original cursor position
      const base = contentBaseTextRef.current
      const before = base.slice(0, insertPos)
      const after = base.slice(insertPos)
      const newContent = before + newText + after
      setRawContent(newContent)
      
      // Restore cursor position after the inserted text
      requestAnimationFrame(() => {
        if (contentTextareaRef.current) {
          const newCursorPos = insertPos + newText.length
          contentTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      })
    },
  })

  // Real-time transcription for feedback input
  const feedbackTranscription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      const base = feedbackBaseTextRef.current
      const before = base.slice(0, insertPos)
      const after = base.slice(insertPos)
      setFeedback(before + newText + after)
      
      // Restore cursor position after the inserted text
      requestAnimationFrame(() => {
        if (feedbackInputRef.current) {
          const newCursorPos = insertPos + newText.length
          feedbackInputRef.current.setSelectionRange(newCursorPos, newCursorPos)
        }
      })
    },
  })

  // Blinking cursor for recording indicator
  const [cursorVisible, setCursorVisible] = useState(true)
  
  useEffect(() => {
    if (!contentTranscription.isRecording) {
      setCursorVisible(true)
      return
    }
    const interval = setInterval(() => {
      setCursorVisible(v => !v)
    }, 530)
    return () => clearInterval(interval)
  }, [contentTranscription.isRecording])

  // Track selection range in content textarea
  const handleContentCursorChange = useCallback(() => {
    if (contentTextareaRef.current) {
      lastContentSelectionRef.current = {
        start: contentTextareaRef.current.selectionStart,
        end: contentTextareaRef.current.selectionEnd,
      }
    }
  }, [])

  // Content voice recording handler
  const handleContentRecordingChange = useCallback((isRecording: boolean) => {
    if (stage !== 'input') return
    
    if (isRecording) {
      setError(null)
      // Use the last tracked selection (captured before button click stole focus)
      const currentText = contentTextareaRef.current?.value ?? rawContent
      const { start, end } = lastContentSelectionRef.current
      
      // If there's a selection, remove the selected text from base
      // and set insert position to the start of the selection
      if (start !== end) {
        // Remove selected text - transcription will replace it
        const textWithoutSelection = currentText.slice(0, start) + currentText.slice(end)
        contentBaseTextRef.current = textWithoutSelection
        contentInsertPosRef.current = start
        // Update display immediately so user sees selection removed
        setRawContent(textWithoutSelection)
      } else {
        contentBaseTextRef.current = currentText
        contentInsertPosRef.current = start
      }
      contentTranscription.startRecording(start)
    } else {
      contentTranscription.stopRecording()
    }
  }, [stage, contentTranscription, rawContent])

  // Track selection range in feedback input
  const handleFeedbackCursorChange = useCallback(() => {
    if (feedbackInputRef.current) {
      lastFeedbackSelectionRef.current = {
        start: feedbackInputRef.current.selectionStart ?? 0,
        end: feedbackInputRef.current.selectionEnd ?? 0,
      }
    }
  }, [])

  // Feedback voice recording handler
  const handleFeedbackRecordingChange = useCallback((isRecording: boolean) => {
    if (stage !== 'preview') return
    
    if (isRecording) {
      setError(null)
      // Use the last tracked selection, or current cursor from DOM, or end of text
      const currentText = feedbackInputRef.current?.value ?? feedback
      let start = lastFeedbackSelectionRef.current.start
      let end = lastFeedbackSelectionRef.current.end
      
      // If no tracked position, try to get from DOM or default to end
      if (start === 0 && end === 0 && currentText.length > 0) {
        start = feedbackInputRef.current?.selectionStart ?? currentText.length
        end = feedbackInputRef.current?.selectionEnd ?? currentText.length
      }
      
      // If there's a selection, remove the selected text from base
      if (start !== end) {
        const textWithoutSelection = currentText.slice(0, start) + currentText.slice(end)
        feedbackBaseTextRef.current = textWithoutSelection
        feedbackInsertPosRef.current = start
        setFeedback(textWithoutSelection)
      } else {
        feedbackBaseTextRef.current = currentText
        feedbackInsertPosRef.current = start
      }
      feedbackTranscription.startRecording(start)
    } else {
      feedbackTranscription.stopRecording()
    }
  }, [stage, feedbackTranscription, feedback])

  const addStep = useCallback((step: string) => {
    setSteps(prev => [...prev, step])
  }, [])

  // Main action: generate changeset
  const handleGenerate = useCallback(async () => {
    if (!rawContent.trim()) return
    
    setError(null)
    addStep('--- Generate')
    setWorkStartTime(Date.now())
    setIsWorking(true)
    setStage('generating')
    
    try {
      const result = await generateChangeSet({
        rawContent,
        scope,
        selectionContext: scope?.type === 'selection' ? scope.selectedText : undefined,
      }, addStep)
      
      addStep(`✓ Generated ${result.changes.length} change(s)`)
      setChangeSet(result)
      setIsWorking(false)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setIsWorking(false)
      setStage('input')
    }
  }, [rawContent, scope, addStep])

  // Build context for text tools from current scope
  const getTextContext = useCallback(() => ({
    filePath: scope?.path,
    fileContent: scope?.fileContent,
    selectedText: scope?.selectedText,
    repoName: repoName,
  }), [scope, repoName])

  // Tidy text - fix formatting, spelling, grammar
  const handleTidy = useCallback(async () => {
    if (!rawContent.trim()) return
    
    pushUndo() // Save current state for undo
    setError(null)
    addStep('--- Tidy')
    setWorkStartTime(Date.now())
    setIsWorking(true)
    
    try {
      const result = await tidyText(rawContent, addStep, getTextContext())
      setRawContent(result)
      setIsWorking(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tidy failed')
      setIsWorking(false)
    }
  }, [rawContent, addStep, pushUndo, getTextContext])

  // Improve text - reorganize, clarify, extend with research
  const handleImprove = useCallback(async () => {
    if (!rawContent.trim()) return
    
    pushUndo() // Save current state for undo
    setError(null)
    addStep('--- Improve')
    setWorkStartTime(Date.now())
    setIsWorking(true)
    
    try {
      const result = await improveText(rawContent, addStep, getTextContext())
      setRawContent(result)
      setIsWorking(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Improve failed')
      setIsWorking(false)
    }
  }, [rawContent, addStep, pushUndo, getTextContext])

  // Revise changeset based on feedback
  const handleRevise = useCallback(async () => {
    if (!feedback.trim() || !changeSet) return
    
    // Keep existing steps and append revision steps
    addStep(`--- Revision requested: "${feedback.slice(0, 50)}${feedback.length > 50 ? '...' : ''}"`)
    setStage('generating')
    setError(null)
    setWorkStartTime(Date.now())
    setIsWorking(true)

    try {
      const result = await reviseChangeSet(changeSet, feedback, rawContent, addStep)
      
      addStep('✓ Revision complete')
      setChangeSet(result)
      setFeedback('')
      setIsWorking(false)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision failed')
      setIsWorking(false)
      setStage('preview')
    }
  }, [feedback, changeSet, rawContent, addStep])

  // Commit changeset to GitHub
  const handleCommit = useCallback(async () => {
    if (!changeSet) return
    
    setStage('committing')
    setError(null)
    addStep('--- Committing to GitHub...')
    setWorkStartTime(Date.now())
    setIsWorking(true)

    try {
      const result = await commitChangeSet(changeSet)
      
      if (result.success) {
        addStep(`✓ Committed ${result.filesChanged} file(s)`)
        
        // Refresh repo context since files changed
        addStep('Refreshing repository context...')
        clearContext()
        await prefetchRepoStructure()
        addStep('✓ Context updated')
        
        setCommitUrl(result.url || null)
        setFilesChanged(result.filesChanged)
        setIsWorking(false)
        setStage('done')
      } else {
        throw new Error(result.error || 'Commit failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
      setIsWorking(false)
      setStage('preview')
    }
  }, [changeSet, addStep])

  // Reset to start new entry
  const handleReset = useCallback(() => {
    const wasCommit = stage === 'done' // We're in done stage means commit succeeded
    setRawContent('')
    setChangeSet(null)
    setFeedback('')
    setError(null)
    setCommitUrl(null)
    setFilesChanged(0)
    setSteps([])
    setWorkStartTime(null)
    setIsWorking(false)
    setStage('input')
    onComplete?.(wasCommit)
  }, [onComplete, stage])

  // Back to editing input
  const handleBackToInput = useCallback(() => {
    setStage('input')
    setChangeSet(null)
    setSteps([])
  }, [])

  // Build context description for card
  const contextDescription = scope 
    ? scope.type === 'file' 
      ? `File: ${scope.path}`
      : scope.type === 'selection'
        ? `Selection in: ${scope.path}`
        : `Directory: ${scope.path}`
    : `Repository: ${repoName}`

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {stage === 'done' ? (
            <Check className="h-5 w-5 text-green-600" />
          ) : (
            <FileEdit className="h-5 w-5" />
          )}
          Content
          {stage === 'done' && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-2">
              {filesChanged} file{filesChanged !== 1 ? 's' : ''} committed
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {changeSet 
            ? changeSet.summary
            : contextDescription
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Stage: Input */}
        {stage === 'input' && (
          <>
            <div className="space-y-2">
              <div className="relative">
                <textarea
                  ref={contentTextareaRef}
                  className="w-full min-h-[150px] p-3 rounded-md border bg-background resize-y text-sm font-mono"
                  placeholder={contentTranscription.isRecording ? '' : "Ramble your thoughts... Don't worry about structure, just get the information down."}
                  value={rawContent}
                  onChange={(e) => {
                    setRawContent(e.target.value)
                    handleContentCursorChange()
                  }}
                  onSelect={handleContentCursorChange}
                  onClick={handleContentCursorChange}
                  onKeyUp={handleContentCursorChange}
                  disabled={contentTranscription.isConnecting}
                  style={contentTranscription.isRecording ? { caretColor: 'transparent', color: 'transparent' } : undefined}
                />
                {/* Overlay with blinking cursor at insert position while recording */}
                {contentTranscription.isRecording && (() => {
                  // Calculate cursor position: insert point + length of transcribed text so far
                  const baseLen = contentBaseTextRef.current.length
                  const transcribedLen = rawContent.length - baseLen
                  const cursorPos = contentInsertPosRef.current + transcribedLen
                  const beforeCursor = rawContent.slice(0, cursorPos)
                  const afterCursor = rawContent.slice(cursorPos)
                  
                  return (
                    <div 
                      className="absolute inset-0 pointer-events-none p-3 text-sm font-mono whitespace-pre-wrap break-words overflow-hidden"
                      aria-hidden="true"
                    >
                      <span>{beforeCursor}</span>
                      <span className={cursorVisible ? 'opacity-100' : 'opacity-0'}>▌</span>
                      <span className="text-red-500">●</span>
                      <span>{afterCursor}</span>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              <MicButton
                recording={contentTranscription.isRecording}
                transcribing={contentTranscription.isConnecting}
                onRecordingChange={handleContentRecordingChange}
                size="sm"
              />

              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || isWorking}
                title="Undo"
              >
                <Undo2 className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRedo}
                disabled={redoStack.length === 0 || isWorking}
                title="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </Button>

              <div className="w-px h-6 bg-border" />

              <Button
                variant="outline"
                onClick={handleTidy}
                disabled={!rawContent.trim() || isWorking || contentTranscription.isRecording}
                title="Fix spelling, grammar, formatting"
              >
                Tidy
              </Button>

              <Button
                variant="outline"
                onClick={handleImprove}
                disabled={!rawContent.trim() || isWorking || contentTranscription.isRecording}
                title="Reorganize, clarify, extend with web research"
              >
                Improve
              </Button>

              <Button
                onClick={handleGenerate}
                disabled={!rawContent.trim() || isWorking || contentTranscription.isRecording || contentTranscription.isConnecting}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </Button>
            </div>

            {(error || contentTranscription.error) && (
              <p className="text-sm text-destructive">{error || contentTranscription.error}</p>
            )}

            {contentTranscription.isRecording && (
              <div className="flex items-center gap-2 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-muted-foreground">
                  {contentTranscription.isSpeaking ? 'Listening...' : 'Waiting for speech...'}
                </span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Tap mic to start/stop recording. Words appear as you speak.
            </p>
          </>
        )}

        {/* WorkingBox - always visible when there are steps */}
        {steps.length > 0 && (
          <WorkingBox 
            steps={steps} 
            isWorking={isWorking} 
            startTime={workStartTime || undefined}
          />
        )}

        {/* Stage: Generating - just show loading state since WorkingBox is above */}
        {stage === 'generating' && steps.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <span className="animate-pulse">Initializing...</span>
          </div>
        )}

        {/* Stage: Preview - Show changeset */}
        {stage === 'preview' && changeSet && (
          <>
            <ChangeSetPreview
              changeSet={changeSet}
              onAccept={handleCommit}
              onCancel={handleBackToInput}
              isCommitting={false}
            />

            {/* Feedback section */}
            <div className="space-y-2 pt-4 border-t">
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Revise (optional)
              </label>
              <div className="flex gap-2">
                <MicButton
                  recording={feedbackTranscription.isRecording}
                  transcribing={feedbackTranscription.isConnecting}
                  onRecordingChange={handleFeedbackRecordingChange}
                  className="shrink-0"
                />
                <Input
                  ref={feedbackInputRef}
                  placeholder="e.g., Also add a section about..."
                  value={feedback}
                  onChange={(e) => {
                    setFeedback(e.target.value)
                    handleFeedbackCursorChange()
                  }}
                  onSelect={handleFeedbackCursorChange}
                  onClick={handleFeedbackCursorChange}
                  onKeyUp={handleFeedbackCursorChange}
                  onFocus={handleFeedbackCursorChange}
                  onBlur={handleFeedbackCursorChange}
                  onKeyDown={(e) => e.key === 'Enter' && feedback.trim() && handleRevise()}
                  disabled={feedbackTranscription.isRecording || feedbackTranscription.isConnecting}
                />
                <Button
                  variant="outline"
                  onClick={handleRevise}
                  disabled={!feedback.trim() || feedbackTranscription.isRecording || feedbackTranscription.isConnecting}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Revise
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}

        {/* Stage: Committing - WorkingBox already visible above */}
        {stage === 'committing' && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <span className="animate-pulse">Pushing to GitHub...</span>
          </div>
        )}

        {/* Stage: Done */}
        {stage === 'done' && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4 text-center">
              <Check className="h-8 w-8 mx-auto text-green-600 dark:text-green-400 mb-2" />
              <p className="font-medium">Successfully committed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {filesChanged} file{filesChanged !== 1 ? 's' : ''} changed
              </p>
              {commitUrl && (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
                >
                  View on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <Button onClick={handleReset} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              Restart
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
