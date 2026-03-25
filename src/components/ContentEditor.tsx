import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type TopicResult } from '@/lib/topic-finder'
import { generateContent, reviseContent, type GeneratedContent } from '@/lib/content-generator'
import { commitFile } from '@/lib/github-commit'
import { startRecording, stopRecording, cancelRecording, transcribeAudio } from '@/lib/audio-transcribe'
import { 
  FileText, Mic, Sparkles, Loader2, RotateCcw, Check, 
  ExternalLink, MessageSquare, FilePlus, FileEdit
} from 'lucide-react'

interface ContentEditorProps {
  topicResult: TopicResult
  repoName?: string // For future use
  onComplete?: () => void
}

type Stage = 'input' | 'generating' | 'preview' | 'committing' | 'done'

export function ContentEditor({ topicResult, onComplete }: ContentEditorProps) {
  // Input stage
  const [rawContent, setRawContent] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recordingRef = useRef(false)
  const recordStartTime = useRef(0)
  const isHoldMode = useRef(false)

  // Preview stage
  const [stage, setStage] = useState<Stage>('input')
  const [generated, setGenerated] = useState<GeneratedContent | null>(null)
  const [editedMarkdown, setEditedMarkdown] = useState('')
  const [feedback, setFeedback] = useState('')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Commit result
  const [commitUrl, setCommitUrl] = useState<string | null>(null)

  // Voice recording - tap to toggle or hold to record
  const startRec = useCallback(async () => {
    if (stage !== 'input' || transcribing) return
    try {
      setError(null)
      await startRecording()
      setRecording(true)
      recordingRef.current = true
      recordStartTime.current = Date.now()
    } catch (err) {
      setError('Could not access microphone')
    }
  }, [stage, transcribing])

  const stopRec = useCallback(async () => {
    if (!recordingRef.current) return
    
    const duration = Date.now() - recordStartTime.current
    recordingRef.current = false
    setRecording(false)
    
    if (duration < 300) {
      cancelRecording()
      return
    }
    
    setTranscribing(true)
    setError(null)

    try {
      const blob = await stopRecording()
      const text = await transcribeAudio(blob)
      if (text.trim()) {
        setRawContent(prev => prev + (prev ? ' ' : '') + text)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }, [])

  const handleMicClick = useCallback(async () => {
    if (stage !== 'input' || transcribing) return
    
    if (recordingRef.current) {
      isHoldMode.current = false
      await stopRec()
    } else {
      isHoldMode.current = false
      await startRec()
    }
  }, [stage, transcribing, startRec, stopRec])

  const handleMicDown = useCallback(() => {
    isHoldMode.current = true
  }, [])

  const handleMicUp = useCallback(async () => {
    if (isHoldMode.current && recordingRef.current) {
      const duration = Date.now() - recordStartTime.current
      if (duration > 300) {
        await stopRec()
      }
    }
  }, [stopRec])

  const handleMicLeave = useCallback(() => {
    if (isHoldMode.current && recordingRef.current) {
      stopRec()
    }
  }, [stopRec])

  // Generate content
  const handleGenerate = useCallback(async () => {
    if (!rawContent.trim()) return
    
    setStage('generating')
    setError(null)
    setProgress('Starting...')

    try {
      const result = await generateContent({
        topicResult,
        rawContent,
      }, setProgress)
      
      setGenerated(result)
      setEditedMarkdown(result.markdown)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStage('input')
    }
  }, [rawContent, topicResult])

  // Revise content
  const handleRevise = useCallback(async () => {
    if (!feedback.trim() || !editedMarkdown) return
    
    setStage('generating')
    setError(null)
    setProgress('Revising...')

    try {
      const result = await reviseContent(
        editedMarkdown,
        feedback,
        topicResult,
        setProgress
      )
      
      setGenerated(result)
      setEditedMarkdown(result.markdown)
      setFeedback('')
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision failed')
      setStage('preview')
    }
  }, [feedback, editedMarkdown, topicResult])

  // Commit to GitHub
  const handleCommit = useCallback(async () => {
    if (!editedMarkdown || !generated) return
    
    setStage('committing')
    setError(null)
    setProgress('Committing to GitHub...')

    try {
      const result = await commitFile(
        topicResult.path,
        editedMarkdown,
        generated.commitMessage
      )
      
      if (result.success) {
        setCommitUrl(result.url || null)
        setStage('done')
      } else {
        throw new Error(result.error || 'Commit failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
      setStage('preview')
    }
  }, [editedMarkdown, generated, topicResult])

  // Reset to start new entry
  const handleReset = useCallback(() => {
    setRawContent('')
    setGenerated(null)
    setEditedMarkdown('')
    setFeedback('')
    setError(null)
    setCommitUrl(null)
    setStage('input')
    onComplete?.()
  }, [onComplete])

  // Back to editing input
  const handleBackToInput = useCallback(() => {
    setStage('input')
    setGenerated(null)
    setEditedMarkdown('')
  }, [])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {topicResult.action === 'create' ? (
            <FilePlus className="h-5 w-5" />
          ) : (
            <FileEdit className="h-5 w-5" />
          )}
          Content
          {stage === 'done' && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-2">
              <Check className="h-3 w-3" /> Committed
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {topicResult.action === 'create' ? 'Creating' : 'Updating'}{' '}
          <code className="text-xs">{topicResult.path}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Stage: Input */}
        {stage === 'input' && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Your notes</label>
              <textarea
                className="w-full min-h-[150px] p-3 rounded-md border bg-background resize-y text-sm"
                placeholder="Type or dictate your thoughts... Don't worry about structure, just get the information down."
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                disabled={recording || transcribing}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant={recording ? "destructive" : "outline"}
                size="sm"
                onClick={handleMicClick}
                onMouseDown={handleMicDown}
                onMouseUp={handleMicUp}
                onMouseLeave={handleMicLeave}
                onTouchStart={(e) => { e.preventDefault(); handleMicDown(); handleMicClick() }}
                onTouchEnd={(e) => { e.preventDefault(); handleMicUp() }}
                disabled={transcribing}
                className={recording ? 'animate-pulse' : ''}
              >
                {transcribing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Mic className={`h-4 w-4 mr-2 ${recording ? 'text-white' : ''}`} />
                )}
                {recording ? 'Tap to stop' : transcribing ? 'Transcribing...' : 'Tap or hold'}
              </Button>

              <Button
                onClick={handleGenerate}
                disabled={!rawContent.trim()}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <p className="text-xs text-muted-foreground">
              Speak or type your notes. You can record multiple times — each recording appends to your notes.
              When ready, click Generate to create polished documentation.
            </p>
          </>
        )}

        {/* Stage: Generating */}
        {stage === 'generating' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{progress}</p>
          </div>
        )}

        {/* Stage: Preview */}
        {stage === 'preview' && (
          <>
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
                <Input
                  placeholder="e.g., Add more detail about feeding schedules"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && feedback.trim() && handleRevise()}
                />
                <Button
                  variant="outline"
                  onClick={handleRevise}
                  disabled={!feedback.trim()}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Revise
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleBackToInput}>
                ← Back to notes
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
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{progress}</p>
          </div>
        )}

        {/* Stage: Done */}
        {stage === 'done' && (
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
