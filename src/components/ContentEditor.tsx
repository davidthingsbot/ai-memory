import { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { generateChangeSet, reviseChangeSet, type ChangeSet } from '@/lib/changeset-generator'
import { commitChangeSet } from '@/lib/github-commit'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { 
  Sparkles, RotateCcw, Check, 
  ExternalLink, MessageSquare, FileEdit
} from 'lucide-react'
import { MicButton } from './MicButton'
import { WorkingBox } from './WorkingBox'
import { ChangeSetPreview } from './ChangeSetPreview'
import type { BrowseScope } from './RepoBrowser'

interface ContentEditorProps {
  scope: BrowseScope | null
  repoName: string
  onComplete?: () => void
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

  // Commit result
  const [commitUrl, setCommitUrl] = useState<string | null>(null)
  const [filesChanged, setFilesChanged] = useState(0)

  // Refs for textarea cursor position
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const feedbackInputRef = useRef<HTMLInputElement>(null)
  
  // Track the base text and insert position for content
  const contentBaseTextRef = useRef<string>('')
  const contentInsertPosRef = useRef<number>(0)
  
  // Track the base text and insert position for feedback
  const feedbackBaseTextRef = useRef<string>('')
  const feedbackInsertPosRef = useRef<number>(0)

  // Real-time transcription for content input
  const contentTranscription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      // Insert new text at the original cursor position
      const base = contentBaseTextRef.current
      const before = base.slice(0, insertPos)
      const after = base.slice(insertPos)
      setRawContent(before + newText + after)
    },
  })

  // Real-time transcription for feedback input
  const feedbackTranscription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      const base = feedbackBaseTextRef.current
      const before = base.slice(0, insertPos)
      const after = base.slice(insertPos)
      setFeedback(before + newText + after)
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

  // Content voice recording handler
  const handleContentRecordingChange = useCallback((isRecording: boolean) => {
    if (stage !== 'input') return
    
    if (isRecording) {
      setError(null)
      // Save current text and cursor position directly from DOM to avoid stale closure
      const currentText = contentTextareaRef.current?.value ?? ''
      const cursorPos = contentTextareaRef.current?.selectionStart ?? currentText.length
      contentBaseTextRef.current = currentText
      contentInsertPosRef.current = cursorPos
      contentTranscription.startRecording(cursorPos)
    } else {
      contentTranscription.stopRecording()
    }
  }, [stage, contentTranscription])

  // Feedback voice recording handler
  const handleFeedbackRecordingChange = useCallback((isRecording: boolean) => {
    if (stage !== 'preview') return
    
    if (isRecording) {
      setError(null)
      // Save current text and cursor position directly from DOM
      const currentText = feedbackInputRef.current?.value ?? ''
      const cursorPos = feedbackInputRef.current?.selectionStart ?? currentText.length
      feedbackBaseTextRef.current = currentText
      feedbackInsertPosRef.current = cursorPos
      feedbackTranscription.startRecording(cursorPos)
    } else {
      feedbackTranscription.stopRecording()
    }
  }, [stage, feedbackTranscription])

  const addStep = useCallback((step: string) => {
    setSteps(prev => [...prev, step])
  }, [])

  // Main action: generate changeset
  const handleGenerate = useCallback(async () => {
    if (!rawContent.trim()) return
    
    setError(null)
    setSteps([])
    setStage('generating')
    
    try {
      const result = await generateChangeSet({
        rawContent,
        scope,
        selectionContext: scope?.type === 'selection' ? scope.selectedText : undefined,
      }, addStep)
      
      addStep(`Generated ${result.changes.length} change(s)`)
      setChangeSet(result)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStage('input')
    }
  }, [rawContent, scope, addStep])

  // Revise changeset based on feedback
  const handleRevise = useCallback(async () => {
    if (!feedback.trim() || !changeSet) return
    
    setStage('generating')
    setError(null)
    setSteps([])

    try {
      const result = await reviseChangeSet(changeSet, feedback, addStep)
      
      addStep('Revision complete')
      setChangeSet(result)
      setFeedback('')
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision failed')
      setStage('preview')
    }
  }, [feedback, changeSet, addStep])

  // Commit changeset to GitHub
  const handleCommit = useCallback(async () => {
    if (!changeSet) return
    
    setStage('committing')
    setError(null)
    setSteps(['Committing changes to GitHub...'])

    try {
      const result = await commitChangeSet(changeSet)
      
      if (result.success) {
        addStep(`Committed ${result.filesChanged} file(s)`)
        setCommitUrl(result.url || null)
        setFilesChanged(result.filesChanged)
        setStage('done')
      } else {
        throw new Error(result.error || 'Commit failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
      setStage('preview')
    }
  }, [changeSet, addStep])

  // Reset to start new entry
  const handleReset = useCallback(() => {
    setRawContent('')
    setChangeSet(null)
    setFeedback('')
    setError(null)
    setCommitUrl(null)
    setFilesChanged(0)
    setSteps([])
    setStage('input')
    onComplete?.()
  }, [onComplete])

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
                  onChange={(e) => setRawContent(e.target.value)}
                  disabled={contentTranscription.isConnecting}
                  style={contentTranscription.isRecording ? { caretColor: 'transparent' } : undefined}
                />
                {/* Overlay with blinking cursor at text end while recording */}
                {contentTranscription.isRecording && (
                  <div 
                    className="absolute inset-0 pointer-events-none p-3 text-sm font-mono whitespace-pre-wrap break-words overflow-hidden"
                    aria-hidden="true"
                  >
                    <span className="invisible">{rawContent}</span>
                    <span className={cursorVisible ? 'opacity-100' : 'opacity-0'}>▌</span>
                    <span className="text-red-500">●</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <MicButton
                recording={contentTranscription.isRecording}
                transcribing={contentTranscription.isConnecting}
                onRecordingChange={handleContentRecordingChange}
                size="sm"
              />

              <Button
                onClick={handleGenerate}
                disabled={!rawContent.trim() || contentTranscription.isRecording || contentTranscription.isConnecting}
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

        {/* Stage: Generating */}
        {stage === 'generating' && (
          <div className="space-y-4">
            <WorkingBox steps={steps} isWorking={true} />
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
                  onChange={(e) => setFeedback(e.target.value)}
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

        {/* Stage: Committing */}
        {stage === 'committing' && (
          <div className="space-y-4">
            <WorkingBox steps={steps} isWorking={true} />
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
