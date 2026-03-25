import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { findTopicLocation, type TopicResult } from '@/lib/topic-finder'
import { generateContent, reviseContent, type GeneratedContent } from '@/lib/content-generator'
import { commitFile } from '@/lib/github-commit'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { 
  FileText, Sparkles, RotateCcw, Check, 
  ExternalLink, MessageSquare, FilePlus, FileEdit, Search, Eye, Code
} from 'lucide-react'
import { MicButton } from './MicButton'
import { WorkingBox } from './WorkingBox'
import { MarkdownPreview } from './MarkdownPreview'
import type { BrowseScope } from './RepoBrowser'

interface ContentEditorProps {
  scope: BrowseScope | null
  repoName: string
  onComplete?: () => void
}

type Stage = 'input' | 'finding' | 'generating' | 'preview' | 'committing' | 'done'

export function ContentEditor({ scope, repoName, onComplete }: ContentEditorProps) {
  // Input stage
  const [rawContent, setRawContent] = useState('')

  // Location finding result (resolved from scope or found by AI)
  const [topicResult, setTopicResult] = useState<TopicResult | null>(null)

  // Preview stage
  const [stage, setStage] = useState<Stage>('input')
  const [generated, setGenerated] = useState<GeneratedContent | null>(null)
  const [editedMarkdown, setEditedMarkdown] = useState('')
  const [feedback, setFeedback] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Commit result
  const [commitUrl, setCommitUrl] = useState<string | null>(null)

  // Preview mode toggle
  const [showRaw, setShowRaw] = useState(false)

  // Determine if we need to find location or can proceed directly
  const needsLocationFinding = !scope || scope.type === 'directory'
  
  // For file/selection scope, we know the path immediately
  const resolvedPath = scope?.type === 'file' || scope?.type === 'selection' 
    ? scope.path 
    : null

  // Real-time transcription for content input
  const contentTranscription = useRealtimeTranscription({
    onTranscriptUpdate: (text) => {
      // Replace content with streaming transcript while recording
      setRawContent(text)
    },
  })

  // Real-time transcription for feedback input
  const feedbackTranscription = useRealtimeTranscription({
    onTranscriptUpdate: (text) => {
      setFeedback(text)
    },
  })

  // Content voice recording handler
  const handleContentRecordingChange = useCallback((isRecording: boolean) => {
    if (stage !== 'input') return
    
    if (isRecording) {
      setError(null)
      contentTranscription.startRecording()
    } else {
      contentTranscription.stopRecording()
    }
  }, [stage, contentTranscription])

  // Feedback voice recording handler
  const handleFeedbackRecordingChange = useCallback((isRecording: boolean) => {
    if (stage !== 'preview') return
    
    if (isRecording) {
      setError(null)
      feedbackTranscription.startRecording()
    } else {
      feedbackTranscription.stopRecording()
    }
  }, [stage, feedbackTranscription])

  const addStep = useCallback((step: string) => {
    setSteps(prev => [...prev, step])
  }, [])

  // Main action: find location (if needed) then generate
  const handleGenerate = useCallback(async () => {
    if (!rawContent.trim()) return
    
    setError(null)
    setSteps([])

    let effectiveTopicResult: TopicResult

    // If we need to find location first
    if (needsLocationFinding) {
      setStage('finding')
      
      try {
        addStep('Finding best location for this content...')
        const location = await findTopicLocation(rawContent, addStep, scope)
        addStep('Location found: ' + location.path)
        effectiveTopicResult = location
        setTopicResult(location)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Location finding failed')
        setStage('input')
        return
      }
    } else {
      // Resolve directly from scope
      effectiveTopicResult = {
        action: 'update',
        path: resolvedPath!,
        reason: scope?.type === 'selection' 
          ? 'Updating file based on selected passage'
          : 'Updating selected file',
        existingContent: scope?.fileContent,
      }
      setTopicResult(effectiveTopicResult)
    }

    // Now generate content
    setStage('generating')
    
    try {
      const result = await generateContent({
        topicResult: effectiveTopicResult,
        rawContent,
        selectionContext: scope?.type === 'selection' ? scope.selectedText : undefined,
      }, addStep)
      
      addStep('Content generated')
      setGenerated(result)
      setEditedMarkdown(result.markdown)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStage('input')
    }
  }, [rawContent, needsLocationFinding, scope, resolvedPath, addStep])

  // Revise content
  const handleRevise = useCallback(async () => {
    if (!feedback.trim() || !editedMarkdown || !topicResult) return
    
    setStage('generating')
    setError(null)
    setSteps([])

    try {
      const result = await reviseContent(
        editedMarkdown,
        feedback,
        topicResult,
        addStep
      )
      
      addStep('Revision complete')
      setGenerated(result)
      setEditedMarkdown(result.markdown)
      setFeedback('')
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision failed')
      setStage('preview')
    }
  }, [feedback, editedMarkdown, topicResult, addStep])

  // Commit to GitHub
  const handleCommit = useCallback(async () => {
    if (!editedMarkdown || !generated || !topicResult) return
    
    setStage('committing')
    setError(null)
    setSteps(['Committing to GitHub...'])

    try {
      const result = await commitFile(
        topicResult.path,
        editedMarkdown,
        generated.commitMessage
      )
      
      if (result.success) {
        addStep('Committed successfully')
        setCommitUrl(result.url || null)
        setStage('done')
      } else {
        throw new Error(result.error || 'Commit failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
      setStage('preview')
    }
  }, [editedMarkdown, generated, topicResult, addStep])

  // Reset to start new entry
  const handleReset = useCallback(() => {
    setRawContent('')
    setTopicResult(null)
    setGenerated(null)
    setEditedMarkdown('')
    setFeedback('')
    setError(null)
    setCommitUrl(null)
    setSteps([])
    setStage('input')
    onComplete?.()
  }, [onComplete])

  // Back to editing input
  const handleBackToInput = useCallback(() => {
    setStage('input')
    setTopicResult(null)
    setGenerated(null)
    setEditedMarkdown('')
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
          ) : topicResult?.action === 'create' ? (
            <FilePlus className="h-5 w-5" />
          ) : (
            <FileEdit className="h-5 w-5" />
          )}
          Content
          {stage === 'done' && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-2">
              Committed
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {topicResult 
            ? <>{topicResult.action === 'create' ? 'Creating' : 'Updating'} <code className="text-xs">{topicResult.path}</code></>
            : contextDescription
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Stage: Input */}
        {stage === 'input' && (
          <>
            <div className="space-y-2">
              <textarea
                className="w-full min-h-[150px] p-3 rounded-md border bg-background resize-y text-sm"
                placeholder="Ramble your thoughts... Don't worry about structure, just get the information down."
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                disabled={contentTranscription.isConnecting}
              />
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
                {needsLocationFinding ? (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Find & Generate
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
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

        {/* Stage: Finding location */}
        {stage === 'finding' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Finding the best location for your content...</p>
            <WorkingBox steps={steps} isWorking={true} />
          </div>
        )}

        {/* Stage: Generating */}
        {stage === 'generating' && (
          <div className="space-y-4">
            <WorkingBox steps={steps} isWorking={true} />
          </div>
        )}

        {/* Stage: Preview */}
        {stage === 'preview' && topicResult && (
          <>
            {/* Show analysis info for updates */}
            {generated?.strategy && (
              <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3 text-sm space-y-1">
                <p className="font-medium text-blue-800 dark:text-blue-200">
                  {generated.strategy === 'expand_section' && 'Expanding existing section'}
                  {generated.strategy === 'new_section' && 'Creating new section'}
                  {generated.strategy === 'inline_addition' && 'Adding inline content'}
                </p>
                {generated.location && (
                  <p className="text-blue-700 dark:text-blue-300">
                    Location: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{generated.location}</code>
                  </p>
                )}
                {generated.analysis && (
                  <p className="text-blue-600 dark:text-blue-400 text-xs">{generated.analysis}</p>
                )}
              </div>
            )}

            {/* Preview/Edit toggle */}
            <div className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
                <span className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {showRaw ? 'Edit' : 'Preview'}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowRaw(!showRaw)}
                  title={showRaw ? 'Show rendered preview' : 'Edit raw markdown'}
                >
                  {showRaw ? <Eye className="h-4 w-4" /> : <Code className="h-4 w-4" />}
                  <span className="ml-1 text-xs">{showRaw ? 'Preview' : 'Edit'}</span>
                </Button>
              </div>
              
              {showRaw ? (
                <textarea
                  className="w-full min-h-[300px] p-4 bg-background resize-y text-sm font-mono border-0 focus:ring-0 focus:outline-none"
                  value={editedMarkdown}
                  onChange={(e) => setEditedMarkdown(e.target.value)}
                />
              ) : (
                <div className="p-4 max-h-[400px] overflow-y-auto bg-background">
                  <MarkdownPreview 
                    content={editedMarkdown}
                    basePath={topicResult.path.split('/').slice(0, -1).join('/')}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Feedback (optional)
              </label>
              <div className="flex gap-2">
                <MicButton
                  recording={feedbackTranscription.isRecording}
                  transcribing={feedbackTranscription.isConnecting}
                  onRecordingChange={handleFeedbackRecordingChange}
                  className="shrink-0"
                />
                <Input
                  placeholder="e.g., Add more detail about timing"
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

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleBackToInput}>
                Back
              </Button>
              <Button onClick={handleCommit} className="flex-1">
                <Check className="h-4 w-4 mr-2" />
                Accept & Commit
              </Button>
            </div>
          </>
        )}

        {/* Stage: Committing */}
        {stage === 'committing' && (
          <div className="space-y-4">
            <WorkingBox steps={steps} isWorking={true} />
          </div>
        )}

        {/* Stage: Done */}
        {stage === 'done' && topicResult && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4 text-center">
              <Check className="h-8 w-8 mx-auto text-green-600 dark:text-green-400 mb-2" />
              <p className="font-medium">Successfully committed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {topicResult.action === 'create' ? 'Created' : 'Updated'}{' '}
                <code className="text-xs">{topicResult.path}</code>
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
              <FilePlus className="h-4 w-4 mr-2" />
              Add Another Entry
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
