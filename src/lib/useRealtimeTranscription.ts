import { useState, useRef, useCallback } from 'react'
import { createTranscriptionSession, type TranscriptionSession } from './realtime-transcription'
import { getOpenAIKey } from '@/components/Credentials'

interface UseRealtimeTranscriptionOptions {
  /**
   * Called when transcript updates during recording.
   * @param newText - The newly transcribed text for this session
   * @param insertPosition - The cursor position where text should be inserted
   */
  onTranscriptInsert?: (newText: string, insertPosition: number) => void
}

interface UseRealtimeTranscriptionReturn {
  isRecording: boolean
  isConnecting: boolean
  isSpeaking: boolean
  error: string | null
  startRecording: (cursorPosition: number) => void
  stopRecording: () => void
}

/**
 * Hook for real-time transcription using OpenAI Realtime API.
 * 
 * Inserts text at the specified cursor position, preserving existing content.
 * Call startRecording(cursorPosition) with the textarea's selectionStart.
 */
export function useRealtimeTranscription(
  options: UseRealtimeTranscriptionOptions = {}
): UseRealtimeTranscriptionReturn {
  const { onTranscriptInsert } = options
  
  const [isRecording, setIsRecording] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const sessionRef = useRef<TranscriptionSession | null>(null)
  const transcriptRef = useRef<string>('')           // Accumulated transcript for this recording session
  const insertPositionRef = useRef<number>(0)        // Where to insert in the textarea
  const onTranscriptInsertRef = useRef(onTranscriptInsert)
  
  // Keep callback ref updated
  onTranscriptInsertRef.current = onTranscriptInsert

  const startRecording = useCallback((cursorPosition: number) => {
    const apiKey = getOpenAIKey()
    if (!apiKey) {
      setError('No OpenAI API key configured')
      return
    }

    setError(null)
    setIsConnecting(true)
    transcriptRef.current = ''                    // Reset transcript for THIS session
    insertPositionRef.current = cursorPosition    // Remember cursor position

    const session = createTranscriptionSession(apiKey, {
      onConnected: () => {
        setIsConnecting(false)
        setIsRecording(true)
      },
      onDisconnected: () => {
        setIsRecording(false)
        setIsConnecting(false)
        setIsSpeaking(false)
      },
      onError: (err) => {
        setError(err)
        setIsRecording(false)
        setIsConnecting(false)
      },
      onSpeechStarted: () => {
        setIsSpeaking(true)
      },
      onSpeechStopped: () => {
        setIsSpeaking(false)
      },
      onTranscriptDelta: (delta) => {
        transcriptRef.current += delta
        // Send the new text and where to insert it
        onTranscriptInsertRef.current?.(transcriptRef.current, insertPositionRef.current)
      },
      onTranscriptComplete: () => {
        // Utterance complete - add a space before the next one
        if (transcriptRef.current && !transcriptRef.current.endsWith(' ')) {
          transcriptRef.current += ' '
          onTranscriptInsertRef.current?.(transcriptRef.current, insertPositionRef.current)
        }
      },
    })

    sessionRef.current = session
  }, [])

  const stopRecording = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.disconnect()
      sessionRef.current = null
    }
    setIsRecording(false)
    setIsConnecting(false)
    setIsSpeaking(false)
  }, [])

  return {
    isRecording,
    isConnecting,
    isSpeaking,
    error,
    startRecording,
    stopRecording,
  }
}
