import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { findTopicLocation, type TopicResult } from '@/lib/topic-finder'
import { generateContent, reviseContent, type GeneratedContent } from '@/lib/content-generator'
import { commitFile } from '@/lib/github-commit'
import { startRecording, stopRecording, transcribeAudio } from '@/lib/audio-transcribe'
import { 
  FileText, Sparkles, RotateCcw, Check, 
  ExternalLink, MessageSquare, FilePlus, FileEdit, Search
} from 'lucide-react'
import { MicButton } from './MicButton'
import { WorkingBox } from './WorkingBox'
import type { BrowseScope } from './RepoBrowser'

interface ContentEditorProps {
  scope: BrowseScope | null
  repoName: string
  onComplete?: () => void
}

type Stage = 'input' | 'finding' | 'generating' | 'preview' | 'committing' | 'done'

export function ContentEditor({ scope, repoName, onComplete }: ContentEditorProps) {
  // Input stage
  const [description, setDescription] = useState('')
  const [rawNotes, setRawNotes] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)

  // Location finding result (resolved from scope or found by AI)
  const [topicResult, setTopicResult] = useState<TopicResult | null>(null)

  // Preview stage
  const [stage, setStage] = useState<Stage>('input')
  const [generated, setGenerated] = useState<GeneratedContent | null>(null)
  const [editedMarkdown, setEditedMarkdown] = useState('')
  const [feedback, setFeedback] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Feedback voice recording state
  const [feedbackRecording, setFeedbackRecording] = useState(false)
  const [feedbackTranscribing, setFeedbackTranscribing] = useState(false)

  // Commit result
  const [commitUrl, setCommitUrl] = useState<string | null>(null)

  // Determine if we need to find location or can proceed directly
  const needsLocationFinding = !scope || scope.type === 'directory'
  
  // For file/selection scope, we know the path immediately
  const resolvedPath = scope?.type === 'file' || scope?.type === 'selection' 
    ? scope.path 
    : null

  // Content voice recording handler
  const handleContentRecordingChange = useCallback(async (isRecording: boolean) => {
    if (stage !== 'input') return
    
    if (isRecording) {
      try {
        setError(null)
        await startRecording()
        setRecording(true)
      } catch (err) {
        setError('Could not access microphone')
      }
    } else {
      setRecording(false)
      setTranscribing(true)
      setError(null)

      try {
        const blob = await stopRecording()
        const text = await transcribeAudio(blob)
        if (text.trim()) {
          // Append to notes (or description if notes empty and description empty)
          if (!description && !rawNotes) {
            setDescription(text)
          } else {
            setRawNotes(prev => prev + (prev ? ' ' : '') + text)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transcription failed')
      } finally {
        setTranscribing(false)
      }
    }
  }, [stage, description, rawNotes])

  // Feedback voice recording handler
  const handleFeedbackRecordingChange = useCallback(async (isRecording: boolean) => {
    if (stage !== 'preview') return
    
    if (isRecording) {
      try {
        setError(null)
        await startRecording()
        setFeedbackRecording(true)
      } catch (err) {
        setError('Could not access microphone')
      }
    } else {
      setFeedbackRecording(false)
      setFeedbackTranscribing(true)
      setError(null)

      try {
        const blob = await stopRecording()
        const text = await transcribeAudio(blob)
        if (text.trim()) {
          setFeedback(prev => prev + (prev ? ' ' : '') + text)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transcription failed')
      } finally {
        setFeedbackTranscribing(false)
      }
    }
  }, [stage])

  const addStep = useCallback((step: string) => {
    setSteps(prev => [...prev, step])
  }, [])

  // Main action: find location (if needed) then generate
  const handleGenerate = useCallback(async () => {
    if (!description.trim()) return
    
    setError(null)
    setSteps([])

    let effectiveTopicResult: TopicResult

    // If we need to find location first
    if (needsLocationFinding) {
      setStage('finding')
      
      try {
        addStep('Finding best location for this content...')
        const location = await findTopicLocation(description, addStep, scope)
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
      // Combine description and notes for content generation
      const combinedContent = rawNotes 
        ? description + '\n\n' + rawNotes
        : description

      const result = await generateContent({
        topicResult: effectiveTopicResult,
        rawContent: combinedContent,
      }, addStep)
      
      addStep('Content generated')
      setGenerated(result)
      setEditedMarkdown(result.markdown)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStage('input')
    }
  }, [description, rawNotes, needsLocationFinding, scope, resolvedPath, addStep])

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
    setDescription('')
    setRawNotes('')
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
            {/* Description field */}
            <div className="space-y-2">
              <label className="text-sm font-medium">What do you want to document?</label>
              <Input
                placeholder={needsLocationFinding 
                  ? "e.g., How to prune apple trees in winter"
                  : "e.g., Add section about winter pruning techniques"
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={recording || transcribing}
              />
              {needsLocationFinding && (
                <p className="text-xs text-muted-foreground">
                  AI will find the best location in {scope ? `"${scope.path}"` : 'your repository'} for this content.
                </p>
              )}
            </div>

            {/* Notes field */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Your notes (optional)</label>
              <textarea
                className="w-full min-h-[120px] p-3 rounded-md border bg-background resize-y text-sm"
                placeholder="Ramble your thoughts... Don't worry about structure, just get the information down. You can also leave this empty and just use the description above."
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                disabled={recording || transcribing}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <MicButton
                recording={recording}
                transcribing={transcribing}
                onRecordingChange={handleContentRecordingChange}
                size="sm"
              />

              <Button
                onClick={handleGenerate}
                disabled={!description.trim() || recording || transcribing}
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <p className="text-xs text-muted-foreground">
              Speak or type. First recording goes to description, subsequent ones append to notes.
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

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Preview (editable)
              </label>
              <textarea
                className="w-full min-h-[250px] p-3 rounded-md border bg-background resize-y text-sm font-mono"
                value={editedMarkdown}
                onChange={(e) => setEditedMarkdown(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Feedback (optional)
              </label>
              <div className="flex gap-2">
                <MicButton
                  recording={feedbackRecording}
                  transcribing={feedbackTranscribing}
                  onRecordingChange={handleFeedbackRecordingChange}
                  className="shrink-0"
                />
                <Input
                  placeholder="e.g., Add more detail about timing"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && feedback.trim() && handleRevise()}
                  disabled={feedbackRecording || feedbackTranscribing}
                />
                <Button
                  variant="outline"
                  onClick={handleRevise}
                  disabled={!feedback.trim() || feedbackRecording || feedbackTranscribing}
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
