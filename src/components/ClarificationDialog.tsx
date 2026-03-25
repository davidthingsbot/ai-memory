/**
 * ClarificationDialog - Modal for AI to ask user questions
 * Has same controls as main input: voice, undo/redo, tidy, improve
 */

import { useState, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MicButton } from '@/components/MicButton'
import { useRealtimeTranscription } from '@/lib/useRealtimeTranscription'
import { tidyText, improveText } from '@/lib/text-tools'
import { Undo2, Redo2, Send } from 'lucide-react'

interface ClarificationDialogProps {
  open: boolean
  question: string
  onAnswer: (answer: string) => void
  onCancel: () => void
  context?: {
    filePath?: string
    fileContent?: string
    repoName?: string
  }
}

export function ClarificationDialog({ 
  open, 
  question, 
  onAnswer, 
  onCancel,
  context 
}: ClarificationDialogProps) {
  const [answer, setAnswer] = useState('')
  const [isWorking, setIsWorking] = useState(false)
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [redoStack, setRedoStack] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

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
      
      // Remove selected text if any
      if (start !== end) {
        setAnswer(prev => prev.slice(0, start) + prev.slice(end))
      }
      
      transcription.startRecording(start)
    } else {
      transcription.stopRecording()
    }
  }, [transcription, updateSelection])

  // Undo/redo
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev, answer])
    setRedoStack([])
  }, [answer])

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

  // Tidy
  const handleTidy = useCallback(async () => {
    if (!answer.trim() || isWorking) return
    pushUndo()
    setIsWorking(true)
    try {
      const result = await tidyText(answer, undefined, context)
      if (result.type === 'result') {
        setAnswer(result.content)
      }
      // Ignore clarification requests in the dialog itself
    } catch (err) {
      console.error('Tidy failed:', err)
    }
    setIsWorking(false)
  }, [answer, isWorking, pushUndo, context])

  // Improve
  const handleImprove = useCallback(async () => {
    if (!answer.trim() || isWorking) return
    pushUndo()
    setIsWorking(true)
    try {
      const result = await improveText(answer, undefined, context)
      if (result.type === 'result') {
        setAnswer(result.content)
      }
      // Ignore clarification requests in the dialog itself
    } catch (err) {
      console.error('Improve failed:', err)
    }
    setIsWorking(false)
  }, [answer, isWorking, pushUndo, context])

  // Submit
  const handleSubmit = useCallback(() => {
    if (answer.trim()) {
      onAnswer(answer.trim())
      setAnswer('')
      setUndoStack([])
      setRedoStack([])
    }
  }, [answer, onAnswer])

  // Reset on close
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onCancel()
      setAnswer('')
      setUndoStack([])
      setRedoStack([])
    }
  }, [onCancel])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Clarification Needed</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* AI's question */}
          <div className="bg-muted p-3 rounded-lg text-sm">
            {question}
          </div>

          {/* Answer input */}
          <Textarea
            ref={textareaRef}
            value={answer}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAnswer(e.target.value)}
            onSelect={updateSelection}
            onClick={updateSelection}
            onKeyUp={updateSelection}
            placeholder="Type or speak your answer..."
            className="min-h-[100px] resize-none"
            disabled={isWorking || transcription.isRecording}
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
              size="sm"
              onClick={handleTidy}
              disabled={!answer.trim() || isWorking || transcription.isRecording}
            >
              Tidy
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleImprove}
              disabled={!answer.trim() || isWorking || transcription.isRecording}
            >
              Improve
            </Button>

            <div className="flex-1" />

            <Button
              onClick={handleSubmit}
              disabled={!answer.trim() || isWorking || transcription.isRecording}
            >
              <Send className="h-4 w-4 mr-2" />
              Answer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
