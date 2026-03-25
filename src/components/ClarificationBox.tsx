/**
 * ClarificationBox - Inline box for AI to ask user questions
 * Matches WorkingBox styling. Collapsible after answering.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MicButton } from '@/components/MicButton'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { 
  ChevronDown, ChevronRight, HelpCircle, Send, SkipForward,
  Undo2, Redo2 
} from 'lucide-react'

interface ClarificationBoxProps {
  question: string
  onAnswer: (answer: string) => void
  onSkip: () => void
}

export function ClarificationBox({ question, onAnswer, onSkip }: ClarificationBoxProps) {
  const [answer, setAnswer] = useState('')
  const [isExpanded, setIsExpanded] = useState(true)
  const [isAnswered, setIsAnswered] = useState(false)
  const [submittedAnswer, setSubmittedAnswer] = useState('')
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [redoStack, setRedoStack] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  // Auto-expand when question arrives
  useEffect(() => {
    setIsExpanded(true)
    setIsAnswered(false)
    setAnswer('')
    setSubmittedAnswer('')
  }, [question])

  // Track selection for voice insertion
  const updateSelection = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      lastSelectionRef.current = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      }
    }
  }, [])

  // Voice transcription
  const transcription = useRealtimeTranscription({
    onTranscriptInsert: (newText, insertPos) => {
      setAnswer(prev => {
        const before = prev.slice(0, insertPos)
        const after = prev.slice(insertPos)
        return before + newText + after
      })
    },
  })

  const handleRecordingChange = useCallback((recording: boolean) => {
    if (recording) {
      updateSelection()
      const { start, end } = lastSelectionRef.current
      if (start !== end) {
        setAnswer(prev => prev.slice(0, start) + prev.slice(end))
      }
      transcription.startRecording(start)
    } else {
      transcription.stopRecording()
    }
  }, [transcription, answer, updateSelection])

  // Undo/redo
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const previous = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, answer])
    setAnswer(previous)
  }, [undoStack, answer])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, answer])
    setAnswer(next)
  }, [redoStack, answer])

  // Submit answer
  const handleSubmit = useCallback(() => {
    if (answer.trim()) {
      setSubmittedAnswer(answer.trim())
      setIsAnswered(true)
      setIsExpanded(false)
      onAnswer(answer.trim())
    }
  }, [answer, onAnswer])

  // Skip without answering
  const handleSkip = useCallback(() => {
    setSubmittedAnswer('(skipped)')
    setIsAnswered(true)
    setIsExpanded(false)
    onSkip()
  }, [onSkip])

  if (!question) return null

  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left bg-amber-100/50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <HelpCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex-1">
          {isAnswered ? 'Clarification Answered' : 'Clarification Needed'}
        </span>
        {isAnswered && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {submittedAnswer}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 border-t border-amber-500/30 space-y-3">
          {/* Question */}
          <div className="text-sm bg-white/50 dark:bg-black/20 p-2 rounded border border-amber-200 dark:border-amber-800">
            {question}
          </div>

          {!isAnswered && (
            <>
              {/* Answer input */}
              <Textarea
                ref={textareaRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onSelect={updateSelection}
                onClick={updateSelection}
                onKeyUp={updateSelection}
                placeholder="Type or speak your answer..."
                className="min-h-[80px] resize-none text-sm"
                disabled={transcription.isRecording}
              />

              {/* Controls */}
              <div className="flex gap-2 flex-wrap items-center">
                <MicButton
                  recording={transcription.isRecording}
                  transcribing={transcription.isConnecting}
                  onRecordingChange={handleRecordingChange}
                  size="sm"
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  title="Undo"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  title="Redo"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>

                <div className="flex-1" />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkip}
                  title="Skip this question and proceed without clarification"
                >
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip
                </Button>

                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!answer.trim() || transcription.isRecording}
                >
                  <Send className="h-4 w-4 mr-1" />
                  Answer
                </Button>
              </div>
            </>
          )}

          {isAnswered && submittedAnswer !== '(skipped)' && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Your answer:</span> {submittedAnswer}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
