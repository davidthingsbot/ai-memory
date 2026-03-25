import { useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { findTopicLocation, type TopicResult } from '@/lib/topic-finder'
import { startRecording, stopRecording, cancelRecording, transcribeAudio } from '@/lib/audio-transcribe'
import { MessageSquare, Search, FileText, FilePlus, Loader2, Check, RotateCcw, Mic } from 'lucide-react'
import { WorkingBox } from './WorkingBox'

interface TopicFinderProps {
  repoName: string
  onLocationFound?: (result: TopicResult) => void
}

export function TopicFinder({ repoName, onLocationFound }: TopicFinderProps) {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<string[]>([])
  const [result, setResult] = useState<TopicResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Voice recording state
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recordingRef = useRef(false)
  const recordStartTime = useRef<number>(0)
  const isHoldMode = useRef(false) // true = hold-to-record, false = toggle

  const addStep = useCallback((step: string) => {
    setSteps(prev => [...prev, step])
  }, [])

  const handleSearch = useCallback(async (searchTopic?: string) => {
    const topicToSearch = searchTopic || topic
    if (!topicToSearch.trim()) return

    setLoading(true)
    setSteps([])
    setResult(null)
    setError(null)

    try {
      const location = await findTopicLocation(topicToSearch, addStep)
      addStep('✓ Analysis complete')
      setResult(location)
      onLocationFound?.(location)
    } catch (err) {
      console.error('Topic search failed:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [topic, onLocationFound, addStep])

  const handleReset = useCallback(() => {
    setResult(null)
    setError(null)
    setTopic('')
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault()
      handleSearch()
    }
  }

  // Voice recording handlers - supports both hold-to-record and tap-to-toggle
  const startRec = useCallback(async () => {
    try {
      setError(null)
      await startRecording()
      setRecording(true)
      recordingRef.current = true
      recordStartTime.current = Date.now()
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Could not access microphone. Please allow microphone access.')
    }
  }, [])

  const stopRec = useCallback(async (autoSearch = true) => {
    if (!recordingRef.current) return
    
    const duration = Date.now() - recordStartTime.current
    recordingRef.current = false
    setRecording(false)
    
    // If too short, cancel
    if (duration < 300) {
      cancelRecording()
      return
    }
    
    setTranscribing(true)
    setError(null)

    try {
      const audioBlob = await stopRecording()
      const text = await transcribeAudio(audioBlob)
      
      if (text.trim()) {
        setTopic(text)
        if (autoSearch) {
          handleSearch(text)
        }
      } else {
        setError('Could not understand audio. Please try again.')
      }
    } catch (err) {
      console.error('Transcription failed:', err)
      setError(err instanceof Error ? err.message : 'Transcription failed')
    } finally {
      setTranscribing(false)
    }
  }, [handleSearch])

  const handleMicClick = useCallback(async () => {
    if (loading || transcribing) return
    
    // If already recording (toggle mode), stop
    if (recordingRef.current) {
      isHoldMode.current = false
      await stopRec(true)
    } else {
      // Start recording
      isHoldMode.current = false
      await startRec()
    }
  }, [loading, transcribing, startRec, stopRec])

  const handleMicDown = useCallback(() => {
    // Mark as potentially hold mode
    isHoldMode.current = true
  }, [])

  const handleMicUp = useCallback(async () => {
    // Only stop if we're in hold mode and have been recording for > 300ms
    if (isHoldMode.current && recordingRef.current) {
      const duration = Date.now() - recordStartTime.current
      if (duration > 300) {
        await stopRec(true)
      }
      // If < 300ms, it was a tap - let the click handler deal with toggle
    }
  }, [stopRec])

  const handleMicLeave = useCallback(() => {
    // If mouse leaves while in hold mode, stop recording
    if (isHoldMode.current && recordingRef.current) {
      stopRec(true)
    }
  }, [stopRec])

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Topic
          {result && (
            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 ml-2">
              <Check className="h-3 w-3" /> Found
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Describe what you want to document. AI will find the best location in <code className="text-xs">{repoName}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result ? (
          // Show result
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              {/* Action type */}
              <div className="flex items-center gap-2">
                {result.action === 'create' ? (
                  <>
                    <FilePlus className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span className="font-medium">Create new file</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium">Update existing file</span>
                  </>
                )}
              </div>

              {/* Path */}
              <div>
                <p className="text-sm text-muted-foreground">Location:</p>
                <code className="text-sm font-mono bg-background px-2 py-1 rounded">
                  {result.path}
                </code>
              </div>

              {/* Reason */}
              <div>
                <p className="text-sm text-muted-foreground">Reasoning:</p>
                <p className="text-sm">{result.reason}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Different Topic
              </Button>
            </div>
          </div>
        ) : (
          // Show input
          <div className="space-y-4">
            <div className="flex gap-2">
              {/* Voice button - tap to toggle or hold to record */}
              <Button
                variant={recording ? "destructive" : "outline"}
                size="icon"
                disabled={loading || transcribing}
                onClick={handleMicClick}
                onMouseDown={handleMicDown}
                onMouseUp={handleMicUp}
                onMouseLeave={handleMicLeave}
                onTouchStart={(e) => { e.preventDefault(); handleMicDown(); handleMicClick(); }}
                onTouchEnd={(e) => { e.preventDefault(); handleMicUp(); }}
                className={`shrink-0 ${recording ? 'animate-pulse' : ''}`}
                title="Tap to start/stop or hold to record"
              >
                {transcribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className={`h-4 w-4 ${recording ? 'text-white' : ''}`} />
                )}
              </Button>

              <Input
                placeholder="e.g., How to prune apple trees"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || recording || transcribing}
                className="flex-1"
              />
              <Button 
                onClick={() => handleSearch()} 
                disabled={loading || !topic.trim() || recording || transcribing}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Recording indicator */}
            {recording && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                </span>
                Recording... Release to send
              </div>
            )}

            {/* Transcribing indicator */}
            {transcribing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing...
              </div>
            )}

            {/* Working box with steps */}
            <WorkingBox steps={steps} isWorking={loading} />

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Tap mic to start/stop recording, or hold to record. Type your topic if you prefer. The AI will explore your repository to find the best location.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export type { TopicResult }
